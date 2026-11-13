<?php

/**
 * Centralized Room Status Management Service
 *
 * Operational Status Priority (highest to lowest):
 *   1. occupied    - A guest has an active booking with status = 'checked_in'.
 *   2. maintenance - An active maintenance request ('open', 'assigned', 'in_progress') exists,
 *                    or the room is manually placed in maintenance.
 *   3. cleaning    - An active housekeeping task ('pending', 'in_progress') exists,
 *                    or the room is awaiting housekeeping completion.
 *   4. available   - None of the above conditions apply.
 */
class RoomStatusService
{
    public const ACTIVE_MAINTENANCE_STATUSES = ['open', 'assigned', 'in_progress'];
    public const ACTIVE_HOUSEKEEPING_STATUSES = ['pending', 'in_progress'];

    /**
     * Recompute and persist the physical status for a single room according to priority rules.
     *
     * Options:
     *   - allowCleaningRelease (bool): allow transitioning from 'cleaning' -> 'available' when no active task remains.
     *   - allowMaintenanceRelease (bool): allow transitioning from 'maintenance' -> lower priority when no open request remains.
     */
    public static function syncRoomStatus(mysqli $conn, int $roomId, array $options = []): ?string
    {
        if ($roomId <= 0) {
            return null;
        }

        $stmt = $conn->prepare("SELECT status FROM rooms WHERE id = ?");
        if (!$stmt) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare room status query');
        }
        $stmt->bind_param('i', $roomId);
        if (!$stmt->execute()) {
            throw new RuntimeException($stmt->error ?: 'Failed to query room status');
        }
        $room = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$room) {
            return null;
        }

        $currentStatus = $room['status'];
        $allowCleaningRelease = !empty($options['allowCleaningRelease']);
        $allowMaintenanceRelease = !empty($options['allowMaintenanceRelease']);

        // 1. Highest priority: checked_in guest
        $hasCheckedIn = self::hasCheckedInBooking($conn, $roomId);
        if ($hasCheckedIn) {
            return self::persistStatus($conn, $roomId, $currentStatus, 'occupied');
        }

        // 2. Second priority: active maintenance request (or preserved manual maintenance)
        $hasActiveMaintenance = self::hasActiveMaintenance($conn, $roomId);
        if ($hasActiveMaintenance || ($currentStatus === 'maintenance' && !$allowMaintenanceRelease)) {
            return self::persistStatus($conn, $roomId, $currentStatus, 'maintenance');
        }

        // 3. Third priority: active housekeeping task (or preserved cleaning state)
        $hasActiveHousekeeping = self::hasActiveHousekeeping($conn, $roomId);
        if ($hasActiveHousekeeping || ($currentStatus === 'cleaning' && !$allowCleaningRelease)) {
            return self::persistStatus($conn, $roomId, $currentStatus, 'cleaning');
        }

        // 4. Default: available
        return self::persistStatus($conn, $roomId, $currentStatus, 'available');
    }

    /**
     * Heal rooms marked 'occupied' that no longer have a 'checked_in' booking,
     * respecting maintenance and cleaning priorities rather than blindly forcing 'available'.
     */
    public static function autoHealRooms(mysqli $conn): void
    {
        self::reconcileAllRooms($conn);
    }

    /**
     * Administrative reconciliation job: scans all rooms and re-synchronizes statuses
     * according to authoritative bookings, active maintenance, and housekeeping tasks.
     * Returns the count of rooms processed.
     */
    public static function reconcileAllRooms(mysqli $conn): int
    {
        $res = $conn->query("SELECT r.id
            FROM rooms r
            WHERE r.status = 'occupied'
            AND NOT EXISTS (
                SELECT 1 FROM bookings b
                WHERE b.room_id = r.id
                AND b.status = 'checked_in'
                AND b.deleted_at IS NULL
            )");
        if (!$res) {
            return 0;
        }
        $count = 0;
        while ($row = $res->fetch_assoc()) {
            self::syncRoomStatus($conn, (int) $row['id']);
            $count++;
        }
        return $count;
    }

    /**
     * Transition room to 'occupied' when a guest physically checks in.
     */
    public static function handleCheckIn(mysqli $conn, int $roomId): string
    {
        if ($roomId <= 0) {
            return 'available';
        }
        $upd = $conn->prepare("UPDATE rooms SET status = 'occupied' WHERE id = ?");
        if (!$upd) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare check-in room update');
        }
        $upd->bind_param('i', $roomId);
        if (!$upd->execute()) {
            throw new RuntimeException($upd->error ?: 'Failed to update room status on check-in');
        }
        $upd->close();
        return 'occupied';
    }

    /**
     * Handle room status and automatic housekeeping task creation on guest checkout.
     * Returns ['room_status' => string, 'housekeeping_task_id' => int|null].
     */
    public static function handleCheckout(
        mysqli $conn,
        int $roomId,
        int $bookingId,
        string $roomNumber = '',
        string $guestName = ''
    ): array {
        if ($roomId <= 0) {
            return ['room_status' => null, 'housekeeping_task_id' => null];
        }

        $taskId = self::createCheckoutHousekeepingTask($conn, $roomId, $bookingId, $roomNumber, $guestName);

        // Reconcile room status: if maintenance is already active it stays 'maintenance',
        // otherwise the new pending housekeeping task sets it to 'cleaning'.
        $roomStatus = self::syncRoomStatus($conn, $roomId);

        return [
            'room_status' => $roomStatus,
            'housekeeping_task_id' => $taskId,
        ];
    }

    /**
     * Synchronize room status after a housekeeping task is created, updated, or deleted.
     */
    public static function onHousekeepingUpdated(mysqli $conn, int $roomId, string $taskStatus = ''): ?string
    {
        if ($roomId <= 0) {
            return null;
        }

        $isRelease = in_array($taskStatus, ['completed', 'skipped', 'deleted'], true);
        return self::syncRoomStatus($conn, $roomId, [
            'allowCleaningRelease' => $isRelease,
        ]);
    }

    /**
     * Synchronize room status after a maintenance request is created, updated, or resolved.
     */
    public static function onMaintenanceUpdated(mysqli $conn, int $roomId, string $requestStatus = ''): ?string
    {
        if ($roomId <= 0) {
            return null;
        }

        $isRelease = in_array($requestStatus, ['resolved', 'closed', 'deleted'], true);
        return self::syncRoomStatus($conn, $roomId, [
            'allowMaintenanceRelease' => $isRelease,
        ]);
    }

    private static function createCheckoutHousekeepingTask(
        mysqli $conn,
        int $roomId,
        int $bookingId,
        string $roomNumber,
        string $guestName
    ): ?int {
        $today = date('Y-m-d');
        $notePrefix = "Checkout cleaning - Booking #{$bookingId}";

        // Avoid duplicate pending/in_progress checkout task for the same booking
        $chk = $conn->prepare("SELECT id FROM housekeeping_tasks WHERE room_id = ? AND status IN ('pending', 'in_progress') AND notes LIKE ? LIMIT 1");
        if ($chk) {
            $like = $notePrefix . '%';
            $chk->bind_param('is', $roomId, $like);
            if ($chk->execute()) {
                $existing = $chk->get_result()->fetch_assoc();
                if ($existing) {
                    $chk->close();
                    return (int) $existing['id'];
                }
            }
            $chk->close();
        }

        $roomLabel = $roomNumber !== '' ? "Room {$roomNumber}" : "Room #{$roomId}";
        $guestPart = $guestName !== '' ? " | Guest: {$guestName}" : '';
        $notes = "{$notePrefix} ({$roomLabel}{$guestPart})";
        $taskType = 'cleaning';
        $priority = 'high';
        $status = 'pending';

        $ins = $conn->prepare("INSERT INTO housekeeping_tasks (room_id, assigned_to, task_type, priority, status, notes, scheduled_date) VALUES (?, NULL, ?, ?, ?, ?, ?)");
        if (!$ins) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare housekeeping task creation');
        }
        $ins->bind_param('isssss', $roomId, $taskType, $priority, $status, $notes, $today);
        if (!$ins->execute()) {
            throw new RuntimeException($ins->error ?: 'Failed to create checkout housekeeping task');
        }
        $taskId = (int) $conn->insert_id;
        $ins->close();
        return $taskId;
    }

    private static function hasCheckedInBooking(mysqli $conn, int $roomId): bool
    {
        $stmt = $conn->prepare("SELECT 1 FROM bookings WHERE room_id = ? AND status = 'checked_in' AND deleted_at IS NULL LIMIT 1");
        if (!$stmt) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare checked-in booking query');
        }
        $stmt->bind_param('i', $roomId);
        if (!$stmt->execute()) {
            throw new RuntimeException($stmt->error ?: 'Failed to check occupied booking');
        }
        $exists = (bool) $stmt->get_result()->fetch_row();
        $stmt->close();
        return $exists;
    }

    private static function hasActiveMaintenance(mysqli $conn, int $roomId): bool
    {
        $stmt = $conn->prepare("SELECT 1 FROM maintenance_requests WHERE room_id = ? AND status IN ('open', 'assigned', 'in_progress') LIMIT 1");
        if (!$stmt) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare maintenance query');
        }
        $stmt->bind_param('i', $roomId);
        if (!$stmt->execute()) {
            throw new RuntimeException($stmt->error ?: 'Failed to check active maintenance');
        }
        $exists = (bool) $stmt->get_result()->fetch_row();
        $stmt->close();
        return $exists;
    }

    private static function hasActiveHousekeeping(mysqli $conn, int $roomId): bool
    {
        $stmt = $conn->prepare("SELECT 1 FROM housekeeping_tasks WHERE room_id = ? AND status IN ('pending', 'in_progress') LIMIT 1");
        if (!$stmt) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare housekeeping query');
        }
        $stmt->bind_param('i', $roomId);
        if (!$stmt->execute()) {
            throw new RuntimeException($stmt->error ?: 'Failed to check active housekeeping');
        }
        $exists = (bool) $stmt->get_result()->fetch_row();
        $stmt->close();
        return $exists;
    }

    private static function persistStatus(mysqli $conn, int $roomId, string $currentStatus, string $targetStatus): string
    {
        if ($currentStatus === $targetStatus) {
            return $targetStatus;
        }
        $upd = $conn->prepare("UPDATE rooms SET status = ? WHERE id = ?");
        if (!$upd) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare room status update');
        }
        $upd->bind_param('si', $targetStatus, $roomId);
        if (!$upd->execute()) {
            throw new RuntimeException($upd->error ?: 'Failed to update room status');
        }
        $upd->close();
        return $targetStatus;
    }
}


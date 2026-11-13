<?php

/**
 * Centralized Soft Delete & Financial Audit Protection Service
 *
 * Replaces destructive hard deletions and FOREIGN_KEY_CHECKS=0 workarounds with:
 *   - Soft deletion (deleted_at, deleted_by) for bookings and users/guests
 *   - Permanent preservation of payments and invoices
 *   - Admin-only archival viewing and restoration (restored_at, restored_by)
 *   - Immutable soft_delete_audit_log entries recording who deleted/restored and when
 */
class SoftDeleteService
{
    public static function ensureSchema(mysqli $conn): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }

        // Fast read-only check so normal API requests never execute DDL (ALTER/CREATE)
        $colRes = $conn->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN ('bookings', 'users')
               AND COLUMN_NAME IN ('deleted_at', 'deleted_by', 'restored_at', 'restored_by')"
        );
        $colCount = $colRes ? (int) ($colRes->fetch_assoc()['cnt'] ?? 0) : 0;

        $tblRes = $conn->query(
            "SELECT 1 FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'soft_delete_audit_log'
             LIMIT 1"
        );
        $tblExists = $tblRes && (bool) $tblRes->fetch_row();

        $idxRes = $conn->query(
            "SELECT COUNT(DISTINCT TABLE_NAME, INDEX_NAME) AS cnt FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND ((TABLE_NAME = 'bookings' AND INDEX_NAME = 'idx_bookings_deleted_at')
                 OR (TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_deleted_at'))"
        );
        $idxCount = $idxRes ? (int) ($idxRes->fetch_assoc()['cnt'] ?? 0) : 0;

        if ($colCount === 8 && $tblExists && $idxCount === 2) {
            $ensured = true;
            return;
        }

        // Idempotent column additions on bookings & users (preserves all existing rows)
        $conn->query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL");
        $conn->query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_by INT NULL DEFAULT NULL");
        $conn->query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS restored_at TIMESTAMP NULL DEFAULT NULL");
        $conn->query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS restored_by INT NULL DEFAULT NULL");

        $conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL");
        $conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by INT NULL DEFAULT NULL");
        $conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS restored_at TIMESTAMP NULL DEFAULT NULL");
        $conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS restored_by INT NULL DEFAULT NULL");

        self::ensureIndex($conn, 'bookings', 'idx_bookings_deleted_at', '(`deleted_at`)');
        self::ensureIndex($conn, 'users', 'idx_users_deleted_at', '(`deleted_at`)');

        $conn->query("CREATE TABLE IF NOT EXISTS soft_delete_audit_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            entity_type ENUM('booking','user','guest') NOT NULL,
            entity_id INT NOT NULL,
            action ENUM('soft_delete','restore') NOT NULL,
            performed_by INT NULL,
            performed_by_role VARCHAR(32) NULL,
            notes VARCHAR(255) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_sdal_entity (entity_type, entity_id),
            INDEX idx_sdal_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $ensured = true;
    }

    private static function ensureIndex(mysqli $conn, string $table, string $indexName, string $cols): void
    {
        $stmt = $conn->prepare("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1");
        if ($stmt) {
            $stmt->bind_param('ss', $table, $indexName);
            $stmt->execute();
            $exists = (bool) $stmt->get_result()->fetch_row();
            $stmt->close();
            if (!$exists) {
                $conn->query("ALTER TABLE `$table` ADD INDEX `$indexName` $cols");
            }
        }
    }

    public static function recordAudit(
        mysqli $conn,
        string $entityType,
        int $entityId,
        string $action,
        ?int $actorId,
        string $actorRole,
        string $notes = ''
    ): void {
        $stmt = $conn->prepare("INSERT INTO soft_delete_audit_log (entity_type, entity_id, action, performed_by, performed_by_role, notes) VALUES (?, ?, ?, ?, ?, ?)");
        if (!$stmt) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare soft delete audit insert');
        }
        $stmt->bind_param('sisiss', $entityType, $entityId, $action, $actorId, $actorRole, $notes);
        if (!$stmt->execute()) {
            throw new RuntimeException($stmt->error ?: 'Failed to write soft delete audit log');
        }
        $stmt->close();
    }

    /**
     * Soft-delete a booking without deleting payments or invoices.
     */
    public static function softDeleteBooking(
        mysqli $conn,
        int $bookingId,
        int $actorId,
        string $actorRole
    ): array {
        $conn->query("SET SESSION innodb_lock_wait_timeout = 10");
        $conn->begin_transaction();
        try {
            $bLock = $conn->prepare("SELECT id, room_id, status, deleted_at FROM bookings WHERE id = ? FOR UPDATE");
            if (!$bLock) throw new RuntimeException($conn->error);
            $bLock->bind_param('i', $bookingId);
            if (!$bLock->execute()) throw new RuntimeException($bLock->error ?: 'Failed to lock booking');
            $booking = $bLock->get_result()->fetch_assoc();
            $bLock->close();

            if (!$booking) {
                $conn->rollback();
                return ['ok' => false, 'code' => 404, 'error' => 'Booking not found'];
            }
            if ($booking['deleted_at'] !== null) {
                $conn->rollback();
                return ['ok' => false, 'code' => 409, 'error' => 'Booking is already archived'];
            }

            $roomId = (int) ($booking['room_id'] ?? 0);
            if ($roomId > 0) {
                $rLock = $conn->prepare("SELECT id FROM rooms WHERE id = ? FOR UPDATE");
                if ($rLock) {
                    $rLock->bind_param('i', $roomId);
                    $rLock->execute();
                    $rLock->get_result()->fetch_assoc();
                    $rLock->close();
                }
            }

            $upd = $conn->prepare("UPDATE bookings SET deleted_at = NOW(), deleted_by = ? WHERE id = ?");
            if (!$upd) throw new RuntimeException($conn->error);
            $upd->bind_param('ii', $actorId, $bookingId);
            if (!$upd->execute()) throw new RuntimeException($upd->error ?: 'Failed to archive booking');
            $upd->close();

            self::recordAudit($conn, 'booking', $bookingId, 'soft_delete', $actorId, $actorRole, 'Booking archived; financial records preserved');

            if ($roomId > 0) {
                syncRoomStatus($conn, $roomId);
            }

            $conn->commit();
            return ['ok' => true, 'code' => 200, 'message' => 'Booking archived safely. Payment and invoice history preserved.'];
        } catch (\Throwable $e) {
            $conn->rollback();
            return ['ok' => false, 'code' => 500, 'error' => 'Failed to archive booking: ' . $e->getMessage()];
        }
    }

    /**
     * Restore a soft-deleted booking (Admin only), re-checking room overlap for active bookings.
     */
    public static function restoreBooking(
        mysqli $conn,
        int $bookingId,
        int $actorId,
        string $actorRole
    ): array {
        $conn->query("SET SESSION innodb_lock_wait_timeout = 10");
        $conn->begin_transaction();
        try {
            $bLock = $conn->prepare("SELECT id, room_id, status, check_in, check_out, deleted_at FROM bookings WHERE id = ? FOR UPDATE");
            if (!$bLock) throw new RuntimeException($conn->error);
            $bLock->bind_param('i', $bookingId);
            if (!$bLock->execute()) throw new RuntimeException($bLock->error ?: 'Failed to lock booking');
            $booking = $bLock->get_result()->fetch_assoc();
            $bLock->close();

            if (!$booking) {
                $conn->rollback();
                return ['ok' => false, 'code' => 404, 'error' => 'Booking not found'];
            }
            if ($booking['deleted_at'] === null) {
                $conn->rollback();
                return ['ok' => false, 'code' => 409, 'error' => 'Booking is not archived'];
            }

            $roomId = (int) ($booking['room_id'] ?? 0);
            if ($roomId > 0) {
                $rLock = $conn->prepare("SELECT id, status FROM rooms WHERE id = ? FOR UPDATE");
                if ($rLock) {
                    $rLock->bind_param('i', $roomId);
                    $rLock->execute();
                    $rRow = $rLock->get_result()->fetch_assoc();
                    $rLock->close();
                    if (!$rRow) {
                        $conn->rollback();
                        return ['ok' => false, 'code' => 400, 'error' => 'Associated room no longer exists'];
                    }
                }

                if (in_array($booking['status'], ['pending', 'confirmed', 'checked_in'], true)) {
                    if (roomHasOverlap($conn, $roomId, $booking['check_in'], $booking['check_out'], $bookingId, true)) {
                        $conn->rollback();
                        return ['ok' => false, 'code' => 409, 'error' => 'Cannot restore booking: room is already booked for overlapping dates.'];
                    }
                }
            }

            $upd = $conn->prepare("UPDATE bookings SET deleted_at = NULL, restored_at = NOW(), restored_by = ? WHERE id = ?");
            if (!$upd) throw new RuntimeException($conn->error);
            $upd->bind_param('ii', $actorId, $bookingId);
            if (!$upd->execute()) throw new RuntimeException($upd->error ?: 'Failed to restore booking');
            $upd->close();

            self::recordAudit($conn, 'booking', $bookingId, 'restore', $actorId, $actorRole, 'Booking restored by administrator');

            if ($roomId > 0) {
                syncRoomStatus($conn, $roomId);
            }

            $conn->commit();
            return ['ok' => true, 'code' => 200, 'message' => 'Booking restored successfully.'];
        } catch (\Throwable $e) {
            $conn->rollback();
            return ['ok' => false, 'code' => 500, 'error' => 'Failed to restore booking: ' . $e->getMessage()];
        }
    }

    /**
     * Soft-delete a user or guest account while preserving all bookings, payments, and invoices.
     * Active/future non-completed bookings are also soft-deleted so they do not block rooms.
     */
    public static function softDeleteUser(
        mysqli $conn,
        int $targetUserId,
        ?int $actorId = null,
        string $actorRole = 'system'
    ): array {
        if ($targetUserId <= 0) {
            return ['success' => false, 'code' => 400, 'error' => 'Invalid user ID'];
        }

        $conn->query("SET SESSION innodb_lock_wait_timeout = 10");
        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("SELECT id, name, email, role, deleted_at FROM users WHERE id = ? FOR UPDATE");
            if (!$stmt) throw new RuntimeException($conn->error);
            $stmt->bind_param('i', $targetUserId);
            if (!$stmt->execute()) throw new RuntimeException($stmt->error ?: 'Failed to query user');
            $targetUser = $stmt->get_result()->fetch_assoc();
            $stmt->close();

            if (!$targetUser) {
                $conn->rollback();
                return ['success' => false, 'code' => 404, 'error' => 'User not found'];
            }
            if ($targetUser['deleted_at'] !== null) {
                $conn->rollback();
                return ['success' => false, 'code' => 409, 'error' => 'User is already archived'];
            }
            if ($targetUser['email'] === 'befather7@gmail.com') {
                $conn->rollback();
                return ['success' => false, 'code' => 403, 'error' => 'The primary Administrator account cannot be deleted'];
            }

            // Reject deletion while a checked-in booking is active so occupied rooms are never freed/orphaned
            $ciChk = $conn->prepare("SELECT id FROM bookings WHERE customer_id = ? AND deleted_at IS NULL AND status = 'checked_in' LIMIT 1 FOR UPDATE");
            if (!$ciChk) throw new RuntimeException($conn->error);
            $ciChk->bind_param('i', $targetUserId);
            if (!$ciChk->execute()) throw new RuntimeException($ciChk->error ?: 'Failed to check active checked-in bookings');
            $hasCheckedIn = (bool) $ciChk->get_result()->fetch_row();
            $ciChk->close();
            if ($hasCheckedIn) {
                $conn->rollback();
                return [
                    'success' => false,
                    'code' => 409,
                    'error' => 'Cannot archive user/guest while a checked-in booking is active. Please check out the guest first.',
                ];
            }

            $entityType = ($targetUser['role'] === 'customer') ? 'guest' : 'user';

            // Archive user and deactivate status so authentication is blocked
            $updUser = $conn->prepare("UPDATE users SET deleted_at = NOW(), deleted_by = ?, status = 'inactive' WHERE id = ?");
            if (!$updUser) throw new RuntimeException($conn->error);
            $updUser->bind_param('ii', $actorId, $targetUserId);
            if (!$updUser->execute()) throw new RuntimeException($updUser->error ?: 'Failed to archive user');
            $updUser->close();

            // Soft-delete any pending/confirmed bookings so they no longer block room availability
            // (preserving completed/checked_out/cancelled bookings, and preserving all payments & invoices)
            $bStmt = $conn->prepare("SELECT id, room_id FROM bookings WHERE customer_id = ? AND deleted_at IS NULL AND status IN ('pending', 'confirmed') FOR UPDATE");
            if (!$bStmt) throw new RuntimeException($conn->error);
            $bStmt->bind_param('i', $targetUserId);
            if (!$bStmt->execute()) throw new RuntimeException($bStmt->error ?: 'Failed to query user bookings');
            $activeBookings = $bStmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $bStmt->close();

            $affectedRoomIds = [];
            foreach ($activeBookings as $b) {
                $bid = (int) $b['id'];
                $rid = (int) ($b['room_id'] ?? 0);
                if ($rid > 0) {
                    $affectedRoomIds[$rid] = true;
                }
                $archB = $conn->prepare("UPDATE bookings SET deleted_at = NOW(), deleted_by = ? WHERE id = ?");
                if ($archB) {
                    $archB->bind_param('ii', $actorId, $bid);
                    $archB->execute();
                    $archB->close();
                }
                self::recordAudit($conn, 'booking', $bid, 'soft_delete', $actorId, $actorRole, "Archived with {$entityType} #{$targetUserId}");
            }

            self::recordAudit($conn, $entityType, $targetUserId, 'soft_delete', $actorId, $actorRole, "Archived {$entityType} ({$targetUser['email']}); financial history preserved");

            foreach (array_keys($affectedRoomIds) as $roomId) {
                syncRoomStatus($conn, $roomId);
            }

            $conn->commit();
            return [
                'success' => true,
                'code' => 200,
                'message' => "{$targetUser['name']} archived safely. All financial, invoice, and payment history preserved.",
            ];
        } catch (\Throwable $e) {
            $conn->rollback();
            return ['success' => false, 'code' => 500, 'error' => 'Failed to archive user: ' . $e->getMessage()];
        }
    }

    /**
     * Restore a soft-deleted user or guest (Admin only).
     */
    public static function restoreUser(
        mysqli $conn,
        int $targetUserId,
        int $actorId,
        string $actorRole
    ): array {
        $conn->query("SET SESSION innodb_lock_wait_timeout = 10");
        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("SELECT id, name, email, role, deleted_at FROM users WHERE id = ? FOR UPDATE");
            if (!$stmt) throw new RuntimeException($conn->error);
            $stmt->bind_param('i', $targetUserId);
            if (!$stmt->execute()) throw new RuntimeException($stmt->error ?: 'Failed to query user');
            $targetUser = $stmt->get_result()->fetch_assoc();
            $stmt->close();

            if (!$targetUser) {
                $conn->rollback();
                return ['ok' => false, 'code' => 404, 'error' => 'User not found'];
            }
            if ($targetUser['deleted_at'] === null) {
                $conn->rollback();
                return ['ok' => false, 'code' => 409, 'error' => 'User is not archived'];
            }

            $upd = $conn->prepare("UPDATE users SET deleted_at = NULL, restored_at = NOW(), restored_by = ?, status = 'active' WHERE id = ?");
            if (!$upd) throw new RuntimeException($conn->error);
            $upd->bind_param('ii', $actorId, $targetUserId);
            if (!$upd->execute()) throw new RuntimeException($upd->error ?: 'Failed to restore user');
            $upd->close();

            $entityType = ($targetUser['role'] === 'customer') ? 'guest' : 'user';
            self::recordAudit($conn, $entityType, $targetUserId, 'restore', $actorId, $actorRole, "Restored {$entityType} by administrator");

            $conn->commit();
            return ['ok' => true, 'code' => 200, 'message' => "{$targetUser['name']} restored successfully."];
        } catch (\Throwable $e) {
            $conn->rollback();
            return ['ok' => false, 'code' => 500, 'error' => 'Failed to restore user: ' . $e->getMessage()];
        }
    }
}


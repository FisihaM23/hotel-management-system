<?php

/**
 * Centralized Booking State Machine & Transition Audit Logger
 *
 * Booking Statuses:
 *   - pending     : Created without payment/deposit; awaiting payment or confirmation.
 *   - confirmed   : Deposit/payment received or confirmed by staff; awaiting guest arrival.
 *   - checked_in  : Guest has physically checked into the room.
 *   - checked_out : Guest has checked out and stay is completed (terminal).
 *   - cancelled   : Reservation was cancelled (terminal).
 */
class BookingStateMachine
{
    public const STATUSES = [
        'pending',
        'confirmed',
        'checked_in',
        'checked_out',
        'cancelled',
    ];

    public const TERMINAL_STATUSES = [
        'checked_out',
        'cancelled',
    ];

    public const ALLOWED_TRANSITIONS = [
        'pending'     => ['confirmed', 'checked_in', 'cancelled'],
        'confirmed'   => ['checked_in', 'cancelled'],
        'checked_in'  => ['checked_out'],
        'checked_out' => [],
        'cancelled'   => [],
    ];

    public static function isValidStatus(string $status): bool
    {
        return in_array($status, self::STATUSES, true);
    }

    /**
     * Validate a booking status transition and return ['ok' => bool, 'error' => ?string, 'code' => int].
     */
    public static function validateTransition(
        string $fromStatus,
        string $toStatus,
        array $context = []
    ): array {
        if (!self::isValidStatus($fromStatus)) {
            return ['ok' => false, 'code' => 400, 'error' => "Unknown current booking status: '$fromStatus'."];
        }
        if (!self::isValidStatus($toStatus)) {
            return ['ok' => false, 'code' => 400, 'error' => "Invalid target booking status: '$toStatus'."];
        }

        // Same-status updates (e.g., editing dates/guests without changing status)
        if ($fromStatus === $toStatus) {
            if (!empty($context['is_action']) && in_array($fromStatus, array_merge(self::TERMINAL_STATUSES, ['checked_in']), true)) {
                return [
                    'ok' => false,
                    'code' => 409,
                    'error' => "Booking is already '$fromStatus' and cannot perform this action again.",
                ];
            }
            return ['ok' => true, 'code' => 200, 'error' => null];
        }

        $allowed = self::ALLOWED_TRANSITIONS[$fromStatus] ?? [];
        if (!in_array($toStatus, $allowed, true)) {
            if ($toStatus === 'checked_out') {
                return [
                    'ok' => false,
                    'code' => 409,
                    'error' => "Cannot check out a booking with status '$fromStatus'. Only 'checked_in' bookings can be checked out.",
                ];
            }
            if ($toStatus === 'checked_in') {
                return [
                    'ok' => false,
                    'code' => 409,
                    'error' => "Cannot check in a booking with status '$fromStatus'. Only 'pending' or 'confirmed' bookings can be checked in.",
                ];
            }
            $allowedText = empty($allowed) ? 'none (terminal state)' : implode(', ', $allowed);
            return [
                'ok' => false,
                'code' => 409,
                'error' => "Invalid booking transition from '$fromStatus' to '$toStatus'. Allowed transitions: $allowedText.",
            ];
        }

        // Payment policy enforcement on check-in:
        // Partial payment / deposit OR pay-at-hotel payment collected at check-in is sufficient,
        // but completely unpaid bookings (total > 0 and paid + check-in payment <= 0) cannot check in.
        if ($toStatus === 'checked_in') {
            $totalAmount = (float) ($context['total_amount'] ?? 0);
            $paidAmount = (float) ($context['paid_amount'] ?? 0);
            $checkInPayment = (float) ($context['check_in_payment'] ?? 0);
            if ($totalAmount > 0.01 && ($paidAmount + $checkInPayment) <= 0.009) {
                return [
                    'ok' => false,
                    'code' => 400,
                    'error' => 'Cannot check in an unpaid booking. Please record at least a deposit or payment before or at check-in.',
                ];
            }
        }

        return ['ok' => true, 'code' => 200, 'error' => null];
    }

    /**
     * Ensure the booking_status_history audit table exists (InnoDB).
     * Should be called before starting a transaction (DDL auto-commits in MySQL).
     */
    public static function ensureAuditTable(mysqli $conn): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }
        $conn->query("CREATE TABLE IF NOT EXISTS booking_status_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            booking_id INT NOT NULL,
            from_status VARCHAR(32) NULL,
            to_status VARCHAR(32) NOT NULL,
            changed_by INT NULL,
            changed_by_role VARCHAR(32) NULL,
            notes VARCHAR(255) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_bsh_booking (booking_id),
            INDEX idx_bsh_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $ensured = true;
    }

    /**
     * Record a booking status transition inside the active transaction.
     */
    public static function recordTransition(
        mysqli $conn,
        int $bookingId,
        ?string $fromStatus,
        string $toStatus,
        ?int $userId,
        ?string $userRole,
        string $notes = ''
    ): void {
        if ($bookingId <= 0) {
            return;
        }
        if ($fromStatus !== null && $fromStatus === $toStatus) {
            return;
        }
        $stmt = $conn->prepare("INSERT INTO booking_status_history (booking_id, from_status, to_status, changed_by, changed_by_role, notes) VALUES (?, ?, ?, ?, ?, ?)");
        if (!$stmt) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare booking status audit insert');
        }
        $stmt->bind_param('ississ', $bookingId, $fromStatus, $toStatus, $userId, $userRole, $notes);
        if (!$stmt->execute()) {
            throw new RuntimeException($stmt->error ?: 'Failed to record booking status transition');
        }
        $stmt->close();
    }

    /**
     * Compute total completed payments for a booking inside the current transaction.
     */
    public static function getCompletedPaidAmount(mysqli $conn, int $bookingId): float
    {
        $stmt = $conn->prepare("SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE booking_id = ? AND status = 'completed'");
        if (!$stmt) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare payment sum query');
        }
        $stmt->bind_param('i', $bookingId);
        if (!$stmt->execute()) {
            throw new RuntimeException($stmt->error ?: 'Failed to query booking payments');
        }
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return (float) ($row['total_paid'] ?? 0);
    }
}


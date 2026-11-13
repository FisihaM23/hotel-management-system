<?php

/**
 * Transactional Notification Outbox
 *
 * Enqueues external notification events inside the database transaction so:
 *   1. Rolled-back transactions never emit phantom notifications.
 *   2. External email/SMS/Telegram failures after commit are recorded for retry
 *      and never falsely roll back committed database operations.
 */
class NotificationOutbox
{
    public static function ensureTable(mysqli $conn): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }
        $conn->query("CREATE TABLE IF NOT EXISTS notification_outbox (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event_type VARCHAR(50) NOT NULL,
            booking_id INT NOT NULL,
            payload LONGTEXT NOT NULL,
            status ENUM('pending','sent','failed') DEFAULT 'pending',
            attempts INT NOT NULL DEFAULT 0,
            last_error TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            processed_at TIMESTAMP NULL DEFAULT NULL,
            INDEX idx_outbox_status (status, created_at),
            INDEX idx_outbox_booking (booking_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $ensured = true;
    }

    /**
     * Enqueue a notification event inside the active transaction.
     */
    public static function enqueue(mysqli $conn, string $eventType, int $bookingId, array $payload): int
    {
        $json = json_encode($payload);
        $stmt = $conn->prepare("INSERT INTO notification_outbox (event_type, booking_id, payload, status, attempts) VALUES (?, ?, ?, 'pending', 0)");
        if (!$stmt) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare outbox insert');
        }
        $stmt->bind_param('sis', $eventType, $bookingId, $json);
        if (!$stmt->execute()) {
            throw new RuntimeException($stmt->error ?: 'Failed to enqueue notification outbox');
        }
        $id = (int) $conn->insert_id;
        $stmt->close();
        return $id;
    }

    /**
     * Best-effort post-commit dispatch for pending outbox events of a booking.
     * Failures are recorded on the outbox row for retry and never throw out.
     */
    public static function dispatchForBooking(mysqli $conn, int $bookingId): void
    {
        $stmt = $conn->prepare("SELECT id, event_type, payload FROM notification_outbox WHERE booking_id = ? AND status IN ('pending', 'failed') AND attempts < 5 ORDER BY id ASC");
        if (!$stmt) {
            return;
        }
        $stmt->bind_param('i', $bookingId);
        if (!$stmt->execute()) {
            $stmt->close();
            return;
        }
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        foreach ($rows as $row) {
            $outboxId = (int) $row['id'];
            $payload = json_decode((string) $row['payload'], true) ?: [];
            try {
                if ($row['event_type'] === 'payment' && function_exists('dispatchPaymentNotification')) {
                    dispatchPaymentNotification($conn, $payload);
                }
                $upd = $conn->prepare("UPDATE notification_outbox SET status = 'sent', attempts = attempts + 1, last_error = NULL, processed_at = NOW() WHERE id = ?");
                if ($upd) {
                    $upd->bind_param('i', $outboxId);
                    $upd->execute();
                    $upd->close();
                }
            } catch (\Throwable $e) {
                $errMsg = substr($e->getMessage(), 0, 500);
                $upd = $conn->prepare("UPDATE notification_outbox SET status = 'failed', attempts = attempts + 1, last_error = ?, processed_at = NOW() WHERE id = ?");
                if ($upd) {
                    $upd->bind_param('si', $errMsg, $outboxId);
                    $upd->execute();
                    $upd->close();
                }
                error_log("[NotificationOutbox #$outboxId] Dispatch failed (will retry): " . $errMsg);
            }
        }
    }
}


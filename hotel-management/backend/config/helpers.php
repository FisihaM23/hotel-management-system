<?php
define('AUTH_SECRET', 'hms_hmac_2026_change_in_production_k8n2p4q9');
define('TOKEN_TTL', 86400);
define('DEMO_PASSWORD', 'Password123!');

function json_fail($code, $message) {
    http_response_code($code);
    echo json_encode(['error' => $message]);
    exit;
}

function json_ok($payload) {
    echo json_encode($payload);
}

function getAuthorizationHeader() {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    if (is_array($headers)) {
        foreach ($headers as $key => $value) {
            if (strtolower($key) === 'authorization') {
                return $value;
            }
        }
    }
    return $_SERVER['HTTP_AUTHORIZATION']
        ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
        ?? '';
}

function passwordMeetsPolicy($password) {
    return is_string($password)
        && strlen($password) >= 8
        && preg_match('/[A-Z]/', $password)
        && preg_match('/[a-z]/', $password)
        && preg_match('/[0-9]/', $password)
        && preg_match('/[\W_]/', $password);
}

function passwordPolicyMessage() {
    return 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character';
}

function isValidUserEmail($email) {
    if (!is_string($email)) return false;
    $email = trim($email);
    if (empty($email)) return false;
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return false;
    // Must contain letters before @ (only numbers before @ is invalid)
    // Must end with @gmail.com or @icloud.com (or @hotel.com)
    return (bool) preg_match('/^(?=[^@]*[a-zA-Z])[a-zA-Z0-9._%+-]+@(gmail\.com|icloud\.com|hotel\.com)$/i', $email);
}

function emailPolicyMessage() {
    return 'Email must contain letters (words or word with numbers) and end with @gmail.com or @icloud.com (only numbers before @ is invalid, e.g. name@gmail.com)';
}

function makeAuthToken($user) {
    $issued = (string) time();
    $sig = hash_hmac('sha256', $user['id'] . ':' . $issued . ':' . $user['email'], AUTH_SECRET);
    return base64_encode($user['id'] . ':' . $issued . ':' . $sig);
}

function isFrontDesk($user) {
    return in_array($user['role'], ['admin', 'manager', 'receptionist'], true);
}

function isOpsStaff($user) {
    return in_array($user['role'], ['admin', 'manager', 'receptionist', 'housekeeping', 'maintenance'], true);
}

function randomGuestPassword() {
    $upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    $lower = 'abcdefghijkmnopqrstuvwxyz';
    $digits = '23456789';
    $special = '!@#$%&*';
    $pw = $upper[random_int(0, strlen($upper) - 1)]
        . $lower[random_int(0, strlen($lower) - 1)]
        . $digits[random_int(0, strlen($digits) - 1)]
        . $special[random_int(0, strlen($special) - 1)];
    $all = $upper . $lower . $digits . $special;
    for ($i = 0; $i < 8; $i++) {
        $pw .= $all[random_int(0, strlen($all) - 1)];
    }
    return str_shuffle($pw);
}

function requireStmt($stmt, $conn) {
    if (!$stmt) {
        json_fail(500, 'Query failed: ' . $conn->error);
    }
}

function executeOrFail($stmt, $conn) {
    if (!$stmt->execute()) {
        json_fail(400, $conn->error ?: 'Database operation failed');
    }
    return true;
}

function roomHasOverlap($conn, $roomId, $checkIn, $checkOut, $excludeBookingId = 0, $forUpdate = false) {
    $sql = "SELECT id FROM bookings
            WHERE room_id = ?
              AND deleted_at IS NULL
              AND status IN ('pending', 'confirmed', 'checked_in')
              AND check_in < ?
              AND check_out > ?";
    if ($excludeBookingId) {
        $sql .= " AND id != ?";
    }
    if ($forUpdate) {
        $sql .= " FOR UPDATE";
    }
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        throw new RuntimeException($conn->error ?: 'Failed to prepare room overlap check');
    }
    if ($excludeBookingId) {
        $stmt->bind_param('issi', $roomId, $checkOut, $checkIn, $excludeBookingId);
    } else {
        $stmt->bind_param('iss', $roomId, $checkOut, $checkIn);
    }
    if (!$stmt->execute()) {
        throw new RuntimeException($stmt->error ?: 'Failed to execute room overlap check');
    }
    return (bool) $stmt->get_result()->fetch_assoc();
}

require_once __DIR__ . '/room_status_service.php';
require_once __DIR__ . '/soft_delete_service.php';

function syncRoomStatus($conn, $roomId) {
    return RoomStatusService::syncRoomStatus($conn, (int) $roomId);
}

/**
 * Archive (soft-delete) a user, customer, or guest while preserving all financial,
 * booking, payment, and invoice history (no FOREIGN_KEY_CHECKS=0 or permanent purges).
 */
function deleteUserSafely($conn, $userId, $actorId = null, $actorRole = 'system') {
    SoftDeleteService::ensureSchema($conn);
    return SoftDeleteService::softDeleteUser($conn, (int) $userId, $actorId ? (int) $actorId : null, (string) $actorRole);
}

/**
 * Ensure users.must_change_password exists (checked once via INFORMATION_SCHEMA per request).
 */
function ensureMustChangePasswordColumn(mysqli $conn): void {
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;
    $chk = $conn->query("SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'must_change_password' LIMIT 1");
    if ($chk && $chk->num_rows === 0) {
        $conn->query("ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0");
    }
}

/**
 * Generate a one-time-use, expiring password setup/reset token and store ONLY its SHA-256 hash.
 * Returns the raw token strictly for out-of-band email delivery (never store raw token in DB/notifications).
 */
function createPasswordSetupToken(mysqli $conn, int $userId, string $email, int $ttlMinutes = 60): string {
    $ttlMinutes = max(5, min(10080, $ttlMinutes));
    $rawToken = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $rawToken);
    $emailLower = strtolower(trim($email));

    $inv = $conn->prepare("UPDATE password_resets SET used = 1 WHERE (user_id = ? OR email = ?) AND used = 0");
    if ($inv) {
        $inv->bind_param('is', $userId, $emailLower);
        $inv->execute();
        $inv->close();
    }

    $ins = $conn->prepare("INSERT INTO password_resets (user_id, email, token, reset_token_hash, purpose, is_verified, used, expires_at, token_expires_at) VALUES (?, ?, ?, ?, 'forgot_password', 1, 0, DATE_ADD(NOW(), INTERVAL ? MINUTE), DATE_ADD(NOW(), INTERVAL ? MINUTE))");
    if ($ins) {
        $ins->bind_param('isssii', $userId, $emailLower, $tokenHash, $tokenHash, $ttlMinutes, $ttlMinutes);
        $ins->execute();
        $ins->close();
    }

    return $rawToken;
}

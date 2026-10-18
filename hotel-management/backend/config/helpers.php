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

function roomHasOverlap($conn, $roomId, $checkIn, $checkOut, $excludeBookingId = 0) {
    $sql = "SELECT id FROM bookings
            WHERE room_id = ?
              AND status NOT IN ('cancelled', 'checked_out')
              AND check_in < ?
              AND check_out > ?";
    if ($excludeBookingId) {
        $sql .= " AND id != ?";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('issi', $roomId, $checkOut, $checkIn, $excludeBookingId);
    } else {
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('iss', $roomId, $checkOut, $checkIn);
    }
    $stmt->execute();
    return (bool) $stmt->get_result()->fetch_assoc();
}

function syncRoomStatus($conn, $roomId) {
    if (!$roomId) return;
    $stmt = $conn->prepare("SELECT status FROM rooms WHERE id = ?");
    $stmt->bind_param('i', $roomId);
    $stmt->execute();
    $room = $stmt->get_result()->fetch_assoc();
    if (!$room || $room['status'] === 'maintenance') {
        return;
    }
    $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM bookings WHERE room_id = ? AND status = 'checked_in'");
    $stmt->bind_param('i', $roomId);
    $stmt->execute();
    $checkedIn = (int) $stmt->get_result()->fetch_assoc()['c'];
    if ($checkedIn > 0) {
        $status = 'occupied';
    } else {
        $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM bookings
            WHERE room_id = ? AND status = 'checked_out' AND check_out = CURDATE()");
        $stmt->bind_param('i', $roomId);
        $stmt->execute();
        $checkedOutToday = (int) $stmt->get_result()->fetch_assoc()['c'];
        $status = $checkedOutToday > 0 ? 'cleaning' : 'available';
    }
    $upd = $conn->prepare("UPDATE rooms SET status = ? WHERE id = ?");
    $upd->bind_param('si', $status, $roomId);
    $upd->execute();
}

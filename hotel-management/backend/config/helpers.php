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
    return (bool) preg_match('/^[a-zA-Z0-9.!#$%&\'*+\/=?^_`{|}~-]+@(gmail\.com|icloud\.com|hotel\.com)$/i', $email);
}

function emailPolicyMessage() {
    return 'Email address must be valid and end with @gmail.com or @icloud.com (e.g. name@gmail.com)';
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
    $roomId = (int) $roomId;
    if (!$roomId) return;
    $stmt = $conn->prepare("SELECT status FROM rooms WHERE id = ?");
    $stmt->bind_param('i', $roomId);
    $stmt->execute();
    $room = $stmt->get_result()->fetch_assoc();
    if (!$room || $room['status'] === 'maintenance') {
        return;
    }

    // A room is actively occupied if there is a booking with status 'checked_in',
    // or an active confirmed/pending booking whose check-out date has not passed
    $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM bookings WHERE room_id = ? AND (status = 'checked_in' OR (status IN ('confirmed', 'pending') AND check_out >= CURDATE()))");
    $stmt->bind_param('i', $roomId);
    $stmt->execute();
    $activeOccupied = (int) $stmt->get_result()->fetch_assoc()['c'];

    if ($activeOccupied > 0) {
        $status = 'occupied';
    } else {
        $status = 'available';
    }
    $upd = $conn->prepare("UPDATE rooms SET status = ? WHERE id = ?");
    $upd->bind_param('si', $status, $roomId);
    $upd->execute();
}

/**
 * Safely delete a user, customer, or guest and clean up all dependent records
 * without foreign key constraint errors, restoring freed room availability.
 */
function deleteUserSafely($conn, $userId) {
    $userId = (int) $userId;
    if (!$userId) {
        return ['success' => false, 'error' => 'Invalid user ID'];
    }

    // Look up target user
    $stmt = $conn->prepare("SELECT id, name, email, role FROM users WHERE id = ?");
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $targetUser = $stmt->get_result()->fetch_assoc();
    if (!$targetUser) {
        return ['success' => false, 'error' => 'User not found or already deleted'];
    }

    // Protect primary administrator account
    if ($targetUser['email'] === 'befather7@gmail.com') {
        return ['success' => false, 'error' => 'The primary Administrator account cannot be deleted'];
    }

    // Disable foreign key checks temporarily to ensure complete clean deletion without constraint errors
    $conn->query("SET FOREIGN_KEY_CHECKS = 0");

    try {
        // Collect rooms booked by this user to sync their status after deletion
        $bStmt = $conn->prepare("SELECT id, room_id FROM bookings WHERE customer_id = ?");
        $bStmt->bind_param('i', $userId);
        $bStmt->execute();
        $userBookings = $bStmt->get_result()->fetch_all(MYSQLI_ASSOC);

        $affectedRoomIds = [];
        foreach ($userBookings as $b) {
            $bId = (int) $b['id'];
            $rId = (int) ($b['room_id'] ?? 0);
            if ($rId) $affectedRoomIds[$rId] = true;

            // Delete child payments
            $delP = $conn->prepare("DELETE FROM payments WHERE booking_id = ?");
            $delP->bind_param('i', $bId);
            $delP->execute();

            // Delete child invoices
            $delI = $conn->prepare("DELETE FROM invoices WHERE booking_id = ?");
            $delI->bind_param('i', $bId);
            $delI->execute();
        }

        // Delete all bookings for this customer
        $delB = $conn->prepare("DELETE FROM bookings WHERE customer_id = ?");
        $delB->bind_param('i', $userId);
        $delB->execute();

        // Delete dining orders placed by this customer
        $delD = $conn->prepare("DELETE FROM dining_orders WHERE customer_id = ?");
        $delD->bind_param('i', $userId);
        $delD->execute();

        // Delete notifications for this user
        $delN = $conn->prepare("DELETE FROM notifications WHERE user_id = ?");
        $delN->bind_param('i', $userId);
        $delN->execute();

        // Delete hotel AI chat logs for this user
        $delC = $conn->prepare("DELETE FROM hotel_ai_chats WHERE user_id = ?");
        $delC->bind_param('i', $userId);
        $delC->execute();

        // Delete password reset tokens for this user email
        $delR = $conn->prepare("DELETE FROM password_resets WHERE email = ?");
        $delR->bind_param('s', $targetUser['email']);
        $delR->execute();

        // Nullify staff receptionist references
        $updRecep = $conn->prepare("UPDATE bookings SET receptionist_id = NULL WHERE receptionist_id = ?");
        $updRecep->bind_param('i', $userId);
        $updRecep->execute();

        // Nullify housekeeping assignments
        $updHk = $conn->prepare("UPDATE housekeeping_tasks SET assigned_to = NULL WHERE assigned_to = ?");
        $updHk->bind_param('i', $userId);
        $updHk->execute();

        // Nullify maintenance technician assignments
        $updMaintAssigned = $conn->prepare("UPDATE maintenance_requests SET assigned_to = NULL WHERE assigned_to = ?");
        $updMaintAssigned->bind_param('i', $userId);
        $updMaintAssigned->execute();

        // Reassign maintenance reported_by to fallback admin
        $adminRes = $conn->query("SELECT id FROM users WHERE role='admin' AND id != $userId ORDER BY id ASC LIMIT 1");
        $fallbackAdminId = ($adminRes && $row = $adminRes->fetch_assoc()) ? (int)$row['id'] : 1;
        $updMaintReported = $conn->prepare("UPDATE maintenance_requests SET reported_by = ? WHERE reported_by = ?");
        $updMaintReported->bind_param('ii', $fallbackAdminId, $userId);
        $updMaintReported->execute();

        // Finally delete the user
        $delU = $conn->prepare("DELETE FROM users WHERE id = ?");
        $delU->bind_param('i', $userId);
        $delU->execute();

        $conn->query("SET FOREIGN_KEY_CHECKS = 1");

        // Sync room statuses for any freed rooms
        foreach (array_keys($affectedRoomIds) as $roomId) {
            syncRoomStatus($conn, $roomId);
        }

        return ['success' => true, 'message' => "User {$targetUser['name']} and all associated records deleted successfully."];
    } catch (\Throwable $e) {
        $conn->query("SET FOREIGN_KEY_CHECKS = 1");
        return ['success' => false, 'error' => 'Failed to delete: ' . $e->getMessage()];
    }
}

<?php
require_once __DIR__ . '/database.php';
require_once __DIR__ . '/helpers.php';

function authenticate($allowed_roles = []) {
    $auth = getAuthorizationHeader();
    if (!$auth || !str_starts_with($auth, 'Bearer ')) {
        json_fail(401, 'Unauthorized');
    }
    $token = substr($auth, 7);
    $decoded = base64_decode($token, true);
    $parts = $decoded !== false ? explode(':', $decoded) : [];
    if (count($parts) < 3) {
        json_fail(401, 'Invalid token');
    }
    $user_id = (int) $parts[0];
    $issued_at = (int) $parts[1];
    $sig = $parts[2];
    if ($user_id < 1 || $issued_at < 1 || time() - $issued_at > TOKEN_TTL) {
        json_fail(401, 'Token expired. Please log in again.');
    }

    $conn = getConnection();
    $stmt = $conn->prepare("SELECT id, name, email, role, status FROM users WHERE id = ? AND status = 'active'");
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $conn->close();

    if (!$user) {
        json_fail(401, 'User not found');
    }
    $expected = hash_hmac('sha256', $user['id'] . ':' . $issued_at . ':' . $user['email'], AUTH_SECRET);
    if (!hash_equals($expected, $sig)) {
        json_fail(401, 'Invalid token');
    }
    if (!empty($allowed_roles) && !in_array($user['role'], $allowed_roles, true)) {
        json_fail(403, 'Access denied for role: ' . $user['role']);
    }
    return $user;
}

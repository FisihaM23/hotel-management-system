<?php
require_once __DIR__ . '/database.php';

function authenticate($allowed_roles = []) {
    $headers = getallheaders();
    $auth = $headers['Authorization'] ?? '';
    if (!$auth || !str_starts_with($auth, 'Bearer ')) {
        http_response_code(401);
        die(json_encode(['error' => 'Unauthorized']));
    }
    $token = substr($auth, 7);
    $decoded = base64_decode($token);
    $parts = explode(':', $decoded);
    if (count($parts) < 2) {
        http_response_code(401);
        die(json_encode(['error' => 'Invalid token']));
    }
    $user_id = (int)$parts[0];
    $issued_at = (int)$parts[1];
    if (time() - $issued_at > 86400) {
        http_response_code(401);
        echo json_encode(['error' => 'Token expired. Please log in again.']);
        exit;
    }
    $conn = getConnection();
    $stmt = $conn->prepare("SELECT id, name, email, role, status FROM users WHERE id = ? AND status = 'active'");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $conn->close();
    if (!$user) {
        http_response_code(401);
        die(json_encode(['error' => 'User not found']));
    }
    if (!empty($allowed_roles) && !in_array($user['role'], $allowed_roles)) {
        http_response_code(403);
        die(json_encode(['error' => 'Access denied for role: ' . $user['role']]));
    }
    return $user;
}

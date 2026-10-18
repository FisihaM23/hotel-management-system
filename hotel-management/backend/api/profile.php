<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$authUser = authenticate();
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $stmt = $conn->prepare("SELECT id, name, email, phone, role FROM users WHERE id = ?");
        $stmt->bind_param('i', $authUser['id']);
        $stmt->execute();
        $user = $stmt->get_result()->fetch_assoc();
        if ($user) {
            json_ok($user);
        } else {
            json_fail(404, 'User not found');
        }
        break;

    case 'PUT':
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $updates = [];
        $types = '';
        $values = [];

        if (!empty($d['name'])) {
            $updates[] = 'name = ?';
            $types .= 's';
            $values[] = $d['name'];
        }
        if (isset($d['phone'])) {
            $updates[] = 'phone = ?';
            $types .= 's';
            $values[] = $d['phone'];
        }
        if (!empty($d['password'])) {
            if (!passwordMeetsPolicy($d['password'])) {
                json_fail(400, passwordPolicyMessage());
            }
            $updates[] = 'password = ?';
            $types .= 's';
            $values[] = password_hash($d['password'], PASSWORD_BCRYPT);
        }
        if (empty($updates)) {
            json_fail(400, 'No valid fields to update');
        }
        $types .= 'i';
        $values[] = $authUser['id'];
        $sql = 'UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = ?';
        $stmt = $conn->prepare($sql);
        $stmt->bind_param($types, ...$values);
        executeOrFail($stmt, $conn);
        json_ok(['message' => 'Profile updated successfully']);
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

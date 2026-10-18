<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$authUser = authenticate();
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;

switch ($method) {
    case 'GET':
        authenticate(['admin', 'manager', 'housekeeping', 'maintenance', 'receptionist']);
        $role = $_GET['role'] ?? null;
        if ($role) {
            $stmt = $conn->prepare("SELECT id,name,email,role,phone,status,created_at FROM users WHERE role=? ORDER BY name");
            $stmt->bind_param('s', $role);
            $stmt->execute();
            json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            $result = $conn->query("SELECT id,name,email,role,phone,status,created_at FROM users ORDER BY created_at DESC");
            json_ok($result->fetch_all(MYSQLI_ASSOC));
        }
        break;

    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        if (empty($data['password']) || !passwordMeetsPolicy($data['password'])) {
            json_fail(400, passwordPolicyMessage());
        }
        $hash = password_hash($data['password'], PASSWORD_BCRYPT);
        $name = $data['name'] ?? '';
        $email = $data['email'] ?? '';
        $role = $data['role'] ?? 'receptionist';
        $phone = $data['phone'] ?? '';
        $status = $data['status'] ?? 'active';
        $stmt = $conn->prepare("INSERT INTO users (name,email,password,role,phone,status) VALUES (?,?,?,?,?,?)");
        $stmt->bind_param('ssssss', $name, $email, $hash, $role, $phone, $status);
        executeOrFail($stmt, $conn);
        json_ok(['id' => $conn->insert_id, 'message' => 'User created']);
        break;

    case 'PUT':
        if (!$id) {
            json_fail(400, 'User ID is required');
        }
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $name = $data['name'] ?? '';
        $email = $data['email'] ?? '';
        $role = $data['role'] ?? 'receptionist';
        $phone = $data['phone'] ?? '';
        $status = $data['status'] ?? 'active';
        if (!empty($data['password'])) {
            if (!passwordMeetsPolicy($data['password'])) {
                json_fail(400, passwordPolicyMessage());
            }
            $hash = password_hash($data['password'], PASSWORD_BCRYPT);
            $stmt = $conn->prepare("UPDATE users SET name=?,email=?,password=?,role=?,phone=?,status=? WHERE id=?");
            $stmt->bind_param('ssssssi', $name, $email, $hash, $role, $phone, $status, $id);
        } else {
            $stmt = $conn->prepare("UPDATE users SET name=?,email=?,role=?,phone=?,status=? WHERE id=?");
            $stmt->bind_param('sssssi', $name, $email, $role, $phone, $status, $id);
        }
        executeOrFail($stmt, $conn);
        json_ok(['message' => 'User updated']);
        break;

    case 'DELETE':
        if (!$id) {
            json_fail(400, 'User ID is required');
        }
        $stmt = $conn->prepare("DELETE FROM users WHERE id=?");
        $stmt->bind_param('i', $id);
        executeOrFail($stmt, $conn);
        if ($stmt->affected_rows < 1) {
            json_fail(400, 'User could not be deleted (they may still have related records)');
        }
        json_ok(['message' => 'User deleted']);
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$user = authenticate(['admin','manager']);
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;

switch ($method) {
    case 'GET':
        $role = $_GET['role'] ?? null;
        if ($role) {
            $stmt = $conn->prepare("SELECT id,name,email,role,phone,status,created_at FROM users WHERE role=? ORDER BY name");
            $stmt->bind_param("s", $role);
            $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            $result = $conn->query("SELECT id,name,email,role,phone,status,created_at FROM users ORDER BY created_at DESC");
            echo json_encode($result->fetch_all(MYSQLI_ASSOC));
        }
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        if (empty($data['password']) || strlen($data['password']) < 8 ||
            !preg_match('/[A-Z]/', $data['password']) ||
            !preg_match('/[a-z]/', $data['password']) ||
            !preg_match('/[0-9]/', $data['password']) ||
            !preg_match('/[\W_]/', $data['password'])) {
            http_response_code(400); echo json_encode(['error' => 'Password must be at least 8 characters with uppercase, lowercase, number, and special character']); break;
        }
        $hash = password_hash($data['password'], PASSWORD_BCRYPT);
        $stmt = $conn->prepare("INSERT INTO users (name,email,password,role,phone,status) VALUES (?,?,?,?,?,?)");
        $stmt->bind_param("ssssss", $data['name'], $data['email'], $hash, $data['role'], $data['phone'], $data['status']);
        if ($stmt->execute()) echo json_encode(['id' => $conn->insert_id, 'message' => 'User created']);
        else { http_response_code(400); echo json_encode(['error' => $conn->error]); }
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!empty($data['password'])) {
            $hash = password_hash($data['password'], PASSWORD_BCRYPT);
            $stmt = $conn->prepare("UPDATE users SET name=?,email=?,password=?,role=?,phone=?,status=? WHERE id=?");
            $stmt->bind_param("ssssssi", $data['name'], $data['email'], $hash, $data['role'], $data['phone'], $data['status'], $id);
        } else {
            $stmt = $conn->prepare("UPDATE users SET name=?,email=?,role=?,phone=?,status=? WHERE id=?");
            $stmt->bind_param("sssssi", $data['name'], $data['email'], $data['role'], $data['phone'], $data['status'], $id);
        }
        $stmt->execute();
        echo json_encode(['message' => 'User updated']);
        break;
    case 'DELETE':
        $stmt = $conn->prepare("DELETE FROM users WHERE id=?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        echo json_encode(['message' => 'User deleted']);
        break;
}
$conn->close();

<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

authenticate(['admin','manager','receptionist']);
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;

switch ($method) {
    case 'GET':
        $search = isset($_GET['search']) ? '%' . $_GET['search'] . '%' : null;
        if ($search) {
            $stmt = $conn->prepare("SELECT id,name,email,phone,address,created_at FROM users WHERE role='customer' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?) ORDER BY name");
            $stmt->bind_param("sss", $search, $search, $search); $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            echo json_encode($conn->query("SELECT id,name,email,phone,address,created_at FROM users WHERE role='customer' ORDER BY created_at DESC")->fetch_all(MYSQLI_ASSOC));
        }
        break;
    case 'POST':
        $d = json_decode(file_get_contents('php://input'), true);
        $hash = password_hash('password123', PASSWORD_BCRYPT);
        $role = 'customer';
        $stmt = $conn->prepare("INSERT INTO users (name,email,password,role,phone,address) VALUES (?,?,?,?,?,?)");
        $stmt->bind_param("ssssss", $d['name'], $d['email'], $hash, $role, $d['phone'], $d['address']);
        if ($stmt->execute()) echo json_encode(['id' => $conn->insert_id, 'message' => 'Guest added']);
        else { http_response_code(400); echo json_encode(['error' => $conn->error]); }
        break;
    case 'PUT':
        $d = json_decode(file_get_contents('php://input'), true);
        $stmt = $conn->prepare("UPDATE users SET name=?,email=?,phone=?,address=? WHERE id=? AND role='customer'");
        $stmt->bind_param("ssssi", $d['name'], $d['email'], $d['phone'], $d['address'], $id);
        $stmt->execute(); echo json_encode(['message' => 'Guest updated']);
        break;
    case 'DELETE':
        $stmt = $conn->prepare("DELETE FROM users WHERE id=? AND role='customer'");
        $stmt->bind_param("i", $id); $stmt->execute();
        echo json_encode(['message' => 'Guest deleted']);
        break;
}
$conn->close();

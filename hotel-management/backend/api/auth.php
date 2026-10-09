<?php
require_once '../config/cors.php';
require_once '../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); die(json_encode(['error' => 'Method not allowed'])); }

$data = json_decode(file_get_contents('php://input'), true);
$action = $_GET['action'] ?? 'login';
$conn = getConnection();

if ($action === 'login') {
    if (empty($data['email']) || empty($data['password'])) {
        http_response_code(400); die(json_encode(['error' => 'Email and password required']));
    }
    $stmt = $conn->prepare("SELECT * FROM users WHERE email = ? AND status = 'active'");
    $stmt->bind_param("s", $data['email']);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    if ($user && password_verify($data['password'], $user['password'])) {
        unset($user['password']);
        $token = base64_encode($user['id'] . ':' . time() . ':' . md5($user['email'] . 'hotel_secret_2024'));
        // Notify login
        $msg = "Welcome back, " . $user['name'];
        $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Login', ?, 'info')");
        $notif->bind_param("is", $user['id'], $msg);
        $notif->execute();
        echo json_encode(['token' => $token, 'user' => $user]);
    } else {
        http_response_code(401); echo json_encode(['error' => 'Invalid credentials']);
    }
}

if ($action === 'register') {
    if (empty($data['name']) || empty($data['email']) || empty($data['password'])) {
        http_response_code(400); die(json_encode(['error' => 'Name, email and password required']));
    }
    if (strlen($data['password']) < 8 ||
        !preg_match('/[A-Z]/', $data['password']) ||
        !preg_match('/[a-z]/', $data['password']) ||
        !preg_match('/[0-9]/', $data['password']) ||
        !preg_match('/[\W_]/', $data['password'])) {
        http_response_code(400); die(json_encode(['error' => 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character']));
    }
    $hash = password_hash($data['password'], PASSWORD_BCRYPT);
    $role = 'customer';
    $stmt = $conn->prepare("INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, ?, ?)");
    $stmt->bind_param("sssss", $data['name'], $data['email'], $hash, $role, $data['phone']);
    if ($stmt->execute()) {
        echo json_encode(['message' => 'Registration successful. Please login.']);
    } else {
        http_response_code(400); echo json_encode(['error' => 'Email already exists']);
    }
}
$conn->close();

<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$authUser = authenticate();
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;

if ($method === 'GET') {
    $stmt = $conn->prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 20");
    $stmt->bind_param("i", $authUser['id']); $stmt->execute();
    echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
} elseif ($method === 'PUT' && $id) {
    $stmt = $conn->prepare("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?");
    $stmt->bind_param("ii", $id, $authUser['id']); $stmt->execute();
    echo json_encode(['message' => 'Marked as read']);
}
$conn->close();

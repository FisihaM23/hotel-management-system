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
        $booking_id = $_GET['booking_id'] ?? null;
        $query = "SELECT p.*, u.name as guest_name FROM payments p
                  JOIN bookings b ON p.booking_id = b.id
                  JOIN users u ON b.customer_id = u.id";
        if ($booking_id) {
            $stmt = $conn->prepare("$query WHERE p.booking_id=? ORDER BY p.paid_at DESC");
            $stmt->bind_param("i", $booking_id); $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            echo json_encode($conn->query("$query ORDER BY p.paid_at DESC")->fetch_all(MYSQLI_ASSOC));
        }
        break;
    case 'POST':
        $d = json_decode(file_get_contents('php://input'), true);
        $stmt = $conn->prepare("INSERT INTO payments (booking_id,amount,method,status,transaction_id,notes) VALUES (?,?,?,?,?,?)");
        $stmt->bind_param("idssss", $d['booking_id'], $d['amount'], $d['method'], $d['status'], $d['transaction_id'], $d['notes']);
        if ($stmt->execute()) echo json_encode(['id' => $conn->insert_id, 'message' => 'Payment recorded']);
        else { http_response_code(400); echo json_encode(['error' => $conn->error]); }
        break;
    case 'PUT':
        $d = json_decode(file_get_contents('php://input'), true);
        $stmt = $conn->prepare("UPDATE payments SET amount=?,method=?,status=?,transaction_id=?,notes=? WHERE id=?");
        $stmt->bind_param("dssssi", $d['amount'], $d['method'], $d['status'], $d['transaction_id'], $d['notes'], $id);
        $stmt->execute(); echo json_encode(['message' => 'Payment updated']);
        break;
}
$conn->close();

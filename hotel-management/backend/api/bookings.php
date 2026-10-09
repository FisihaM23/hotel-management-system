<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$authUser = authenticate();
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
$mine = isset($_GET['mine']);

$baseQuery = "SELECT b.*, u.name as guest_name, u.email as guest_email, u.phone as guest_phone,
              r.room_number, r.type as room_type, r.price_per_night
              FROM bookings b
              JOIN users u ON b.customer_id = u.id
              JOIN rooms r ON b.room_id = r.id";

switch ($method) {
    case 'GET':
        if ($mine) {
            $stmt = $conn->prepare("$baseQuery WHERE b.customer_id=? ORDER BY b.created_at DESC");
            $stmt->bind_param("i", $authUser['id']); $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } elseif ($id) {
            $stmt = $conn->prepare("$baseQuery WHERE b.id=?");
            $stmt->bind_param("i", $id); $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_assoc());
        } else {
            $status = $_GET['status'] ?? null;
            if ($status) {
                $stmt = $conn->prepare("$baseQuery WHERE b.status=? ORDER BY b.created_at DESC");
                $stmt->bind_param("s", $status); $stmt->execute();
                echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
            } else {
                echo json_encode($conn->query("$baseQuery ORDER BY b.created_at DESC")->fetch_all(MYSQLI_ASSOC));
            }
        }
        break;
    case 'POST':
        $d = json_decode(file_get_contents('php://input'), true);
        $stmt = $conn->prepare("SELECT price_per_night FROM rooms WHERE id=?");
        $stmt->bind_param("i", $d['room_id']); $stmt->execute();
        $room = $stmt->get_result()->fetch_assoc();
        $nights = max(1, (strtotime($d['check_out']) - strtotime($d['check_in'])) / 86400);
        $total = $room['price_per_night'] * $nights;
        $recep = $authUser['role'] !== 'customer' ? $authUser['id'] : null;
        $stmt = $conn->prepare("INSERT INTO bookings (customer_id,room_id,receptionist_id,check_in,check_out,adults,children,special_requests,total_amount,status) VALUES (?,?,?,?,?,?,?,?,?,?)");
        $stmt->bind_param("iiissiiids", $d['guest_id'], $d['room_id'], $recep, $d['check_in'], $d['check_out'], $d['adults'], $d['children'], $d['special_requests'], $total, $d['status']);
        if ($stmt->execute()) {
            $conn->query("UPDATE rooms SET status='occupied' WHERE id=" . (int)$d['room_id']);
            // Notify customer
            $msg = "Your booking for room has been received.";
            $notif = $conn->prepare("INSERT INTO notifications (user_id,title,message,type) VALUES (?,'Booking Received',?,'info')");
            $notif->bind_param("is", $d['guest_id'], $msg); $notif->execute();
            echo json_encode(['id' => $conn->insert_id, 'total_amount' => $total, 'message' => 'Booking created']);
        } else { http_response_code(400); echo json_encode(['error' => $conn->error]); }
        break;
    case 'PUT':
        $d = json_decode(file_get_contents('php://input'), true);
        $stmt = $conn->prepare("UPDATE bookings SET status=? WHERE id=?");
        $stmt->bind_param("si", $d['status'], $id); $stmt->execute();
        if (in_array($d['status'], ['checked_out','cancelled'])) {
            $conn->query("UPDATE rooms SET status='available' WHERE id=" . (int)$d['room_id']);
        }
        if ($d['status'] === 'checked_in') {
            $conn->query("UPDATE rooms SET status='occupied' WHERE id=" . (int)$d['room_id']);
        }
        echo json_encode(['message' => 'Booking updated']);
        break;
    case 'DELETE':
        authenticate(['admin','manager']);
        $stmt = $conn->prepare("DELETE FROM bookings WHERE id=?");
        $stmt->bind_param("i", $id); $stmt->execute();
        echo json_encode(['message' => 'Booking deleted']);
        break;
}
$conn->close();

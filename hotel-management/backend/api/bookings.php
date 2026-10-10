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

        // Accept either guest_id (staff form) or customer_id (direct)
        // When a customer self-books, guest_id is set to user.id in CustomerPortal
        $customer_id = isset($d['customer_id']) ? (int)$d['customer_id'] : (isset($d['guest_id']) ? (int)$d['guest_id'] : 0);
        // If customer is booking for themselves, override with their own id
        if ($authUser['role'] === 'customer') {
            $customer_id = (int)$authUser['id'];
        }
        if (!$customer_id) {
            http_response_code(400);
            echo json_encode(['error' => 'Guest/customer is required']);
            break;
        }

        $stmt = $conn->prepare("SELECT price_per_night FROM rooms WHERE id=?");
        $stmt->bind_param("i", $d['room_id']); $stmt->execute();
        $room = $stmt->get_result()->fetch_assoc();
        if (!$room) { http_response_code(400); echo json_encode(['error' => 'Room not found']); break; }

        $nights = max(1, (strtotime($d['check_out']) - strtotime($d['check_in'])) / 86400);
        $total = $room['price_per_night'] * $nights;
        $recep = $authUser['role'] !== 'customer' ? $authUser['id'] : null;
        $special = $d['special_requests'] ?? '';
        $status = $d['status'] ?? 'pending';
        $adults = (int)($d['adults'] ?? 1);
        $children = (int)($d['children'] ?? 0);

        $stmt = $conn->prepare("INSERT INTO bookings (customer_id,room_id,receptionist_id,check_in,check_out,adults,children,special_requests,total_amount,status) VALUES (?,?,?,?,?,?,?,?,?,?)");
        $stmt->bind_param("iiissiisds", $customer_id, $d['room_id'], $recep, $d['check_in'], $d['check_out'], $adults, $children, $special, $total, $status);
        if ($stmt->execute()) {
            $newId = $conn->insert_id;
            $conn->query("UPDATE rooms SET status='occupied' WHERE id=" . (int)$d['room_id']);
            // Notify customer
            $msg = "Your booking has been received and is pending confirmation.";
            $notif = $conn->prepare("INSERT INTO notifications (user_id,title,message,type) VALUES (?,'Booking Received',?,'info')");
            $notif->bind_param("is", $customer_id, $msg); $notif->execute();
            echo json_encode(['id' => $newId, 'total_amount' => $total, 'message' => 'Booking created']);
        } else { http_response_code(400); echo json_encode(['error' => $conn->error]); }
        break;
    case 'PUT':
        $d = json_decode(file_get_contents('php://input'), true);

        // Full edit (from staff booking form): updates all fields
        if (isset($d['check_in']) && isset($d['check_out'])) {
            // Recalculate total based on updated room/dates
            $new_room_id = (int)($d['room_id'] ?? 0);
            $customer_id = isset($d['guest_id']) ? (int)$d['guest_id'] : (isset($d['customer_id']) ? (int)$d['customer_id'] : 0);
            $stmt2 = $conn->prepare("SELECT price_per_night FROM rooms WHERE id=?");
            $stmt2->bind_param("i", $new_room_id); $stmt2->execute();
            $roomData = $stmt2->get_result()->fetch_assoc();
            $nights = max(1, (strtotime($d['check_out']) - strtotime($d['check_in'])) / 86400);
            $total = $roomData ? ($roomData['price_per_night'] * $nights) : 0;
            $special = $d['special_requests'] ?? '';
            $adults = (int)($d['adults'] ?? 1);
            $children = (int)($d['children'] ?? 0);
            $status = $d['status'] ?? 'pending';

            // 10 params: customer_id(i), room_id(i), check_in(s), check_out(s), adults(i), children(i), special_requests(s), total_amount(d), status(s), id(i)
            $stmt = $conn->prepare("UPDATE bookings SET customer_id=?,room_id=?,check_in=?,check_out=?,adults=?,children=?,special_requests=?,total_amount=?,status=? WHERE id=?");
            $stmt->bind_param("iissiisdsi", $customer_id, $new_room_id, $d['check_in'], $d['check_out'], $adults, $children, $special, $total, $status, $id);
            $stmt->execute();

            // Update old room back to available if room changed
            if ($new_room_id) {
                // Set new room occupied
                $conn->query("UPDATE rooms SET status='occupied' WHERE id=" . $new_room_id);
            }
        } else {
            // Status-only update (inline status dropdown)
            $stmt = $conn->prepare("UPDATE bookings SET status=? WHERE id=?");
            $stmt->bind_param("si", $d['status'], $id); $stmt->execute();
        }

        // Always sync room status based on final booking status
        $final_status = $d['status'] ?? '';
        $room_id_for_sync = (int)($d['room_id'] ?? 0);
        if ($room_id_for_sync) {
            if (in_array($final_status, ['checked_out', 'cancelled'])) {
                $conn->query("UPDATE rooms SET status='available' WHERE id=" . $room_id_for_sync);
            } elseif ($final_status === 'checked_in') {
                $conn->query("UPDATE rooms SET status='occupied' WHERE id=" . $room_id_for_sync);
            }
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

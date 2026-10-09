<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$user = authenticate();
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;

switch ($method) {
    case 'GET':
        $status = $_GET['status'] ?? null;
        if ($id) {
            $stmt = $conn->prepare("SELECT * FROM rooms WHERE id=?");
            $stmt->bind_param("i", $id); $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_assoc());
        } elseif ($status) {
            $stmt = $conn->prepare("SELECT * FROM rooms WHERE status=? ORDER BY room_number");
            $stmt->bind_param("s", $status); $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            echo json_encode($conn->query("SELECT * FROM rooms ORDER BY room_number")->fetch_all(MYSQLI_ASSOC));
        }
        break;
    case 'POST':
        authenticate(['admin','manager','receptionist']);
        $d = json_decode(file_get_contents('php://input'), true);
        $stmt = $conn->prepare("INSERT INTO rooms (room_number,type,floor,price_per_night,status,description,amenities,max_guests) VALUES (?,?,?,?,?,?,?,?)");
        $stmt->bind_param("ssidsssi", $d['room_number'], $d['type'], $d['floor'], $d['price_per_night'], $d['status'], $d['description'], $d['amenities'], $d['max_guests']);
        if ($stmt->execute()) echo json_encode(['id' => $conn->insert_id, 'message' => 'Room created']);
        else { http_response_code(400); echo json_encode(['error' => $conn->error]); }
        break;
    case 'PUT':
        authenticate(['admin','manager','receptionist']);
        $d = json_decode(file_get_contents('php://input'), true);
        $stmt = $conn->prepare("UPDATE rooms SET room_number=?,type=?,floor=?,price_per_night=?,status=?,description=?,amenities=?,max_guests=? WHERE id=?");
        $stmt->bind_param("ssidsssi", $d['room_number'], $d['type'], (int)$d['floor'], (float)$d['price_per_night'], $d['status'], $d['description'], $d['amenities'], (int)$d['max_guests'], $id);
        $stmt->execute(); echo json_encode(['message' => 'Room updated']);
        break;
    case 'DELETE':
        authenticate(['admin']);
        $stmt = $conn->prepare("DELETE FROM rooms WHERE id=?");
        $stmt->bind_param("i", $id); $stmt->execute();
        echo json_encode(['message' => 'Room deleted']);
        break;
}
$conn->close();

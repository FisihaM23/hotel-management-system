<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$user = null;
$auth = getAuthorizationHeader();
if ($auth && str_starts_with($auth, 'Bearer ')) {
    try {
        $user = authenticate();
    } catch (\Throwable $e) {
        $user = null;
    }
}
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;
$frontDesk = ['admin', 'manager', 'receptionist'];

switch ($method) {
    case 'GET':
        // Auto-heal: Ensure rooms marked 'occupied' return to 'available' if all bookings were deleted or completed
        $conn->query("UPDATE rooms r 
            SET r.status = 'available' 
            WHERE r.status = 'occupied' 
            AND NOT EXISTS (
                SELECT 1 FROM bookings b 
                WHERE b.room_id = r.id 
                AND b.status IN ('checked_in', 'confirmed') 
                AND b.check_out >= CURDATE()
            )");

        $status = $_GET['status'] ?? null;
        if ($id) {
            $stmt = $conn->prepare("SELECT r.*,
                CASE WHEN r.status = 'occupied' THEN 1
                     WHEN EXISTS (SELECT 1 FROM bookings b WHERE b.room_id = r.id AND b.status IN ('confirmed','checked_in') AND b.check_in <= CURDATE() AND b.check_out >= CURDATE()) THEN 1
                     ELSE 0 END AS is_booked
                FROM rooms r WHERE r.id=?");
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $room = $stmt->get_result()->fetch_assoc();
            json_ok($room);
        } elseif (!empty($status)) {
            $stmt = $conn->prepare("SELECT r.*,
                CASE WHEN r.status = 'occupied' THEN 1
                     WHEN EXISTS (SELECT 1 FROM bookings b WHERE b.room_id = r.id AND b.status IN ('confirmed','checked_in') AND b.check_in <= CURDATE() AND b.check_out >= CURDATE()) THEN 1
                     ELSE 0 END AS is_booked
                FROM rooms r WHERE r.status=? ORDER BY r.room_number");
            $stmt->bind_param('s', $status);
            $stmt->execute();
            json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            $sql = "SELECT r.*,
                CASE WHEN r.status = 'occupied' THEN 1
                     WHEN EXISTS (SELECT 1 FROM bookings b WHERE b.room_id = r.id AND b.status IN ('confirmed','checked_in') AND b.check_in <= CURDATE() AND b.check_out >= CURDATE()) THEN 1
                     ELSE 0 END AS is_booked
                FROM rooms r ORDER BY r.room_number";
            json_ok($conn->query($sql)->fetch_all(MYSQLI_ASSOC));
        }
        break;

    case 'POST':
        authenticate($frontDesk);
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $room_number = $d['room_number'] ?? '';
        $type = $d['type'] ?? '';
        $floor = (int) ($d['floor'] ?? 1);
        $price = (float) ($d['price_per_night'] ?? 0);
        $status = $d['status'] ?? 'available';
        $description = $d['description'] ?? '';
        $amenities = $d['amenities'] ?? '';
        $max_guests = (int) ($d['max_guests'] ?? 2);
        $stmt = $conn->prepare("INSERT INTO rooms (room_number,type,floor,price_per_night,status,description,amenities,max_guests) VALUES (?,?,?,?,?,?,?,?)");
        $stmt->bind_param('ssidsssi', $room_number, $type, $floor, $price, $status, $description, $amenities, $max_guests);
        executeOrFail($stmt, $conn);
        json_ok(['id' => $conn->insert_id, 'message' => 'Room created']);
        break;

    case 'PUT':
        authenticate($frontDesk);
        if (!$id) {
            json_fail(400, 'Room ID is required');
        }
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $room_number = $d['room_number'] ?? '';
        $type = $d['type'] ?? '';
        $floor = (int) ($d['floor'] ?? 1);
        $price = (float) ($d['price_per_night'] ?? 0);
        $status = $d['status'] ?? 'available';
        $description = $d['description'] ?? '';
        $amenities = $d['amenities'] ?? '';
        $max_guests = (int) ($d['max_guests'] ?? 2);
        $stmt = $conn->prepare("UPDATE rooms SET room_number=?,type=?,floor=?,price_per_night=?,status=?,description=?,amenities=?,max_guests=? WHERE id=?");
        $stmt->bind_param('ssidsssii', $room_number, $type, $floor, $price, $status, $description, $amenities, $max_guests, $id);
        executeOrFail($stmt, $conn);
        json_ok(['message' => 'Room updated']);
        break;

    case 'DELETE':
        authenticate(['admin']);
        if (!$id) {
            json_fail(400, 'Room ID is required');
        }
        $stmt = $conn->prepare("DELETE FROM rooms WHERE id=?");
        $stmt->bind_param('i', $id);
        executeOrFail($stmt, $conn);
        if ($stmt->affected_rows < 1) {
            json_fail(400, 'Room could not be deleted (it may still have bookings)');
        }
        json_ok(['message' => 'Room deleted']);
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

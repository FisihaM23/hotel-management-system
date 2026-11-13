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
        $status = $_GET['status'] ?? null;
        $checkIn = trim($_GET['check_in'] ?? '');
        $checkOut = trim($_GET['check_out'] ?? '');
        $hasCheckIn = $checkIn !== '';
        $hasCheckOut = $checkOut !== '';
        $hasDateRange = false;

        if ($hasCheckIn || $hasCheckOut) {
            if (!$hasCheckIn || !$hasCheckOut) {
                json_fail(400, 'Both check_in and check_out query parameters must be supplied together.');
            }
            $ciDt = DateTime::createFromFormat('Y-m-d', $checkIn);
            $coDt = DateTime::createFromFormat('Y-m-d', $checkOut);
            if (!$ciDt || $ciDt->format('Y-m-d') !== $checkIn || !$coDt || $coDt->format('Y-m-d') !== $checkOut) {
                json_fail(400, 'check_in and check_out must be valid YYYY-MM-DD dates.');
            }
            if ($checkOut <= $checkIn) {
                json_fail(400, 'check_out must be after check_in.');
            }
            $hasDateRange = true;
        }

        $types = '';
        $params = [];

        if ($hasDateRange) {
            $isBookedExpr = "CASE
                WHEN r.status = 'maintenance' THEN 1
                WHEN ? <= CURDATE() AND r.status = 'occupied' THEN 1
                WHEN EXISTS (
                    SELECT 1 FROM bookings b
                    WHERE b.room_id = r.id
                    AND b.deleted_at IS NULL
                    AND b.status IN ('pending', 'confirmed', 'checked_in')
                    AND b.check_in < ? AND b.check_out > ?
                ) THEN 1
                ELSE 0 END AS is_booked";
            $types .= 'sss';
            $params[] = $checkIn;
            $params[] = $checkOut;
            $params[] = $checkIn;
        } else {
            $isBookedExpr = "CASE
                WHEN r.status = 'occupied' THEN 1
                WHEN EXISTS (
                    SELECT 1 FROM bookings b
                    WHERE b.room_id = r.id
                    AND b.deleted_at IS NULL
                    AND b.status = 'checked_in'
                ) THEN 1
                ELSE 0 END AS is_booked";
        }

        $where = [];
        if ($id) {
            $where[] = 'r.id = ?';
            $types .= 'i';
            $params[] = $id;
        } elseif (!empty($status)) {
            $where[] = 'r.status = ?';
            $types .= 's';
            $params[] = $status;
        }

        $sql = "SELECT r.*, $isBookedExpr FROM rooms r"
            . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
            . ($id ? '' : ' ORDER BY r.room_number');

        if ($types !== '') {
            $stmt = $conn->prepare($sql);
            $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $res = $stmt->get_result();
        } else {
            $res = $conn->query($sql);
        }

        if ($id) {
            $room = $res->fetch_assoc();
            if ($room) {
                $room['is_booked'] = (int) $room['is_booked'];
                $room['is_available_for_dates'] = $hasDateRange
                    ? ($room['is_booked'] === 0 ? 1 : 0)
                    : (($room['status'] === 'available' && $room['is_booked'] === 0) ? 1 : 0);
            }
            json_ok($room);
        } else {
            $rooms = $res->fetch_all(MYSQLI_ASSOC);
            foreach ($rooms as &$rm) {
                $rm['is_booked'] = (int) $rm['is_booked'];
                $rm['is_available_for_dates'] = $hasDateRange
                    ? ($rm['is_booked'] === 0 ? 1 : 0)
                    : (($rm['status'] === 'available' && $rm['is_booked'] === 0) ? 1 : 0);
            }
            json_ok($rooms);
        }
        break;

    case 'POST':
        authenticate($frontDesk);
        $action = $_GET['action'] ?? '';
        if ($action === 'reconcile') {
            authenticate(['admin', 'manager']);
            $healedCount = RoomStatusService::reconcileAllRooms($conn);
            json_ok(['message' => 'Room reconciliation completed', 'healed_count' => $healedCount]);
            break;
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
        $exStmt = $conn->prepare("SELECT * FROM rooms WHERE id = ? LIMIT 1");
        $exStmt->bind_param('i', $id);
        $exStmt->execute();
        $existingRoom = $exStmt->get_result()->fetch_assoc();
        $exStmt->close();
        if (!$existingRoom) {
            json_fail(404, 'Room not found');
        }

        $d = json_decode(file_get_contents('php://input'), true);
        if (!is_array($d) || empty($d)) {
            json_fail(400, 'No update fields provided');
        }

        $updates = [];
        $types = '';
        $values = [];

        if (array_key_exists('room_number', $d)) {
            $rn = trim((string) $d['room_number']);
            if ($rn === '') {
                json_fail(400, 'room_number cannot be empty');
            }
            $updates[] = 'room_number = ?';
            $types .= 's';
            $values[] = $rn;
        }
        if (array_key_exists('type', $d)) {
            $tp = trim((string) $d['type']);
            if ($tp === '') {
                json_fail(400, 'Room type cannot be empty');
            }
            $updates[] = 'type = ?';
            $types .= 's';
            $values[] = $tp;
        }
        if (array_key_exists('floor', $d)) {
            if (!is_numeric($d['floor']) || (int) $d['floor'] < 0) {
                json_fail(400, 'floor must be a non-negative integer');
            }
            $updates[] = 'floor = ?';
            $types .= 'i';
            $values[] = (int) $d['floor'];
        }
        if (array_key_exists('price_per_night', $d)) {
            if (!is_numeric($d['price_per_night']) || (float) $d['price_per_night'] <= 0) {
                json_fail(400, 'price_per_night must be a positive number');
            }
            $updates[] = 'price_per_night = ?';
            $types .= 'd';
            $values[] = round((float) $d['price_per_night'], 2);
        }
        if (array_key_exists('status', $d)) {
            $st = trim((string) $d['status']);
            if (!in_array($st, ['available', 'occupied', 'cleaning', 'maintenance'], true)) {
                json_fail(400, 'Invalid room status');
            }
            $updates[] = 'status = ?';
            $types .= 's';
            $values[] = $st;
        }
        if (array_key_exists('description', $d)) {
            $updates[] = 'description = ?';
            $types .= 's';
            $values[] = (string) $d['description'];
        }
        if (array_key_exists('amenities', $d)) {
            $updates[] = 'amenities = ?';
            $types .= 's';
            $values[] = (string) $d['amenities'];
        }
        if (array_key_exists('max_guests', $d)) {
            if (!is_numeric($d['max_guests']) || (int) $d['max_guests'] < 1) {
                json_fail(400, 'max_guests must be at least 1');
            }
            $updates[] = 'max_guests = ?';
            $types .= 'i';
            $values[] = (int) $d['max_guests'];
        }

        if (empty($updates)) {
            json_fail(400, 'No valid room fields provided to update');
        }

        $types .= 'i';
        $values[] = $id;
        $stmt = $conn->prepare('UPDATE rooms SET ' . implode(', ', $updates) . ' WHERE id = ?');
        $stmt->bind_param($types, ...$values);
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

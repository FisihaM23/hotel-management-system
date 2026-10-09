<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$authUser = authenticate();
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;

// Ensure resolution_notes column exists
$conn->query("ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS resolution_notes TEXT NULL");

$baseQuery = "SELECT m.*, r.room_number, u1.name as reporter_name, u2.name as assigned_name
              FROM maintenance_requests m
              LEFT JOIN rooms r ON m.room_id = r.id
              JOIN users u1 ON m.reported_by = u1.id
              LEFT JOIN users u2 ON m.assigned_to = u2.id";

switch ($method) {
    case 'GET':
        $status = $_GET['status'] ?? null;
        if ($status) {
            $stmt = $conn->prepare("$baseQuery WHERE m.status=? ORDER BY m.created_at DESC");
            $stmt->bind_param("s", $status); $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            echo json_encode($conn->query("$baseQuery ORDER BY m.created_at DESC")->fetch_all(MYSQLI_ASSOC));
        }
        break;
    case 'POST':
        $d = json_decode(file_get_contents('php://input'), true);
        $room_id = !empty($d['room_id']) ? $d['room_id'] : null;
        $assigned = !empty($d['assigned_to']) ? $d['assigned_to'] : null;
        $stmt = $conn->prepare("INSERT INTO maintenance_requests (room_id,reported_by,assigned_to,category,title,description,priority,status) VALUES (?,?,?,?,?,?,?,?)");
        $stmt->bind_param("iiisssss", $room_id, $authUser['id'], $assigned, $d['category'], $d['title'], $d['description'], $d['priority'], $d['status']);
        if ($stmt->execute()) echo json_encode(['id' => $conn->insert_id, 'message' => 'Request submitted']);
        else { http_response_code(400); echo json_encode(['error' => $conn->error]); }
        break;
    case 'PUT':
        $d = json_decode(file_get_contents('php://input'), true);
        if (isset($d['status']) && count($d) <= 2) {
            $resolved = in_array($d['status'], ['resolved','closed']) ? date('Y-m-d H:i:s') : null;
            if (isset($d['resolution_notes'])) {
                $stmt = $conn->prepare("UPDATE maintenance_requests SET status=?, resolved_at=?, resolution_notes=? WHERE id=?");
                $stmt->bind_param("sssi", $d['status'], $resolved, $d['resolution_notes'], $id);
            } else {
                $stmt = $conn->prepare("UPDATE maintenance_requests SET status=?, resolved_at=? WHERE id=?");
                $stmt->bind_param("ssi", $d['status'], $resolved, $id);
            }
        } else {
            $room_id = !empty($d['room_id']) ? $d['room_id'] : null;
            $assigned = !empty($d['assigned_to']) ? $d['assigned_to'] : null;
            $stmt = $conn->prepare("UPDATE maintenance_requests SET room_id=?,assigned_to=?,category=?,title=?,description=?,priority=?,status=? WHERE id=?");
            $stmt->bind_param("iisssssi", $room_id, $assigned, $d['category'], $d['title'], $d['description'], $d['priority'], $d['status'], $id);
        }
        $stmt->execute(); echo json_encode(['message' => 'Request updated']);
        break;
}
$conn->close();

<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

authenticate();
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;

$baseQuery = "SELECT h.*, r.room_number, u.name as assigned_name
              FROM housekeeping_tasks h
              JOIN rooms r ON h.room_id = r.id
              LEFT JOIN users u ON h.assigned_to = u.id";

switch ($method) {
    case 'GET':
        $status = $_GET['status'] ?? null;
        if ($status) {
            $stmt = $conn->prepare("$baseQuery WHERE h.status=? ORDER BY h.scheduled_date, h.priority DESC");
            $stmt->bind_param("s", $status); $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            echo json_encode($conn->query("$baseQuery ORDER BY h.scheduled_date, h.priority DESC")->fetch_all(MYSQLI_ASSOC));
        }
        break;
    case 'POST':
        authenticate(['admin','manager']);
        $d = json_decode(file_get_contents('php://input'), true);
        $assigned = !empty($d['assigned_to']) ? $d['assigned_to'] : null;
        $stmt = $conn->prepare("INSERT INTO housekeeping_tasks (room_id,assigned_to,task_type,priority,status,notes,scheduled_date) VALUES (?,?,?,?,?,?,?)");
        $stmt->bind_param("iisssss", $d['room_id'], $assigned, $d['task_type'], $d['priority'], $d['status'], $d['notes'], $d['scheduled_date']);
        if ($stmt->execute()) echo json_encode(['id' => $conn->insert_id, 'message' => 'Task created']);
        else { http_response_code(400); echo json_encode(['error' => $conn->error]); }
        break;
    case 'PUT':
        $d = json_decode(file_get_contents('php://input'), true);
        if (isset($d['status']) && count($d) <= 2) {
            // Status-only or status+notes update (from housekeeping staff)
            $completed = $d['status'] === 'completed' ? date('Y-m-d H:i:s') : null;
            if (isset($d['notes'])) {
                $stmt = $conn->prepare("UPDATE housekeeping_tasks SET status=?, notes=?, completed_at=? WHERE id=?");
                $stmt->bind_param("sssi", $d['status'], $d['notes'], $completed, $id);
            } else {
                $stmt = $conn->prepare("UPDATE housekeeping_tasks SET status=?, completed_at=? WHERE id=?");
                $stmt->bind_param("ssi", $d['status'], $completed, $id);
            }
        } else {
            $assigned = !empty($d['assigned_to']) ? $d['assigned_to'] : null;
            $stmt = $conn->prepare("UPDATE housekeeping_tasks SET room_id=?,assigned_to=?,task_type=?,priority=?,status=?,notes=?,scheduled_date=? WHERE id=?");
            $stmt->bind_param("iisssssi", $d['room_id'], $assigned, $d['task_type'], $d['priority'], $d['status'], $d['notes'], $d['scheduled_date'], $id);
        }
        $stmt->execute(); echo json_encode(['message' => 'Task updated']);
        break;
    case 'DELETE':
        authenticate(['admin','manager']);
        $stmt = $conn->prepare("DELETE FROM housekeeping_tasks WHERE id=?");
        $stmt->bind_param("i", $id); $stmt->execute();
        echo json_encode(['message' => 'Task deleted']);
        break;
}
$conn->close();

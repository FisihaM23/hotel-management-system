<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$authUser = authenticate(['admin', 'manager', 'housekeeping']);
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;

$baseQuery = "SELECT h.*, r.room_number, u.name as assigned_name
              FROM housekeeping_tasks h
              JOIN rooms r ON h.room_id = r.id
              LEFT JOIN users u ON h.assigned_to = u.id";

switch ($method) {
    case 'GET':
        $status = $_GET['status'] ?? null;
        if ($status) {
            $stmt = $conn->prepare("$baseQuery WHERE h.status=? ORDER BY h.scheduled_date, h.priority DESC");
            $stmt->bind_param('s', $status);
            $stmt->execute();
            json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            json_ok($conn->query("$baseQuery ORDER BY h.scheduled_date, h.priority DESC")->fetch_all(MYSQLI_ASSOC));
        }
        break;

    case 'POST':
        authenticate(['admin', 'manager']);
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $room_id = (int) ($d['room_id'] ?? 0);
        $assigned = !empty($d['assigned_to']) ? (int) $d['assigned_to'] : null;
        $task_type = $d['task_type'] ?? 'cleaning';
        $priority = $d['priority'] ?? 'medium';
        $status = $d['status'] ?? 'pending';
        $notes = $d['notes'] ?? '';
        $scheduled = $d['scheduled_date'] ?? date('Y-m-d');
        $stmt = $conn->prepare("INSERT INTO housekeeping_tasks (room_id,assigned_to,task_type,priority,status,notes,scheduled_date) VALUES (?,?,?,?,?,?,?)");
        $stmt->bind_param('iisssss', $room_id, $assigned, $task_type, $priority, $status, $notes, $scheduled);
        executeOrFail($stmt, $conn);
        json_ok(['id' => $conn->insert_id, 'message' => 'Task created']);
        break;

    case 'PUT':
        if (!$id) {
            json_fail(400, 'Task ID is required');
        }
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        if ($authUser['role'] === 'housekeeping' || (isset($d['status']) && count($d) <= 2)) {
            $completed = (($d['status'] ?? '') === 'completed') ? date('Y-m-d H:i:s') : null;
            if (isset($d['notes'])) {
                $stmt = $conn->prepare("UPDATE housekeeping_tasks SET status=?, notes=?, completed_at=? WHERE id=?");
                $stmt->bind_param('sssi', $d['status'], $d['notes'], $completed, $id);
            } else {
                $stmt = $conn->prepare("UPDATE housekeeping_tasks SET status=?, completed_at=? WHERE id=?");
                $stmt->bind_param('ssi', $d['status'], $completed, $id);
            }
        } else {
            authenticate(['admin', 'manager']);
            $assigned = !empty($d['assigned_to']) ? (int) $d['assigned_to'] : null;
            $room_id = (int) ($d['room_id'] ?? 0);
            $stmt = $conn->prepare("UPDATE housekeeping_tasks SET room_id=?,assigned_to=?,task_type=?,priority=?,status=?,notes=?,scheduled_date=? WHERE id=?");
            $stmt->bind_param('iisssssi', $room_id, $assigned, $d['task_type'], $d['priority'], $d['status'], $d['notes'], $d['scheduled_date'], $id);
        }
        executeOrFail($stmt, $conn);
        json_ok(['message' => 'Task updated']);
        break;

    case 'DELETE':
        authenticate(['admin', 'manager']);
        if (!$id) {
            json_fail(400, 'Task ID is required');
        }
        $stmt = $conn->prepare("DELETE FROM housekeeping_tasks WHERE id=?");
        $stmt->bind_param('i', $id);
        executeOrFail($stmt, $conn);
        json_ok(['message' => 'Task deleted']);
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

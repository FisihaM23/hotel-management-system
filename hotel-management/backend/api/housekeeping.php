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
        $newTaskId = (int) $conn->insert_id;
        $roomStatus = $room_id > 0 ? RoomStatusService::onHousekeepingUpdated($conn, $room_id, $status) : null;
        json_ok(['id' => $newTaskId, 'room_status' => $roomStatus, 'message' => 'Task created']);
        break;

    case 'PUT':
        if (!$id) {
            json_fail(400, 'Task ID is required');
        }
        $existingStmt = $conn->prepare("SELECT room_id, assigned_to, task_type, priority, status, notes, scheduled_date FROM housekeeping_tasks WHERE id=?");
        $existingStmt->bind_param('i', $id);
        $existingStmt->execute();
        $existingTask = $existingStmt->get_result()->fetch_assoc();
        $existingStmt->close();
        if (!$existingTask) {
            json_fail(404, 'Task not found');
        }

        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $newStatus = $d['status'] ?? $existingTask['status'];
        if (!in_array($newStatus, ['pending', 'in_progress', 'completed', 'cancelled'], true)) {
            json_fail(400, 'Invalid housekeeping task status');
        }
        $targetRoomId = (int) $existingTask['room_id'];

        if ($authUser['role'] === 'housekeeping' || (isset($d['status']) && count($d) <= 2)) {
            $completed = ($newStatus === 'completed') ? date('Y-m-d H:i:s') : null;
            if (array_key_exists('notes', $d)) {
                $stmt = $conn->prepare("UPDATE housekeeping_tasks SET status=?, notes=?, completed_at=? WHERE id=?");
                $stmt->bind_param('sssi', $newStatus, $d['notes'], $completed, $id);
            } else {
                $stmt = $conn->prepare("UPDATE housekeeping_tasks SET status=?, completed_at=? WHERE id=?");
                $stmt->bind_param('ssi', $newStatus, $completed, $id);
            }
        } else {
            authenticate(['admin', 'manager']);
            $assigned = array_key_exists('assigned_to', $d) ? (!empty($d['assigned_to']) ? (int) $d['assigned_to'] : null) : ($existingTask['assigned_to'] !== null ? (int) $existingTask['assigned_to'] : null);
            $targetRoomId = array_key_exists('room_id', $d) && !empty($d['room_id']) ? (int) $d['room_id'] : (int) $existingTask['room_id'];
            $taskType = array_key_exists('task_type', $d) ? (string) $d['task_type'] : $existingTask['task_type'];
            $priority = array_key_exists('priority', $d) ? (string) $d['priority'] : $existingTask['priority'];
            $notes = array_key_exists('notes', $d) ? (string) $d['notes'] : $existingTask['notes'];
            $scheduledDate = array_key_exists('scheduled_date', $d) ? (string) $d['scheduled_date'] : $existingTask['scheduled_date'];
            $completed = ($newStatus === 'completed') ? date('Y-m-d H:i:s') : null;
            $stmt = $conn->prepare("UPDATE housekeeping_tasks SET room_id=?,assigned_to=?,task_type=?,priority=?,status=?,notes=?,scheduled_date=?,completed_at=? WHERE id=?");
            $stmt->bind_param('iissssssi', $targetRoomId, $assigned, $taskType, $priority, $newStatus, $notes, $scheduledDate, $completed, $id);
        }
        executeOrFail($stmt, $conn);

        if ((int) $existingTask['room_id'] !== $targetRoomId && (int) $existingTask['room_id'] > 0) {
            RoomStatusService::onHousekeepingUpdated($conn, (int) $existingTask['room_id'], 'deleted');
        }
        $roomStatus = $targetRoomId > 0 ? RoomStatusService::onHousekeepingUpdated($conn, $targetRoomId, $newStatus) : null;
        json_ok(['message' => 'Task updated', 'room_status' => $roomStatus]);
        break;

    case 'DELETE':
        authenticate(['admin', 'manager']);
        if (!$id) {
            json_fail(400, 'Task ID is required');
        }
        $existingStmt = $conn->prepare("SELECT room_id FROM housekeeping_tasks WHERE id=?");
        $existingStmt->bind_param('i', $id);
        $existingStmt->execute();
        $existingTask = $existingStmt->get_result()->fetch_assoc();
        $existingStmt->close();

        $stmt = $conn->prepare("DELETE FROM housekeeping_tasks WHERE id=?");
        $stmt->bind_param('i', $id);
        executeOrFail($stmt, $conn);
        if ($existingTask && !empty($existingTask['room_id'])) {
            RoomStatusService::onHousekeepingUpdated($conn, (int) $existingTask['room_id'], 'deleted');
        }
        json_ok(['message' => 'Task deleted']);
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

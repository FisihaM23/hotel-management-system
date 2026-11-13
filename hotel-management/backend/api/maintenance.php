<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$authUser = authenticate(['admin', 'manager', 'maintenance']);
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;

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
            $stmt->bind_param('s', $status);
            $stmt->execute();
            json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            json_ok($conn->query("$baseQuery ORDER BY m.created_at DESC")->fetch_all(MYSQLI_ASSOC));
        }
        break;

    case 'POST':
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $room_id = !empty($d['room_id']) ? (int) $d['room_id'] : null;
        $assigned = !empty($d['assigned_to']) ? (int) $d['assigned_to'] : null;
        $category = $d['category'] ?? 'general';
        $title = $d['title'] ?? '';
        $description = $d['description'] ?? '';
        $priority = $d['priority'] ?? 'medium';
        $status = $d['status'] ?? 'open';
        if (!$title) {
            json_fail(400, 'Title is required');
        }
        $stmt = $conn->prepare("INSERT INTO maintenance_requests (room_id,reported_by,assigned_to,category,title,description,priority,status) VALUES (?,?,?,?,?,?,?,?)");
        $stmt->bind_param('iiisssss', $room_id, $authUser['id'], $assigned, $category, $title, $description, $priority, $status);
        executeOrFail($stmt, $conn);
        $newReqId = (int) $conn->insert_id;
        $roomStatus = $room_id ? RoomStatusService::onMaintenanceUpdated($conn, $room_id, $status) : null;
        json_ok(['id' => $newReqId, 'room_status' => $roomStatus, 'message' => 'Request submitted']);
        break;

    case 'PUT':
        if (!$id) {
            json_fail(400, 'Request ID is required');
        }
        $existingStmt = $conn->prepare("SELECT room_id, assigned_to, category, title, description, priority, status FROM maintenance_requests WHERE id=?");
        $existingStmt->bind_param('i', $id);
        $existingStmt->execute();
        $existingReq = $existingStmt->get_result()->fetch_assoc();
        $existingStmt->close();
        if (!$existingReq) {
            json_fail(404, 'Maintenance request not found');
        }

        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $newStatus = $d['status'] ?? $existingReq['status'];
        if (!in_array($newStatus, ['open', 'in_progress', 'resolved', 'closed'], true)) {
            json_fail(400, 'Invalid maintenance status');
        }
        $targetRoomId = !empty($existingReq['room_id']) ? (int) $existingReq['room_id'] : null;

        if ($authUser['role'] === 'maintenance' || (isset($d['status']) && count($d) <= 2)) {
            $resolved = in_array($newStatus, ['resolved', 'closed'], true) ? date('Y-m-d H:i:s') : null;
            if (array_key_exists('resolution_notes', $d)) {
                $stmt = $conn->prepare("UPDATE maintenance_requests SET status=?, resolved_at=?, resolution_notes=? WHERE id=?");
                $stmt->bind_param('sssi', $newStatus, $resolved, $d['resolution_notes'], $id);
            } else {
                $stmt = $conn->prepare("UPDATE maintenance_requests SET status=?, resolved_at=? WHERE id=?");
                $stmt->bind_param('ssi', $newStatus, $resolved, $id);
            }
        } else {
            authenticate(['admin', 'manager']);
            $targetRoomId = array_key_exists('room_id', $d) ? (!empty($d['room_id']) ? (int) $d['room_id'] : null) : ($existingReq['room_id'] !== null ? (int) $existingReq['room_id'] : null);
            $assigned = array_key_exists('assigned_to', $d) ? (!empty($d['assigned_to']) ? (int) $d['assigned_to'] : null) : ($existingReq['assigned_to'] !== null ? (int) $existingReq['assigned_to'] : null);
            $category = array_key_exists('category', $d) ? (string) $d['category'] : $existingReq['category'];
            $title = array_key_exists('title', $d) ? (string) $d['title'] : $existingReq['title'];
            $description = array_key_exists('description', $d) ? (string) $d['description'] : $existingReq['description'];
            $priority = array_key_exists('priority', $d) ? (string) $d['priority'] : $existingReq['priority'];
            $resolved = in_array($newStatus, ['resolved', 'closed'], true) ? date('Y-m-d H:i:s') : null;
            $stmt = $conn->prepare("UPDATE maintenance_requests SET room_id=?,assigned_to=?,category=?,title=?,description=?,priority=?,status=?,resolved_at=? WHERE id=?");
            $stmt->bind_param('iissssssi', $targetRoomId, $assigned, $category, $title, $description, $priority, $newStatus, $resolved, $id);
        }
        executeOrFail($stmt, $conn);

        $oldRoomId = !empty($existingReq['room_id']) ? (int) $existingReq['room_id'] : null;
        if ($oldRoomId && $oldRoomId !== $targetRoomId) {
            RoomStatusService::onMaintenanceUpdated($conn, $oldRoomId, 'resolved');
        }
        $roomStatus = $targetRoomId ? RoomStatusService::onMaintenanceUpdated($conn, $targetRoomId, $newStatus) : null;
        json_ok(['message' => 'Request updated', 'room_status' => $roomStatus]);
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

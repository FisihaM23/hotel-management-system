<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

authenticate(['admin', 'manager', 'receptionist']);
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;

$selectFields = "id, name, email, phone, address, id_proof, id_number, reason_for_stay, created_at";

switch ($method) {
    case 'GET':
        $search = isset($_GET['search']) ? '%' . $_GET['search'] . '%' : null;
        if ($search) {
            $stmt = $conn->prepare("SELECT $selectFields FROM users WHERE role='customer' AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR id_number LIKE ? OR reason_for_stay LIKE ?) ORDER BY name");
            $stmt->bind_param('sssss', $search, $search, $search, $search, $search);
            $stmt->execute();
            json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            json_ok($conn->query("SELECT $selectFields FROM users WHERE role='customer' ORDER BY created_at DESC")->fetch_all(MYSQLI_ASSOC));
        }
        break;

    case 'POST':
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $name      = trim($d['name'] ?? '');
        $email     = trim($d['email'] ?? '');
        $phone     = trim($d['phone'] ?? '');
        $address   = trim($d['address'] ?? '');
        $id_proof  = trim($d['id_proof'] ?? 'National ID');
        $id_number = trim($d['id_number'] ?? '');
        $reason    = trim($d['reason_for_stay'] ?? 'Tourism / Leisure');

        if (!$name || !$email) {
            json_fail(400, 'Name and email are required');
        }

        // Check if email already exists
        $chk = $conn->prepare("SELECT id FROM users WHERE email = ?");
        $chk->bind_param('s', $email);
        $chk->execute();
        if ($chk->get_result()->fetch_assoc()) {
            json_fail(409, 'A customer with this email address is already registered');
        }

        $plain = randomGuestPassword();
        $hash = password_hash($plain, PASSWORD_BCRYPT);
        $role = 'customer';
        $stmt = $conn->prepare("INSERT INTO users (name, email, password, role, phone, address, id_proof, id_number, reason_for_stay) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('sssssssss', $name, $email, $hash, $role, $phone, $address, $id_proof, $id_number, $reason);
        executeOrFail($stmt, $conn);
        json_ok(['id' => $conn->insert_id, 'message' => 'Guest registered successfully', 'temporary_password' => $plain]);
        break;

    case 'PUT':
        if (!$id) {
            json_fail(400, 'Guest ID is required');
        }
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $name      = trim($d['name'] ?? '');
        $email     = trim($d['email'] ?? '');
        $phone     = trim($d['phone'] ?? '');
        $address   = trim($d['address'] ?? '');
        $id_proof  = trim($d['id_proof'] ?? 'National ID');
        $id_number = trim($d['id_number'] ?? '');
        $reason    = trim($d['reason_for_stay'] ?? 'Tourism / Leisure');

        if (!$name || !$email) {
            json_fail(400, 'Name and email are required');
        }

        $stmt = $conn->prepare("UPDATE users SET name=?, email=?, phone=?, address=?, id_proof=?, id_number=?, reason_for_stay=? WHERE id=? AND role='customer'");
        $stmt->bind_param('sssssssi', $name, $email, $phone, $address, $id_proof, $id_number, $reason, $id);
        executeOrFail($stmt, $conn);
        json_ok(['message' => 'Guest details updated successfully']);
        break;

    case 'DELETE':
        if (!$id) {
            json_fail(400, 'Guest ID is required');
        }
        $stmt = $conn->prepare("DELETE FROM users WHERE id=? AND role='customer'");
        $stmt->bind_param('i', $id);
        executeOrFail($stmt, $conn);
        if ($stmt->affected_rows < 1) {
            json_fail(400, 'Guest could not be deleted (they may still have active bookings)');
        }
        json_ok(['message' => 'Guest deleted']);
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

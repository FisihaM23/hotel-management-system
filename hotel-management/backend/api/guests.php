<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

authenticate(['admin', 'manager', 'receptionist']);
$conn = getConnection();
$conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS reason_for_stay VARCHAR(100) DEFAULT 'Tourism / Leisure'");
$conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS id_proof VARCHAR(50) DEFAULT 'National ID'");
$conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS id_number VARCHAR(100) DEFAULT ''");
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
        if (!isValidUserEmail($email)) {
            json_fail(400, emailPolicyMessage());
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
        $newGuestId = $conn->insert_id;

        // Welcome in-app notification directly for the newly registered guest
        $guestTitle = "🎉 Welcome to Grand 6-Floor Hotel & Resort Park!";
        $guestMsg = "Dear {$name}, your customer portal account ({$email}) has been provisioned. Your temporary password is: {$plain}. Experience our 6-floor luxury suites, resort gardens, and authentic Ethiopian dining feasts (Doro Wat, Special Tibs, Kitfo).";
        $gNotif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'success')");
        $gNotif->bind_param('iss', $newGuestId, $guestTitle, $guestMsg);
        $gNotif->execute();

        // Dispatch Welcome Email via Resend with multi-channel fallback
        require_once __DIR__ . '/../config/resend.php';
        $emailRes = sendCustomerWelcomeEmail($email, $name, ['phone' => $phone]);

        json_ok([
            'id' => $newGuestId,
            'message' => 'Guest registered successfully',
            'temporary_password' => $plain,
            'email_sent' => !empty($emailRes['success']),
            'notification_created' => true
        ]);
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
        if (!isValidUserEmail($email)) {
            json_fail(400, emailPolicyMessage());
        }

        // Ensure email isn't taken by another user
        $chk = $conn->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
        $chk->bind_param('si', $email, $id);
        $chk->execute();
        if ($chk->get_result()->fetch_assoc()) {
            json_fail(409, 'Another customer is already registered with this email address');
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
        $chk = $conn->prepare("SELECT role FROM users WHERE id = ?");
        $chk->bind_param('i', $id);
        $chk->execute();
        $target = $chk->get_result()->fetch_assoc();
        if (!$target) {
            json_fail(404, 'Guest not found');
        }
        if ($target['role'] !== 'customer') {
            json_fail(403, 'Only guest / customer records can be deleted from the guest directory');
        }
        $res = deleteUserSafely($conn, $id);
        if (!$res['success']) {
            json_fail(400, $res['error']);
        }
        json_ok(['message' => 'Guest deleted successfully']);
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

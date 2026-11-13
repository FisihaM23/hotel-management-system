<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$authUser = authenticate(['admin', 'manager', 'receptionist']);
$conn = getConnection();
SoftDeleteService::ensureSchema($conn);
$conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS reason_for_stay VARCHAR(100) DEFAULT 'Tourism / Leisure'");
$conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS id_proof VARCHAR(50) DEFAULT 'National ID'");
$conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS id_number VARCHAR(100) DEFAULT ''");
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;
$action = $_GET['action'] ?? '';

$selectFields = "id, name, email, phone, address, id_proof, id_number, reason_for_stay, created_at, deleted_at, deleted_by, restored_at, restored_by";

switch ($method) {
    case 'GET':
        $archived = !empty($_GET['archived']);
        if ($archived && $authUser['role'] !== 'admin') {
            json_fail(403, 'Only administrators can view archived guest records');
        }
        $deletedCond = $archived ? "deleted_at IS NOT NULL" : "deleted_at IS NULL";
        $search = isset($_GET['search']) ? '%' . $_GET['search'] . '%' : null;
        if ($search) {
            $stmt = $conn->prepare("SELECT $selectFields FROM users WHERE role='customer' AND $deletedCond AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR id_number LIKE ? OR reason_for_stay LIKE ?) ORDER BY name");
            $stmt->bind_param('sssss', $search, $search, $search, $search, $search);
            $stmt->execute();
            json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            json_ok($conn->query("SELECT $selectFields FROM users WHERE role='customer' AND $deletedCond ORDER BY created_at DESC")->fetch_all(MYSQLI_ASSOC));
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

        ensureMustChangePasswordColumn($conn);
        $plain = randomGuestPassword();
        $hash = password_hash($plain, PASSWORD_BCRYPT);
        $role = 'customer';
        $mustChange = 1;
        $stmt = $conn->prepare("INSERT INTO users (name, email, password, role, phone, address, id_proof, id_number, reason_for_stay, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('sssssssssi', $name, $email, $hash, $role, $phone, $address, $id_proof, $id_number, $reason, $mustChange);
        executeOrFail($stmt, $conn);
        $newGuestId = $conn->insert_id;

        // Generate 24-hour one-time-use password setup token (stored hashed in password_resets)
        $frontendOrigin = !empty($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : 'http://localhost:5173';
        $loginUrl = rtrim($frontendOrigin, '/') . '/login';
        $setupToken = createPasswordSetupToken($conn, (int) $newGuestId, $email, 1440);
        $setupUrl = rtrim($frontendOrigin, '/') . '/reset-password?token=' . $setupToken;

        // Welcome in-app notification (never store temporary passwords or setup tokens in notifications)
        $guestTitle = "🎉 Welcome to Grand 6-Floor Hotel & Resort Park!";
        $guestMsg = "Dear {$name}, your customer portal account ({$email}) has been provisioned. Please check your email for your secure one-time password setup link before signing in.";
        $gNotif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'success')");
        $gNotif->bind_param('iss', $newGuestId, $guestTitle, $guestMsg);
        $gNotif->execute();

        // Dispatch Welcome Email via Resend directly to the newly registered customer's email
        require_once __DIR__ . '/../config/resend.php';
        $emailRes = ['success' => false];
        try {
            $emailRes = sendCustomerWelcomeEmail($email, $name, [
                'loginUrl' => $loginUrl,
                'setup_url' => $setupUrl,
                'phone' => $phone
            ]);
        } catch (\Throwable $e) {
            error_log("[Guests Registration Welcome Email Error] " . $e->getMessage());
        }

        json_ok([
            'id' => $newGuestId,
            'message' => 'Guest registered successfully',
            'must_change_password' => true,
            'email_sent' => !empty($emailRes['success']),
            'email_id' => $emailRes['id'] ?? null,
            'email_channel' => $emailRes['channel'] ?? 'resend',
            'email_recipient' => $email,
            'notification_created' => true
        ]);
        break;

    case 'PUT':
        if (!$id) {
            json_fail(400, 'Guest ID is required');
        }
        if ($action === 'restore') {
            if ($authUser['role'] !== 'admin') {
                json_fail(403, 'Only administrators can restore archived guest records');
            }
            $res = SoftDeleteService::restoreUser($conn, $id, (int) $authUser['id'], $authUser['role']);
            if (!$res['ok']) {
                json_fail($res['code'], $res['error']);
            }
            json_ok(['message' => $res['message']]);
            break;
        }
        $exStmt = $conn->prepare("SELECT id, role, deleted_at FROM users WHERE id = ? AND role = 'customer' LIMIT 1");
        $exStmt->bind_param('i', $id);
        $exStmt->execute();
        $existingGuest = $exStmt->get_result()->fetch_assoc();
        $exStmt->close();
        if (!$existingGuest) {
            json_fail(404, 'Guest not found');
        }
        if ($existingGuest['deleted_at'] !== null) {
            json_fail(409, 'Archived guest cannot be modified until restored');
        }

        $d = json_decode(file_get_contents('php://input'), true);
        if (!is_array($d) || empty($d)) {
            json_fail(400, 'No update fields provided');
        }
        if (array_key_exists('role', $d) && $d['role'] !== 'customer') {
            json_fail(403, 'Cannot change user role through guest management');
        }
        if (array_key_exists('status', $d)) {
            json_fail(403, 'Cannot change account status through guest management');
        }

        $updates = [];
        $types = '';
        $values = [];

        if (array_key_exists('name', $d)) {
            $name = trim((string) $d['name']);
            if ($name === '') {
                json_fail(400, 'Name cannot be empty');
            }
            $updates[] = 'name = ?';
            $types .= 's';
            $values[] = $name;
        }
        if (array_key_exists('email', $d)) {
            $email = trim((string) $d['email']);
            if ($email === '' || !isValidUserEmail($email)) {
                json_fail(400, emailPolicyMessage());
            }
            $chk = $conn->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
            $chk->bind_param('si', $email, $id);
            $chk->execute();
            if ($chk->get_result()->fetch_assoc()) {
                json_fail(409, 'Another customer is already registered with this email address');
            }
            $updates[] = 'email = ?';
            $types .= 's';
            $values[] = $email;
        }
        foreach (['phone', 'address', 'id_proof', 'id_number', 'reason_for_stay'] as $strField) {
            if (array_key_exists($strField, $d)) {
                $updates[] = "$strField = ?";
                $types .= 's';
                $values[] = trim((string) $d[$strField]);
            }
        }

        if (empty($updates)) {
            json_fail(400, 'No valid guest fields provided to update');
        }

        $types .= 'i';
        $values[] = $id;
        $stmt = $conn->prepare('UPDATE users SET ' . implode(', ', $updates) . " WHERE id = ? AND role = 'customer'");
        $stmt->bind_param($types, ...$values);
        executeOrFail($stmt, $conn);
        json_ok(['message' => 'Guest details updated successfully']);
        break;

    case 'DELETE':
        if (!in_array($authUser['role'], ['admin', 'manager'], true)) {
            json_fail(403, 'Receptionists cannot delete guests or alter financial history');
        }
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
            json_fail(403, 'Only guest / customer records can be archived from the guest directory');
        }
        $res = deleteUserSafely($conn, $id, (int) $authUser['id'], $authUser['role']);
        if (!$res['success']) {
            json_fail($res['code'] ?? 400, $res['error']);
        }
        json_ok(['message' => $res['message']]);
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

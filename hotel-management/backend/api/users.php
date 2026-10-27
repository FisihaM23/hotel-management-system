<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$authUser = authenticate();
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;
$action = $_GET['action'] ?? '';

// Ensure password_resets table exists
$conn->query("CREATE TABLE IF NOT EXISTS password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used TINYINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)");

switch ($method) {
    case 'GET':
        authenticate(['admin', 'manager', 'housekeeping', 'maintenance', 'receptionist']);
        $role = $_GET['role'] ?? null;
        if ($role) {
            $stmt = $conn->prepare("SELECT id,name,email,role,phone,status,created_at FROM users WHERE role=? ORDER BY name");
            $stmt->bind_param('s', $role);
            $stmt->execute();
            json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            $result = $conn->query("SELECT id,name,email,role,phone,status,created_at FROM users ORDER BY created_at DESC");
            json_ok($result->fetch_all(MYSQLI_ASSOC));
        }
        break;

    case 'POST':
        // Only Administrator can create users or reset credentials
        if ($authUser['role'] !== 'admin') {
            json_fail(403, 'Only the Administrator can create or manage user credentials');
        }

        $data = json_decode(file_get_contents('php://input'), true) ?: [];

        // ── ACTION 1: Admin Direct Reset / Set Temporary Password ──────────────
        if ($action === 'admin_reset_password') {
            if (!$id) {
                json_fail(400, 'User ID is required');
            }
            $stmt = $conn->prepare("SELECT id, name, email, role FROM users WHERE id = ?");
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $targetUser = $stmt->get_result()->fetch_assoc();
            if (!$targetUser) {
                json_fail(404, 'User not found');
            }

            $plainPassword = trim($data['password'] ?? '');
            if (empty($plainPassword)) {
                $plainPassword = randomGuestPassword();
            }

            if (!passwordMeetsPolicy($plainPassword)) {
                json_fail(400, passwordPolicyMessage());
            }

            $hash = password_hash($plainPassword, PASSWORD_BCRYPT);
            $upd = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
            $upd->bind_param('si', $hash, $id);
            executeOrFail($upd, $conn);

            // Invalidate any open reset tokens for this user
            $inv = $conn->prepare("UPDATE password_resets SET used = 1 WHERE email = ?");
            $inv->bind_param('s', $targetUser['email']);
            $inv->execute();

            // Send notification to the user
            $notifMsg = "Your account password was reset by System Administrator Mulugeta Fisiha.";
            $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Password Reset by Admin', ?, 'warning')");
            $notif->bind_param('is', $targetUser['id'], $notifMsg);
            $notif->execute();

            json_ok([
                'status' => 'success',
                'message' => 'Password successfully reset for ' . $targetUser['name'],
                'temporary_password' => $plainPassword,
                'user' => $targetUser
            ]);
            break;
        }

        // ── ACTION 2: Admin Generate 1-Hour Secure Reset Link ───────────────────
        if ($action === 'generate_reset_link') {
            if (!$id) {
                json_fail(400, 'User ID is required');
            }
            $stmt = $conn->prepare("SELECT id, name, email, role FROM users WHERE id = ?");
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $targetUser = $stmt->get_result()->fetch_assoc();
            if (!$targetUser) {
                json_fail(404, 'User not found');
            }

            // Invalidate old tokens
            $del = $conn->prepare("DELETE FROM password_resets WHERE email = ?");
            $del->bind_param('s', $targetUser['email']);
            $del->execute();

            // 64-char cryptographically secure token
            $token = bin2hex(random_bytes(32));

            // Insert new token valid for 1 hour
            $ins = $conn->prepare("INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))");
            $ins->bind_param('ss', $targetUser['email'], $token);
            executeOrFail($ins, $conn);

            $frontendOrigin = !empty($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : 'http://localhost:5173';
            $resetLink = rtrim($frontendOrigin, '/') . '/reset-password?token=' . $token;

            // In-app notification
            $notifMsg = "A secure password reset link was generated by the Administrator: " . $resetLink;
            $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Password Reset Link', ?, 'info')");
            $notif->bind_param('is', $targetUser['id'], $notifMsg);
            $notif->execute();

            json_ok([
                'status' => 'success',
                'message' => 'Secure reset link generated',
                'token' => $token,
                'reset_link' => $resetLink,
                'expires_in' => '1 hour',
                'user' => $targetUser
            ]);
            break;
        }

        // ── STANDARD ACTION: Create New User ──────────────────────────────────
        $name = trim($data['name'] ?? '');
        $email = trim($data['email'] ?? '');
        $role = $data['role'] ?? 'customer';
        $phone = trim($data['phone'] ?? '');
        $status = $data['status'] ?? 'active';

        if (empty($name) || empty($email)) {
            json_fail(400, 'Name and email are required');
        }
        if (!isValidUserEmail($email)) {
            json_fail(400, emailPolicyMessage());
        }

        // Check for duplicate email
        $chk = $conn->prepare("SELECT id FROM users WHERE email = ?");
        $chk->bind_param('s', $email);
        $chk->execute();
        if ($chk->get_result()->fetch_assoc()) {
            json_fail(400, 'An account with this email already exists');
        }

        // If password is not provided, generate a strong random password
        $plainPassword = trim($data['password'] ?? '');
        if (empty($plainPassword)) {
            $plainPassword = randomGuestPassword();
        }

        if (!passwordMeetsPolicy($plainPassword)) {
            json_fail(400, passwordPolicyMessage());
        }

        $hash = password_hash($plainPassword, PASSWORD_BCRYPT);

        $stmt = $conn->prepare("INSERT INTO users (name, email, password, role, phone, status) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('ssssss', $name, $email, $hash, $role, $phone, $status);
        executeOrFail($stmt, $conn);
        $newId = $conn->insert_id;

        // Welcome notification
        $welcomeMsg = "Welcome to the Hotel Management System. Your account was created by System Administrator Mulugeta Fisiha.";
        $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Account Provisioned', ?, 'info')");
        $notif->bind_param('is', $newId, $welcomeMsg);
        $notif->execute();

        json_ok([
            'id' => $newId,
            'message' => 'User created successfully by Administrator',
            'initial_password' => $plainPassword
        ]);
        break;

    case 'PUT':
        if ($authUser['role'] !== 'admin') {
            json_fail(403, 'Only the Administrator can modify users');
        }
        if (!$id) {
            json_fail(400, 'User ID is required');
        }
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $name = trim($data['name'] ?? '');
        $email = trim($data['email'] ?? '');
        $role = $data['role'] ?? 'customer';
        $phone = trim($data['phone'] ?? '');
        $status = $data['status'] ?? 'active';

        if (empty($name) || empty($email)) {
            json_fail(400, 'Name and email are required');
        }
        if (!isValidUserEmail($email)) {
            json_fail(400, emailPolicyMessage());
        }

        // Ensure email isn't taken by someone else
        $chk = $conn->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
        $chk->bind_param('si', $email, $id);
        $chk->execute();
        if ($chk->get_result()->fetch_assoc()) {
            json_fail(400, 'Another user is already using this email');
        }

        if (!empty($data['password'])) {
            if (!passwordMeetsPolicy($data['password'])) {
                json_fail(400, passwordPolicyMessage());
            }
            $hash = password_hash($data['password'], PASSWORD_BCRYPT);
            $stmt = $conn->prepare("UPDATE users SET name=?, email=?, password=?, role=?, phone=?, status=? WHERE id=?");
            $stmt->bind_param('ssssssi', $name, $email, $hash, $role, $phone, $status, $id);
        } else {
            $stmt = $conn->prepare("UPDATE users SET name=?, email=?, role=?, phone=?, status=? WHERE id=?");
            $stmt->bind_param('sssssi', $name, $email, $role, $phone, $status, $id);
        }
        executeOrFail($stmt, $conn);
        json_ok(['message' => 'User updated successfully']);
        break;

    case 'DELETE':
        if ($authUser['role'] !== 'admin') {
            json_fail(403, 'Only the Administrator can delete users');
        }
        if (!$id) {
            json_fail(400, 'User ID is required');
        }
        // Protect current admin
        if ($id === (int) $authUser['id']) {
            json_fail(400, 'You cannot delete your own Administrator account');
        }
        $res = deleteUserSafely($conn, $id);
        if (!$res['success']) {
            json_fail(400, $res['error']);
        }
        json_ok(['message' => 'User and associated records deleted successfully']);
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

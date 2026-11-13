<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$authUser = authenticate();
$conn = getConnection();
SoftDeleteService::ensureSchema($conn);
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
        requireRole($authUser, ROLE_GROUP_MANAGEMENT, 'Access denied: only administrators and managers can view user directory records');
        $archived = !empty($_GET['archived']);
        if ($archived && $authUser['role'] !== 'admin') {
            json_fail(403, 'Only administrators can view archived users');
        }
        $deletedCond = $archived ? "deleted_at IS NOT NULL" : "deleted_at IS NULL";
        $role = $_GET['role'] ?? null;
        if ($role) {
            $stmt = $conn->prepare("SELECT id,name,email,role,phone,status,created_at,deleted_at,deleted_by,restored_at,restored_by FROM users WHERE $deletedCond AND role=? ORDER BY name");
            $stmt->bind_param('s', $role);
            $stmt->execute();
            json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            $result = $conn->query("SELECT id,name,email,role,phone,status,created_at,deleted_at,deleted_by,restored_at,restored_by FROM users WHERE $deletedCond ORDER BY created_at DESC");
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

            ensureMustChangePasswordColumn($conn);
            $hash = password_hash($plainPassword, PASSWORD_BCRYPT);
            $upd = $conn->prepare("UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?");
            $upd->bind_param('si', $hash, $id);
            executeOrFail($upd, $conn);

            // Generate 1-hour one-time setup token (stored hashed) & email it
            $frontendOrigin = !empty($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : 'http://localhost:5173';
            $setupToken = createPasswordSetupToken($conn, (int) $targetUser['id'], $targetUser['email'], 60);
            $resetLink = rtrim($frontendOrigin, '/') . '/reset-password?token=' . $setupToken;

            require_once __DIR__ . '/../config/resend.php';
            $emailRes = ['success' => false];
            try {
                $emailRes = sendPasswordResetLinkEmail($targetUser['email'], $targetUser['name'], $resetLink);
            } catch (\Throwable $e) {
                error_log("[Users Admin Reset Email Error] " . $e->getMessage());
            }

            // Credential-free notification
            $notifMsg = "Your account password was reset by the Administrator. Please check your email for your secure password setup link.";
            $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Password Reset by Admin', ?, 'warning')");
            $notif->bind_param('is', $targetUser['id'], $notifMsg);
            $notif->execute();

            json_ok([
                'status' => 'success',
                'message' => 'Password successfully reset for ' . $targetUser['name'],
                'must_change_password' => true,
                'email_sent' => !empty($emailRes['success']),
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

            // Generate cryptographically secure 1-hour one-time token (stored ONLY as SHA-256 hash)
            $token = createPasswordSetupToken($conn, (int) $targetUser['id'], $targetUser['email'], 60);
            $frontendOrigin = !empty($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : 'http://localhost:5173';
            $resetLink = rtrim($frontendOrigin, '/') . '/reset-password?token=' . $token;

            // Deliver via email; never store reset links or tokens in notifications
            require_once __DIR__ . '/../config/resend.php';
            $emailRes = ['success' => false];
            try {
                $emailRes = sendPasswordResetLinkEmail($targetUser['email'], $targetUser['name'], $resetLink);
            } catch (\Throwable $e) {
                error_log("[Users Generate Reset Link Email Error] " . $e->getMessage());
            }

            // Credential-free in-app notification
            $notifMsg = "A secure password reset link was generated by the Administrator and dispatched to your registered email.";
            $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Password Reset Link', ?, 'info')");
            $notif->bind_param('is', $targetUser['id'], $notifMsg);
            $notif->execute();

            json_ok([
                'status' => 'success',
                'message' => 'Secure reset link generated and dispatched via email',
                'expires_in' => '1 hour',
                'email_sent' => !empty($emailRes['success']),
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

        ensureMustChangePasswordColumn($conn);
        $hash = password_hash($plainPassword, PASSWORD_BCRYPT);
        $mustChange = 1;

        $stmt = $conn->prepare("INSERT INTO users (name, email, password, role, phone, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('ssssssi', $name, $email, $hash, $role, $phone, $status, $mustChange);
        executeOrFail($stmt, $conn);
        $newId = $conn->insert_id;

        // Generate 24-hour one-time setup token (stored ONLY as SHA-256 hash)
        $frontendOrigin = !empty($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : 'http://localhost:5173';
        $loginUrl = rtrim($frontendOrigin, '/') . '/login';
        $setupToken = createPasswordSetupToken($conn, (int) $newId, $email, 1440);
        $setupUrl = rtrim($frontendOrigin, '/') . '/reset-password?token=' . $setupToken;

        // Credential-free welcome notification
        $welcomeMsg = "Welcome to the Hotel Management System. Your account was created by the Administrator. Please check your email to set your personal password.";
        $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Account Provisioned', ?, 'info')");
        $notif->bind_param('is', $newId, $welcomeMsg);
        $notif->execute();

        // Dispatch Welcome / Invitation Email via Resend with one-time setup link (never plaintext password)
        require_once __DIR__ . '/../config/resend.php';
        $emailRes = ['success' => false];
        try {
            $emailRes = sendCustomerWelcomeEmail($email, $name, [
                'loginUrl' => $loginUrl,
                'setup_url' => $setupUrl,
                'phone' => $phone
            ]);
        } catch (\Throwable $e) {
            error_log("[Users Admin Welcome Email Error] " . $e->getMessage());
        }

        json_ok([
            'id' => $newId,
            'message' => 'User created successfully by Administrator',
            'must_change_password' => true,
            'email_sent' => !empty($emailRes['success']),
            'email_id' => $emailRes['id'] ?? null
        ]);
        break;

    case 'PUT':
        if ($authUser['role'] !== 'admin') {
            json_fail(403, 'Only the Administrator can modify users');
        }
        if (!$id) {
            json_fail(400, 'User ID is required');
        }
        if ($action === 'restore') {
            $res = SoftDeleteService::restoreUser($conn, $id, (int) $authUser['id'], $authUser['role']);
            if (!$res['ok']) {
                json_fail($res['code'], $res['error']);
            }
            json_ok(['message' => $res['message']]);
            break;
        }
        $exStmt = $conn->prepare("SELECT id, name, email, role, phone, status, deleted_at FROM users WHERE id = ? LIMIT 1");
        $exStmt->bind_param('i', $id);
        $exStmt->execute();
        $existingUser = $exStmt->get_result()->fetch_assoc();
        $exStmt->close();
        if (!$existingUser) {
            json_fail(404, 'User not found');
        }
        if ($existingUser['deleted_at'] !== null) {
            json_fail(409, 'Archived user cannot be modified until restored');
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data) || empty($data)) {
            json_fail(400, 'No update fields provided');
        }

        $allowedRoles = ['admin', 'manager', 'receptionist', 'housekeeping', 'maintenance', 'customer'];
        $allowedStatuses = ['active', 'inactive', 'suspended'];

        // Identify primary administrator (lowest-ID active admin)
        $primRes = $conn->query("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL ORDER BY id ASC LIMIT 1");
        $primRow = $primRes ? $primRes->fetch_assoc() : null;
        $primaryAdminId = $primRow ? (int) $primRow['id'] : 0;
        $isProtectedAdmin = ($existingUser['role'] === 'admin') && ((int) $id === (int) $authUser['id'] || (int) $id === $primaryAdminId);

        $updates = [];
        $types = '';
        $values = [];

        if (array_key_exists('name', $data)) {
            $name = trim((string) $data['name']);
            if ($name === '') {
                json_fail(400, 'Name cannot be empty');
            }
            $updates[] = 'name = ?';
            $types .= 's';
            $values[] = $name;
        }
        if (array_key_exists('email', $data)) {
            $email = trim((string) $data['email']);
            if ($email === '' || !isValidUserEmail($email)) {
                json_fail(400, emailPolicyMessage());
            }
            $chk = $conn->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
            $chk->bind_param('si', $email, $id);
            $chk->execute();
            if ($chk->get_result()->fetch_assoc()) {
                json_fail(400, 'Another user is already using this email');
            }
            $updates[] = 'email = ?';
            $types .= 's';
            $values[] = $email;
        }
        if (array_key_exists('role', $data)) {
            $role = trim((string) $data['role']);
            if (!in_array($role, $allowedRoles, true)) {
                json_fail(400, 'Invalid user role');
            }
            if ($isProtectedAdmin && $role !== 'admin') {
                json_fail(403, 'Cannot demote the primary or current administrator account');
            }
            $updates[] = 'role = ?';
            $types .= 's';
            $values[] = $role;
        }
        if (array_key_exists('phone', $data)) {
            $updates[] = 'phone = ?';
            $types .= 's';
            $values[] = trim((string) $data['phone']);
        }
        if (array_key_exists('status', $data)) {
            $status = trim((string) $data['status']);
            if (!in_array($status, $allowedStatuses, true)) {
                json_fail(400, 'Invalid account status');
            }
            if ($isProtectedAdmin && $status !== 'active') {
                json_fail(403, 'Cannot deactivate or suspend the primary or current administrator account');
            }
            $updates[] = 'status = ?';
            $types .= 's';
            $values[] = $status;
        }
        if (array_key_exists('password', $data) && $data['password'] !== '') {
            if (!passwordMeetsPolicy((string) $data['password'])) {
                json_fail(400, passwordPolicyMessage());
            }
            $updates[] = 'password = ?';
            $types .= 's';
            $values[] = password_hash((string) $data['password'], PASSWORD_BCRYPT);
        }

        if (empty($updates)) {
            json_fail(400, 'No valid user fields provided to update');
        }

        $types .= 'i';
        $values[] = $id;
        $stmt = $conn->prepare('UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = ?');
        $stmt->bind_param($types, ...$values);
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

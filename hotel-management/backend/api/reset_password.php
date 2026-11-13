<?php
// Endpoint: POST /reset_password.php (reset password) OR GET /reset_password.php?action=verify&token=... (verify token)
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/../config/otp_helper.php';

$method = $_SERVER['REQUEST_METHOD'];
$conn = getConnection();

// ── GET: VERIFY RESET AUTHORIZATION TOKEN ───────────────────────────────────
if ($method === 'GET') {
    $token = trim((string)($_GET['token'] ?? ''));
    if (empty($token)) {
        json_fail(400, 'Reset authorization token is required');
    }

    $tokenHash = hash('sha256', $token);
    $stmt = $conn->prepare("SELECT id, email FROM password_resets 
        WHERE reset_token_hash = ? 
          AND purpose = 'forgot_password' 
          AND is_verified = 1 
          AND used = 0 
          AND token_expires_at > NOW() 
        LIMIT 1");
    $stmt->bind_param("s", $tokenHash);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();

    if (!$row) {
        json_fail(400, 'Invalid or expired password reset authorization. Please request a new verification code.');
    }

    json_ok([
        'valid' => true,
        'email' => $row['email']
    ]);
    exit;
}

// ── POST: ATOMICALLY CONSUME TOKEN AND RESET PASSWORD ───────────────────────
if ($method !== 'POST') {
    json_fail(405, 'Method not allowed');
}

$data = json_decode(file_get_contents('php://input'), true) ?: [];

$email = strtolower(trim((string)($data['email'] ?? '')));
$resetToken = trim((string)($data['reset_token'] ?? $data['token'] ?? ''));
$password = (string)($data['password'] ?? '');
$confirmPassword = (string)($data['confirm_password'] ?? $data['password'] ?? '');

// 1. Validate inputs
if (empty($resetToken) || empty($password)) {
    json_fail(400, 'Reset authorization token and new password are required');
}

if ($password !== $confirmPassword) {
    json_fail(400, 'Passwords do not match');
}

// 2. Validate password strength
if (!passwordMeetsPolicy($password)) {
    json_fail(400, passwordPolicyMessage());
}

// 3. Compute SHA-256 hash of the submitted reset authorization token exclusively
$tokenHash = hash('sha256', $resetToken);

// 4. Begin atomic database transaction with row-level locking to prevent concurrent token reuse
$conn->begin_transaction();
try {
    if (!empty($email)) {
        $stmt = $conn->prepare("SELECT pr.id, pr.user_id, pr.email, u.name as user_name 
            FROM password_resets pr 
            JOIN users u ON pr.user_id = u.id 
            WHERE pr.email = ? 
              AND pr.purpose = 'forgot_password'
              AND pr.reset_token_hash = ? 
              AND pr.is_verified = 1 
              AND pr.used = 0 
              AND pr.token_expires_at > NOW()
            ORDER BY pr.id DESC LIMIT 1 FOR UPDATE");
        $stmt->bind_param("ss", $email, $tokenHash);
    } else {
        $stmt = $conn->prepare("SELECT pr.id, pr.user_id, pr.email, u.name as user_name 
            FROM password_resets pr 
            JOIN users u ON pr.user_id = u.id 
            WHERE pr.purpose = 'forgot_password'
              AND pr.reset_token_hash = ? 
              AND pr.is_verified = 1 
              AND pr.used = 0 
              AND pr.token_expires_at > NOW()
            ORDER BY pr.id DESC LIMIT 1 FOR UPDATE");
        $stmt->bind_param("s", $tokenHash);
    }

    $stmt->execute();
    $record = $stmt->get_result()->fetch_assoc();

    if (!$record) {
        $conn->rollback();
        json_fail(400, 'Invalid, expired, or already consumed password reset authorization. Please restart the verification process.');
    }

    $resetId = (int)$record['id'];
    $userId = (int)$record['user_id'];
    $resolvedEmail = $record['email'];
    $userName = $record['user_name'] ?? 'Valued Guest';

    // 5. Atomic conditional token consumption: verify row was not concurrently consumed
    $consume = $conn->prepare("UPDATE password_resets SET used = 1 WHERE id = ? AND used = 0");
    if (!$consume) throw new RuntimeException($conn->error);
    $consume->bind_param("i", $resetId);
    if (!$consume->execute()) throw new RuntimeException($consume->error ?: 'Failed to execute token consumption');

    if ($consume->affected_rows !== 1) {
        $conn->rollback();
        json_fail(409, 'This password reset authorization has already been consumed or is currently being processed by another request.');
    }

    // 6. Hash new password using PASSWORD_DEFAULT (BCRYPT)
    $newHash = password_hash($password, PASSWORD_DEFAULT);

    // 7. Update user's password and clear must_change_password without modifying role or status
    ensureMustChangePasswordColumn($conn);
    $updUser = $conn->prepare("UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?");
    if (!$updUser) throw new RuntimeException($conn->error);
    $updUser->bind_param("si", $newHash, $userId);
    if (!$updUser->execute()) throw new RuntimeException($updUser->error ?: 'Failed to update user password');

    // 8. Invalidate ALL other outstanding reset tokens and OTP records for this user
    $invalAll = $conn->prepare("UPDATE password_resets SET used = 1 WHERE user_id = ?");
    if (!$invalAll) throw new RuntimeException($conn->error);
    $invalAll->bind_param("i", $userId);
    if (!$invalAll->execute()) throw new RuntimeException($invalAll->error ?: 'Failed to invalidate reset tokens');

    // 9. Insert security log notification
    $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Password Changed Successfully', 'Your account password was updated via secure email OTP verification.', 'success')");
    if ($notif) {
        $notif->bind_param("i", $userId);
        $notif->execute();
    }

    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback();
    error_log("[ResetPassword Submit] Transaction failed: " . $e->getMessage());
    json_fail(500, 'An internal error occurred while updating your password. Please try again.');
}

// 10. Send confirmation email to the user
sendPasswordResetConfirmationEmail($resolvedEmail, $userName);

json_ok([
    'status' => 'success',
    'message' => 'Password reset successfully. You can now log in with your new password.'
]);
exit;

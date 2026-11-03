<?php
// Endpoint: POST /reset_password.php (or /auth.php?action=reset_password)
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/../config/otp_helper.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_fail(405, 'Method not allowed');
}

$conn = getConnection();
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

// 3. Compute hash of the submitted reset authorization token
$tokenHash = hashResetToken($resetToken);

// 4. Find matching verified reset authorization that has not expired or been used
if (!empty($email)) {
    $stmt = $conn->prepare("SELECT pr.id, pr.user_id, pr.email, u.name as user_name 
        FROM password_resets pr 
        JOIN users u ON pr.user_id = u.id 
        WHERE pr.email = ? 
          AND (pr.reset_token_hash = ? OR pr.token = ?) 
          AND pr.is_verified = 1 
          AND pr.used = 0 
          AND (pr.token_expires_at > NOW() OR (pr.token_expires_at IS NULL AND pr.expires_at > NOW()))
        ORDER BY pr.id DESC LIMIT 1");
    $stmt->bind_param("sss", $email, $tokenHash, $resetToken);
} else {
    $stmt = $conn->prepare("SELECT pr.id, pr.user_id, pr.email, u.name as user_name 
        FROM password_resets pr 
        JOIN users u ON pr.user_id = u.id 
        WHERE (pr.reset_token_hash = ? OR pr.token = ?) 
          AND pr.is_verified = 1 
          AND pr.used = 0 
          AND (pr.token_expires_at > NOW() OR (pr.token_expires_at IS NULL AND pr.expires_at > NOW()))
        ORDER BY pr.id DESC LIMIT 1");
    $stmt->bind_param("ss", $tokenHash, $resetToken);
}

$stmt->execute();
$record = $stmt->get_result()->fetch_assoc();

if (!$record) {
    json_fail(400, 'Invalid or expired password reset authorization. Please restart the verification process.');
}

$userId = (int)$record['user_id'];
$resolvedEmail = $record['email'];
$userName = $record['user_name'] ?? 'Valued Guest';

// 5. Database Transaction to update password & invalidate tokens securely
$conn->begin_transaction();
try {
    // Hash new password using PASSWORD_DEFAULT (BCRYPT)
    $newHash = password_hash($password, PASSWORD_DEFAULT);

    // Update user's password without modifying role, status, or any other user data
    $updUser = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
    $updUser->bind_param("si", $newHash, $userId);
    $updUser->execute();

    // Invalidate ALL reset tokens and OTP records for this user to prevent any replay
    $invalAll = $conn->prepare("UPDATE password_resets SET used = 1 WHERE user_id = ?");
    $invalAll->bind_param("i", $userId);
    $invalAll->execute();

    // Insert security log notification
    $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Password Changed Successfully', 'Your account password was updated via secure email OTP verification.', 'success')");
    $notif->bind_param("i", $userId);
    $notif->execute();

    $conn->commit();
} catch (Exception $e) {
    $conn->rollback();
    json_fail(500, 'An internal error occurred while updating your password. Please try again.');
}

// 6. Send confirmation email to the user
sendPasswordResetConfirmationEmail($resolvedEmail, $userName);

json_ok([
    'status' => 'success',
    'message' => 'Password reset successfully. You can now log in with your new password.'
]);

<?php
// Endpoint: POST /api/change_password.php?action=request_otp | verify_otp | change_password
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/../config/auth_middleware.php';
require_once __DIR__ . '/../config/otp_helper.php';

// Strict Authentication: User MUST be logged in with a valid Bearer token
$authUser = authenticate();
$userId = (int)$authUser['id'];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_fail(405, 'Method not allowed');
}

$conn = getConnection();
ensureMustChangePasswordColumn($conn);

// Retrieve fresh user record directly from database; never trust client-supplied identity
$stmt = $conn->prepare("SELECT id, name, email, password, role, status, must_change_password FROM users WHERE id = ? AND status = 'active' LIMIT 1");
$stmt->bind_param("i", $userId);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();

if (!$user) {
    json_fail(401, 'User account is inactive or not found');
}

$userEmail = strtolower(trim($user['email']));
$userName = $user['name'] ?: 'Valued User';
$clientIp = getClientIp();

$data = json_decode(file_get_contents('php://input'), true) ?: [];
$action = trim($_GET['action'] ?? $data['action'] ?? '');

// ── ACTION 0: FIRST-LOGIN FORCED PASSWORD CHANGE (when must_change_password = 1) ──
if ($action === 'force_change_password') {
    if (empty($user['must_change_password'])) {
        json_fail(400, 'Account does not require a forced temporary password change. Please use OTP-verified change_password.');
    }
    $currentPassword = (string)($data['current_password'] ?? '');
    $newPassword = (string)($data['new_password'] ?? '');
    $confirmPassword = (string)($data['confirm_password'] ?? '');

    if (empty($currentPassword) || empty($newPassword) || empty($confirmPassword)) {
        json_fail(400, 'Current password, new password, and confirmation are required.');
    }
    if ($newPassword !== $confirmPassword) {
        json_fail(400, 'New password and confirmation do not match.');
    }
    if (!passwordMeetsPolicy($newPassword)) {
        json_fail(400, passwordPolicyMessage());
    }
    if (!password_verify($currentPassword, $user['password'])) {
        json_fail(400, 'Current temporary password is incorrect.');
    }
    if (password_verify($newPassword, $user['password'])) {
        json_fail(400, 'New password cannot be the same as your temporary password.');
    }

    $conn->begin_transaction();
    try {
        $newHash = password_hash($newPassword, PASSWORD_BCRYPT);
        $updUser = $conn->prepare("UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?");
        $updUser->bind_param("si", $newHash, $userId);
        if (!$updUser->execute()) throw new RuntimeException($updUser->error ?: 'Failed to update password');

        $invalAll = $conn->prepare("UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0");
        if ($invalAll) {
            $invalAll->bind_param("i", $userId);
            $invalAll->execute();
        }

        $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Password Updated', 'Your temporary password was updated on first login.', 'success')");
        if ($notif) {
            $notif->bind_param("i", $userId);
            $notif->execute();
        }
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        error_log("[ForceChangePassword] Failed: " . $e->getMessage());
        json_fail(500, 'Failed to update password safely.');
    }

    json_ok(['status' => 'success', 'message' => 'Password updated successfully.', 'must_change_password' => false]);
    exit;
}

// ── ACTION 1: REQUEST OTP ───────────────────────────────────────────────────
if ($action === 'request_otp') {
    // Rate limit check by IP (max 12 requests per 15 minutes)
    if (isIpRateLimited($conn, $clientIp)) {
        json_fail(429, 'Too many requests from your network. Please wait 15 minutes.');
    }

    // Enforce 60-second cooldown for this user specifically for change_password
    $cdStmt = $conn->prepare("SELECT last_resend_at, (UNIX_TIMESTAMP(NOW()) - UNIX_TIMESTAMP(last_resend_at)) AS elapsed 
        FROM password_resets 
        WHERE user_id = ? AND purpose = 'change_password' 
        ORDER BY id DESC LIMIT 1");
    $cdStmt->bind_param("i", $userId);
    $cdStmt->execute();
    $cdRow = $cdStmt->get_result()->fetch_assoc();

    if ($cdRow && $cdRow['elapsed'] !== null && (int)$cdRow['elapsed'] < 60) {
        $wait = 60 - (int)$cdRow['elapsed'];
        json_fail(429, "A verification code was recently generated. Please wait {$wait} seconds before requesting a new code.");
    }

    // Generate secure 6-digit OTP using random_int()
    $otp = generateSecureOtp();
    $otpHash = password_hash($otp, PASSWORD_DEFAULT);

    // Send email using existing email dispatch engine FIRST to ensure safe delivery
    $emailDispatched = sendOtpEmail($userEmail, $userName, $otp, 'change_password');

    if (!$emailDispatched) {
        json_fail(503, 'Unable to dispatch verification code to your registered email address at this time. Please check your notification configuration or try again shortly.');
    }

    $conn->begin_transaction();
    try {
        // Invalidate previous unverified change_password records for this user
        $inval = $conn->prepare("UPDATE password_resets SET used = 1 WHERE user_id = ? AND purpose = 'change_password' AND used = 0");
        if (!$inval) throw new RuntimeException($conn->error);
        $inval->bind_param("i", $userId);
        if (!$inval->execute()) throw new RuntimeException($inval->error ?: 'Failed to invalidate old change_password OTP');

        // Store in database with 10-minute expiry and purpose='change_password'
        $ins = $conn->prepare("INSERT INTO password_resets 
            (user_id, email, purpose, otp_hash, expires_at, failed_attempts, is_verified, used, ip_address, last_resend_at) 
            VALUES (?, ?, 'change_password', ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0, 0, 0, ?, NOW())");
        if (!$ins) throw new RuntimeException($conn->error);
        $ins->bind_param("isss", $userId, $userEmail, $otpHash, $clientIp);
        if (!$ins->execute()) throw new RuntimeException($ins->error ?: 'Failed to insert new change_password OTP');

        // Insert security notification
        $notifMsg = "A 6-digit verification code was generated for your account password change.";
        $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Password Change Code Requested', ?, 'info')");
        if ($notif) {
            $notif->bind_param("is", $userId, $notifMsg);
            $notif->execute();
        }

        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        error_log("[ChangePassword OTP Request] Transaction failed: " . $e->getMessage());
        json_fail(500, 'Database error while recording verification code.');
    }

    json_ok([
        'status' => 'success',
        'message' => 'A 6-digit verification code has been dispatched to your registered email address.',
        'email' => $userEmail,
        'email_sent' => true,
        'cooldown_seconds' => 60,
        'expires_in' => '10 minutes'
    ]);
    exit;
}

// ── ACTION 2: VERIFY OTP ────────────────────────────────────────────────────
if ($action === 'verify_otp') {
    $otp = trim((string)($data['otp'] ?? ''));

    // Validate 6 digits
    if (!preg_match('/^\d{6}$/', $otp)) {
        json_fail(400, 'Verification code must be exactly 6 digits');
    }

    // Find latest active, unverified, unused change_password record for this user
    $stmt = $conn->prepare("SELECT * FROM password_resets 
        WHERE user_id = ? AND purpose = 'change_password' AND is_verified = 0 AND used = 0 
        ORDER BY id DESC LIMIT 1");
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $record = $stmt->get_result()->fetch_assoc();

    if (!$record) {
        json_fail(400, 'No active verification code found. Please request a new code.');
    }

    $resetId = (int)$record['id'];
    $failedAttempts = (int)$record['failed_attempts'];

    // 1. Enforce maximum 5 failed attempts
    if ($failedAttempts >= 5) {
        $inval = $conn->prepare("UPDATE password_resets SET used = 1 WHERE id = ?");
        $inval->bind_param("i", $resetId);
        $inval->execute();
        json_fail(429, 'Maximum verification attempts exceeded. For your security, this code has been deactivated. Please request a new code.');
    }

    // 2. Check 10-minute expiration
    if (strtotime($record['expires_at']) < time()) {
        $inval = $conn->prepare("UPDATE password_resets SET used = 1 WHERE id = ?");
        $inval->bind_param("i", $resetId);
        $inval->execute();
        json_fail(400, 'This verification code has expired (10-minute limit). Please request a new code.');
    }

    // 3. Verify OTP hash
    if (!password_verify($otp, $record['otp_hash'])) {
        $newAttempts = $failedAttempts + 1;
        $upd = $conn->prepare("UPDATE password_resets SET failed_attempts = ? WHERE id = ?");
        $upd->bind_param("ii", $newAttempts, $resetId);
        $upd->execute();

        $remaining = 5 - $newAttempts;
        if ($remaining <= 0) {
            $inval = $conn->prepare("UPDATE password_resets SET used = 1 WHERE id = ?");
            $inval->bind_param("i", $resetId);
            $inval->execute();
            json_fail(429, 'Incorrect verification code. Maximum attempts reached. Please request a new code.');
        }

        json_fail(400, "Incorrect verification code. You have {$remaining} attempt(s) remaining.");
    }

    // 4. Generate cryptographically secure single-use Change Password authorization token
    $changeToken = generateResetToken();
    $tokenHash = hashResetToken($changeToken);

    // Token valid for 15 minutes
    $upd = $conn->prepare("UPDATE password_resets 
        SET is_verified = 1, reset_token_hash = ?, token_expires_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE), failed_attempts = 0 
        WHERE id = ?");
    $upd->bind_param("si", $tokenHash, $resetId);
    $upd->execute();

    json_ok([
        'status' => 'success',
        'message' => 'Verification code confirmed successfully.',
        'change_token' => $changeToken,
        'expires_in' => '15 minutes'
    ]);
    exit;
}

// ── ACTION 3: CHANGE PASSWORD ───────────────────────────────────────────────
if ($action === 'change_password') {
    $currentPassword = (string)($data['current_password'] ?? '');
    $newPassword = (string)($data['new_password'] ?? '');
    $confirmPassword = (string)($data['confirm_password'] ?? '');
    $changeToken = trim((string)($data['change_token'] ?? ''));

    // Validate inputs
    if (empty($changeToken)) {
        json_fail(400, 'Missing verification authorization token. Please verify OTP first.');
    }

    if (empty($currentPassword)) {
        json_fail(400, 'Current password is required.');
    }

    if (empty($newPassword) || empty($confirmPassword)) {
        json_fail(400, 'New password and confirm password are required.');
    }

    if ($newPassword !== $confirmPassword) {
        json_fail(400, 'New password and confirmation do not match.');
    }

    // Validate new password security policy
    if (!passwordMeetsPolicy($newPassword)) {
        json_fail(400, passwordPolicyMessage());
    }

    // Verify authorization token from database
    $tokenHash = hashResetToken($changeToken);
    $authStmt = $conn->prepare("SELECT id FROM password_resets 
        WHERE user_id = ? AND purpose = 'change_password' AND reset_token_hash = ? 
          AND is_verified = 1 AND used = 0 AND token_expires_at > NOW() 
        ORDER BY id DESC LIMIT 1");
    $authStmt->bind_param("is", $userId, $tokenHash);
    $authStmt->execute();
    $authRecord = $authStmt->get_result()->fetch_assoc();

    if (!$authRecord) {
        json_fail(400, 'Invalid or expired password change authorization. Please verify OTP again.');
    }

    // Verify current password with password_verify()
    if (!password_verify($currentPassword, $user['password'])) {
        json_fail(400, 'Current password is incorrect.');
    }

    // Prevent reusing current password as new password
    if (password_verify($newPassword, $user['password'])) {
        json_fail(400, 'New password cannot be the same as your current password.');
    }

    // Database Transaction: Update password, invalidate all tokens, and log notification
    $conn->begin_transaction();
    try {
        ensureMustChangePasswordColumn($conn);
        $newHash = password_hash($newPassword, PASSWORD_BCRYPT);

        // Update password and clear first-login temporary password requirement
        $updUser = $conn->prepare("UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?");
        if (!$updUser) throw new RuntimeException($conn->error);
        $updUser->bind_param("si", $newHash, $userId);
        if (!$updUser->execute()) throw new RuntimeException($updUser->error ?: 'Failed to update user password');

        // Invalidate ALL reset & change password records for this user (single-use enforcement)
        $invalAll = $conn->prepare("UPDATE password_resets SET used = 1 WHERE user_id = ?");
        if (!$invalAll) throw new RuntimeException($conn->error);
        $invalAll->bind_param("i", $userId);
        if (!$invalAll->execute()) throw new RuntimeException($invalAll->error ?: 'Failed to invalidate reset tokens');

        // Audit notification
        $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) 
            VALUES (?, 'Password Changed Successfully', 'Your account password was successfully updated via verified email OTP.', 'success')");
        if ($notif) {
            $notif->bind_param("i", $userId);
            $notif->execute();
        }

        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        error_log("[ChangePassword Submit] Transaction failed: " . $e->getMessage());
        json_fail(500, 'An internal error occurred while changing your password. Please try again.');
    }

    // Send confirmation email
    sendPasswordResetConfirmationEmail($userEmail, $userName);

    json_ok([
        'status' => 'success',
        'message' => 'Your password has been changed successfully.'
    ]);
    exit;
}

json_fail(400, 'Invalid action specified. Supported actions: request_otp, verify_otp, change_password.');


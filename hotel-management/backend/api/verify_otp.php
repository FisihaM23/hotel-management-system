<?php
// Endpoint: POST /verify_otp.php (or /auth.php?action=verify_otp)
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/../config/otp_helper.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_fail(405, 'Method not allowed');
}

$conn = getConnection();
$data = json_decode(file_get_contents('php://input'), true) ?: [];
$email = strtolower(trim($data['email'] ?? ''));
$otp = trim((string)($data['otp'] ?? ''));

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_fail(400, 'Valid email address is required');
}

// Exactly 6 digits
if (!preg_match('/^\d{6}$/', $otp)) {
    json_fail(400, 'Verification code must be exactly 6 digits');
}

// Find latest active, unverified, unused reset record for this email
$stmt = $conn->prepare("SELECT * FROM password_resets WHERE email = ? AND is_verified = 0 AND used = 0 ORDER BY id DESC LIMIT 1");
$stmt->bind_param("s", $email);
$stmt->execute();
$record = $stmt->get_result()->fetch_assoc();

if (!$record) {
    json_fail(400, 'No active verification code found for this email. Please request a new code.');
}

$resetId = (int)$record['id'];
$failedAttempts = (int)$record['failed_attempts'];

// 1. Check max failed attempts (Max 5 attempts allowed)
if ($failedAttempts >= 5) {
    $inval = $conn->prepare("UPDATE password_resets SET used = 1 WHERE id = ?");
    $inval->bind_param("i", $resetId);
    $inval->execute();
    json_fail(429, 'Maximum verification attempts exceeded. For your security, this code has been deactivated. Please request a new code.');
}

// 2. Check 5-minute expiration
if (strtotime($record['expires_at']) < time()) {
    $inval = $conn->prepare("UPDATE password_resets SET used = 1 WHERE id = ?");
    $inval->bind_param("i", $resetId);
    $inval->execute();
    json_fail(400, 'This verification code has expired (5-minute limit). Please request a new code.');
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

// 4. Successful verification: generate cryptographically secure reset authorization token (64 hex characters)
$resetToken = generateResetToken();
$resetTokenHash = hashResetToken($resetToken);

// Token expires in 15 minutes using DB NOW()
$upd = $conn->prepare("UPDATE password_resets SET is_verified = 1, reset_token_hash = ?, token_expires_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE), failed_attempts = 0 WHERE id = ?");
$upd->bind_param("si", $resetTokenHash, $resetId);
$upd->execute();

// Return unhashed reset token to the client for the subsequent password reset step
json_ok([
    'status' => 'success',
    'message' => 'Verification code confirmed successfully.',
    'reset_token' => $resetToken,
    'expires_in' => '15 minutes'
]);


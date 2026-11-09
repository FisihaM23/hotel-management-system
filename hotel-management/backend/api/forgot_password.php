<?php
// Endpoint: POST /forgot_password.php (or /auth.php?action=forgot_password)
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

if (empty($email)) {
    json_fail(400, 'Email address is required');
}

if (!isValidUserEmail($email)) {
    json_fail(400, emailPolicyMessage());
}

$clientIp = getClientIp();

// Rate limiting by IP: maximum 12 requests per 15 mins
if (isIpRateLimited($conn, $clientIp)) {
    json_fail(429, 'Too many requests from your network. Please wait 15 minutes before trying again.');
}

// Check if user exists and is active
$stmt = $conn->prepare("SELECT id, name, email, status FROM users WHERE email = ? AND status = 'active' LIMIT 1");
$stmt->bind_param("s", $email);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();

// Generic response message to prevent account enumeration
$genericResponse = [
    'status' => 'success',
    'message' => 'If that email address is registered, a 6-digit verification code has been dispatched.',
    'email' => $email
];

// If user does not exist, return generic success without revealing account absence
if (!$user) {
    json_ok($genericResponse);
    exit;
}

// Check 60-second cooldown for this user and purpose
$cooldownStmt = $conn->prepare("SELECT last_resend_at, (UNIX_TIMESTAMP(NOW()) - UNIX_TIMESTAMP(last_resend_at)) AS elapsed FROM password_resets WHERE user_id = ? AND purpose = 'forgot_password' ORDER BY id DESC LIMIT 1");
$cooldownStmt->bind_param("i", $user['id']);
$cooldownStmt->execute();
$cdRow = $cooldownStmt->get_result()->fetch_assoc();

if ($cdRow && $cdRow['elapsed'] !== null && (int)$cdRow['elapsed'] < 60) {
    $wait = 60 - (int)$cdRow['elapsed'];
    json_fail(429, "A verification code was recently generated. Please wait {$wait} seconds before requesting a new code.");
}

// Generate cryptographically secure 6-digit OTP
$otp = generateSecureOtp();
$otpHash = password_hash($otp, PASSWORD_DEFAULT);

// Dispatch OTP email using existing email engine FIRST to ensure safe delivery
$emailDispatched = sendOtpEmail($email, $user['name'], $otp, 'forgot_password');

if (!$emailDispatched) {
    // Safe failure handling: do NOT invalidate previous OTP, do NOT insert unusable record, do NOT trigger cooldown
    json_fail(503, 'Unable to dispatch verification code email at this time. Please check your notification configuration or try again shortly.');
}

// Email delivery confirmed: atomically invalidate old OTPs and insert new record
$conn->begin_transaction();
try {
    // Invalidate previous unverified/active forgot_password records for this user
    $inval = $conn->prepare("UPDATE password_resets SET used = 1 WHERE user_id = ? AND purpose = 'forgot_password' AND used = 0");
    if (!$inval) throw new RuntimeException($conn->error);
    $inval->bind_param("i", $user['id']);
    if (!$inval->execute()) throw new RuntimeException($inval->error ?: 'Failed to invalidate old OTP records');

    // Store in database with 5-minute expiry and purpose = 'forgot_password'
    $ins = $conn->prepare("INSERT INTO password_resets 
        (user_id, email, purpose, otp_hash, expires_at, failed_attempts, is_verified, used, ip_address, last_resend_at) 
        VALUES (?, ?, 'forgot_password', ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), 0, 0, 0, ?, NOW())");
    if (!$ins) throw new RuntimeException($conn->error);
    $ins->bind_param("isss", $user['id'], $email, $otpHash, $clientIp);
    if (!$ins->execute()) throw new RuntimeException($ins->error ?: 'Failed to insert new OTP record');

    // Log an in-app notification for the user
    $notifMsg = "A 6-digit password reset verification code was dispatched to {$email}.";
    $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Password Reset Code Sent', ?, 'info')");
    if ($notif) {
        $notif->bind_param("is", $user['id'], $notifMsg);
        $notif->execute();
    }

    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback();
    error_log("[ForgotPassword OTP Request] Transaction failed: " . $e->getMessage());
    json_fail(500, 'Database error while saving verification record.');
}

json_ok([
    'status' => 'success',
    'message' => 'A 6-digit verification code has been dispatched to your email address.',
    'email' => $email,
    'email_sent' => true
]);


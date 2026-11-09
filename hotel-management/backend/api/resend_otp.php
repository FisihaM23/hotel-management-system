<?php
// Endpoint: POST /resend_otp.php (or /auth.php?action=resend_otp)
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

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_fail(400, 'Valid email address is required');
}

$clientIp = getClientIp();

// Rate limiting check
if (isIpRateLimited($conn, $clientIp)) {
    json_fail(429, 'Too many requests. Please wait 15 minutes.');
}

// Find user
$stmt = $conn->prepare("SELECT id, name, email FROM users WHERE email = ? AND status = 'active' LIMIT 1");
$stmt->bind_param("s", $email);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();

$genericResponse = [
    'status' => 'success',
    'message' => 'If that email address is registered, a new 6-digit verification code has been dispatched.'
];

if (!$user) {
    json_ok($genericResponse);
    exit;
}

// Check 60-second cooldown for forgot_password
$cdStmt = $conn->prepare("SELECT (UNIX_TIMESTAMP(NOW()) - UNIX_TIMESTAMP(last_resend_at)) AS elapsed FROM password_resets WHERE user_id = ? AND purpose = 'forgot_password' ORDER BY id DESC LIMIT 1");
$cdStmt->bind_param("i", $user['id']);
$cdStmt->execute();
$cdRow = $cdStmt->get_result()->fetch_assoc();

if ($cdRow && $cdRow['elapsed'] !== null && (int)$cdRow['elapsed'] < 60) {
    $wait = 60 - (int)$cdRow['elapsed'];
    json_fail(429, "Please wait {$wait} seconds before requesting a new verification code.");
}

// Generate new 6-digit OTP
$otp = generateSecureOtp();
$otpHash = password_hash($otp, PASSWORD_DEFAULT);

// Send email FIRST to ensure safe delivery
$emailDispatched = sendOtpEmail($email, $user['name'], $otp, 'forgot_password');

if (!$emailDispatched) {
    json_fail(503, 'Unable to dispatch verification code email at this time. Please check your notification configuration or try again shortly.');
}

// Email delivery confirmed: atomically invalidate old OTPs and insert new record
$conn->begin_transaction();
try {
    // Invalidate previous unverified OTPs for forgot_password
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

    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback();
    error_log("[Resend OTP] Transaction failed: " . $e->getMessage());
    json_fail(500, 'Database error while saving verification record.');
}

json_ok([
    'status' => 'success',
    'message' => 'A new 6-digit verification code has been dispatched to your email address.',
    'email_sent' => true
]);


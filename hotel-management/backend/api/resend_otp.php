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

// Check 60-second cooldown
$cdStmt = $conn->prepare("SELECT (UNIX_TIMESTAMP(NOW()) - UNIX_TIMESTAMP(last_resend_at)) AS elapsed FROM password_resets WHERE user_id = ? ORDER BY id DESC LIMIT 1");
$cdStmt->bind_param("i", $user['id']);
$cdStmt->execute();
$cdRow = $cdStmt->get_result()->fetch_assoc();

if ($cdRow && $cdRow['elapsed'] !== null && (int)$cdRow['elapsed'] < 60) {
    $wait = 60 - (int)$cdRow['elapsed'];
    json_fail(429, "Please wait {$wait} seconds before requesting a new verification code.");
}

// Invalidate previous OTPs
$inval = $conn->prepare("UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0");
$inval->bind_param("i", $user['id']);
$inval->execute();

// Generate new 6-digit OTP
$otp = generateSecureOtp();
$otpHash = password_hash($otp, PASSWORD_DEFAULT);

// Store in database
$ins = $conn->prepare("INSERT INTO password_resets 
    (user_id, email, otp_hash, expires_at, failed_attempts, is_verified, used, ip_address, last_resend_at) 
    VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), 0, 0, 0, ?, NOW())");
$ins->bind_param("isss", $user['id'], $email, $otpHash, $clientIp);
$ins->execute();

// Send email
sendOtpEmail($email, $user['name'], $otp);

json_ok($genericResponse);


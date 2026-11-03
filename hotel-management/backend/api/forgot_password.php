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

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_fail(400, 'Please provide a valid email address');
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

// Check 60-second cooldown for this user
$cooldownStmt = $conn->prepare("SELECT last_resend_at, (UNIX_TIMESTAMP(NOW()) - UNIX_TIMESTAMP(last_resend_at)) AS elapsed FROM password_resets WHERE user_id = ? ORDER BY id DESC LIMIT 1");
$cooldownStmt->bind_param("i", $user['id']);
$cooldownStmt->execute();
$cdRow = $cooldownStmt->get_result()->fetch_assoc();

if ($cdRow && $cdRow['elapsed'] !== null && (int)$cdRow['elapsed'] < 60) {
    $wait = 60 - (int)$cdRow['elapsed'];
    json_fail(429, "A verification code was recently generated. Please wait {$wait} seconds before requesting a new code.");
}

// Invalidate previous unverified/active reset records for this user
$inval = $conn->prepare("UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0");
$inval->bind_param("i", $user['id']);
$inval->execute();

// Generate cryptographically secure 6-digit OTP
$otp = generateSecureOtp();
$otpHash = password_hash($otp, PASSWORD_DEFAULT);

// Store in database with 5-minute expiry
$ins = $conn->prepare("INSERT INTO password_resets 
    (user_id, email, otp_hash, expires_at, failed_attempts, is_verified, used, ip_address, last_resend_at) 
    VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), 0, 0, 0, ?, NOW())");
$ins->bind_param("isss", $user['id'], $email, $otpHash, $clientIp);
$ins->execute();

// Dispatch OTP email using existing email engine
$emailDispatched = sendOtpEmail($email, $user['name'], $otp);

// Log an in-app notification for the user
$notifMsg = "A 6-digit password reset verification code was dispatched to {$email}.";
$notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Password Reset Code Sent', ?, 'info')");
$notif->bind_param("is", $user['id'], $notifMsg);
$notif->execute();

// Return clean, generic response without exposing OTP or hashes
json_ok($genericResponse);


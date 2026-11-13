<?php
// Secure Delegator for Password Reset APIs
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/helpers.php';

$action = $_GET['action'] ?? '';

// Delegate to secure single-responsibility endpoints
if ($action === 'verify_otp') {
    require __DIR__ . '/verify_otp.php';
    exit;
}
if ($action === 'resend' || $action === 'resend_otp') {
    require __DIR__ . '/resend_otp.php';
    exit;
}
if ($action === 'reset' || $action === 'verify' || $action === 'verify_token') {
    require __DIR__ . '/reset_password.php';
    exit;
}
if ($action === 'request' || $action === 'forgot_password') {
    require __DIR__ . '/forgot_password.php';
    exit;
}

// Any direct legacy unverified resets are completely disabled
http_response_code(400);
echo json_encode(['error' => 'Please use the secure OTP password reset flow (?action=request, verify_otp, reset).']);
exit;

<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/helpers.php';

// ── CONFIG ──────────────────────────────────────────────────────────────────
// Gmail (use a 16-char App Password from https://myaccount.google.com/apppasswords)
define('SMTP_USER', 'your_gmail@gmail.com');    // <-- change this
define('SMTP_PASS', 'your_app_password');        // <-- change this
define('SMTP_FROM', 'your_gmail@gmail.com');    // <-- change this
define('SMTP_NAME', 'Hotel Management');

// Africa's Talking SMS (https://africastalking.com — free sandbox available)
define('AT_USERNAME', 'sandbox');               // <-- change to your AT username in production
define('AT_API_KEY',  'your_at_api_key');       // <-- change this (from AT dashboard)
define('AT_SENDER',   'HotelMgmt');             // <-- sender name (max 11 chars, or leave empty for sandbox)

define('FRONTEND_URL', 'http://localhost:5173');
// ────────────────────────────────────────────────────────────────────────────

$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// Ensure reset table exists
$conn->query("CREATE TABLE IF NOT EXISTS password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used TINYINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)");

// ── STEP 1: Request reset (POST ?action=request) ────────────────────────────
if ($method === 'POST' && $action === 'request') {
    $data  = json_decode(file_get_contents('php://input'), true);
    $email = trim($data['email'] ?? '');

    if (empty($email)) {
        http_response_code(400);
        die(json_encode(['error' => 'Email is required']));
    }

    // Fetch user with phone
    $stmt = $conn->prepare("SELECT id, name, phone FROM users WHERE email = ? AND status = 'active'");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();

    // Always return success to prevent email enumeration
    if (!$user) {
        echo json_encode(['message' => 'If that email exists, a reset link has been sent.']);
        exit;
    }

    // Generate secure token
    $token = bin2hex(random_bytes(32));

    // Invalidate old tokens
    $del = $conn->prepare("DELETE FROM password_resets WHERE email = ?");
    $del->bind_param("s", $email);
    $del->execute();

    // Store new token with database-synchronized expiry (1 hour)
    $ins = $conn->prepare("INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))");
    $ins->bind_param("ss", $email, $token);
    $ins->execute();

    $frontendOrigin = !empty($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : FRONTEND_URL;
    $resetLink = rtrim($frontendOrigin, '/') . '/reset-password?token=' . $token;

    $emailSent = false;
    $smsSent   = false;

    // Only attempt live SMTP if credentials are configured (not default placeholders)
    if (SMTP_USER !== 'your_gmail@gmail.com' && SMTP_PASS !== 'your_app_password') {
        $subject  = 'Password Reset Request - Hotel Management';
        $emailBody = "Hello {$user['name']},\n\n"
                   . "You requested a password reset. Click the link below:\n\n"
                   . $resetLink . "\n\n"
                   . "This link expires in 1 hour.\n\n"
                   . "If you did not request this, ignore this email.\n\n"
                   . "— Hotel Management Team";
        $emailSent = sendGmail(SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_NAME, $email, $user['name'], $subject, $emailBody);
    }

    // Only attempt SMS if API key is configured
    if (AT_API_KEY !== 'your_at_api_key' && AT_USERNAME !== 'sandbox') {
        $phone = normalizePhone($user['phone'] ?? '');
        if ($phone !== '') {
            $smsBody = "Hotel Mgmt: Password reset requested.\nLink: " . $resetLink . "\nExpires in 1 hour.";
            $smsSent = sendAfricasTalkingSMS(AT_USERNAME, AT_API_KEY, AT_SENDER, $phone, $smsBody);
        }
    }

    $notifMsg = "A password reset was requested. Reset link: " . $resetLink;
    $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Password Reset', ?, 'warning')");
    $notif->bind_param("is", $user['id'], $notifMsg);
    $notif->execute();

    echo json_encode([
        'status'     => 'success',
        'message'    => 'If that email exists, a reset link has been sent.',
        'email_sent' => $emailSent,
        'sms_sent'   => $smsSent,
        'token'      => $token,
        'reset_link' => $resetLink
    ]);
    exit;
}

// ── STEP 2: Verify token (GET ?action=verify&token=xxx) ─────────────────────
if ($method === 'GET' && $action === 'verify') {
    $token = $_GET['token'] ?? '';
    $stmt  = $conn->prepare("SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > NOW()");
    $stmt->bind_param("s", $token);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();

    if (!$row) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid or expired reset link']);
    } else {
        echo json_encode(['valid' => true, 'email' => $row['email']]);
    }
    exit;
}

// ── STEP 3: Set new password (POST ?action=reset) ───────────────────────────
if ($method === 'POST' && $action === 'reset') {
    $data     = json_decode(file_get_contents('php://input'), true);
    $token    = $data['token']    ?? '';
    $password = $data['password'] ?? '';

    if (empty($token) || empty($password)) {
        http_response_code(400);
        die(json_encode(['error' => 'Token and password are required']));
    }

    if (!passwordMeetsPolicy($password)) {
        json_fail(400, passwordPolicyMessage());
    }

    $stmt = $conn->prepare("SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > NOW()");
    $stmt->bind_param("s", $token);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();

    if (!$row) {
        http_response_code(400);
        die(json_encode(['error' => 'Invalid or expired reset link']));
    }

    // Update password
    $hash = password_hash($password, PASSWORD_BCRYPT);
    $upd  = $conn->prepare("UPDATE users SET password = ? WHERE email = ?");
    $upd->bind_param("ss", $hash, $row['email']);
    $upd->execute();

    // Mark token used
    $mark = $conn->prepare("UPDATE password_resets SET used = 1 WHERE token = ?");
    $mark->bind_param("s", $token);
    $mark->execute();

    // Notify user
    $userStmt = $conn->prepare("SELECT id, name, email, phone FROM users WHERE email = ?");
    $userStmt->bind_param("s", $row['email']);
    $userStmt->execute();
    $user = $userStmt->get_result()->fetch_assoc();

    if ($user) {
        // In-app notification
        $msg   = "Your password was successfully reset.";
        $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Password Changed', ?, 'success')");
        $notif->bind_param("is", $user['id'], $msg);
        $notif->execute();

        // Email confirmation if configured
        if (SMTP_USER !== 'your_gmail@gmail.com' && SMTP_PASS !== 'your_app_password') {
            $subject  = 'Password Changed - Hotel Management';
            $emailBody = "Hello {$user['name']},\n\nYour password has been successfully changed.\n\nIf you did not do this, contact support immediately.\n\n— Hotel Management Team";
            sendGmail(SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_NAME, $user['email'], $user['name'], $subject, $emailBody);
        }

        // SMS confirmation if configured
        if (AT_API_KEY !== 'your_at_api_key' && AT_USERNAME !== 'sandbox') {
            $phone = normalizePhone($user['phone'] ?? '');
            if ($phone !== '') {
                sendAfricasTalkingSMS(AT_USERNAME, AT_API_KEY, AT_SENDER, $phone, "Hotel Mgmt: Your password has been successfully changed.");
            }
        }
    }

    echo json_encode(['message' => 'Password reset successful. You can now log in.']);
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'Invalid request']);
$conn->close();

// ── Helpers ──────────────────────────────────────────────────────────────────

// Normalize Ethiopian phone: 0932338138 → +251932338138
function normalizePhone($phone) {
    $phone = preg_replace('/\D/', '', $phone);
    if (empty($phone)) return '';
    if (substr($phone, 0, 4) === '2519' || substr($phone, 0, 3) === '251') return '+' . $phone;
    if (substr($phone, 0, 1) === '0') return '+251' . substr($phone, 1);
    return '+' . $phone;
}

// Gmail SMTP (no PHPMailer needed)
function sendGmail($smtpUser, $smtpPass, $fromEmail, $fromName, $toEmail, $toName, $subject, $body) {
    $socket = @fsockopen('ssl://smtp.gmail.com', 465, $errno, $errstr, 10);
    if (!$socket) return false;

    $r = function() use ($socket) { return fgets($socket, 515); };
    $s = function($cmd) use ($socket) { fputs($socket, $cmd . "\r\n"); };

    $r();
    $s("EHLO localhost");
    while ($line = $r()) { if (substr($line, 3, 1) === ' ') break; }
    $s("AUTH LOGIN"); $r();
    $s(base64_encode($smtpUser)); $r();
    $s(base64_encode($smtpPass));
    $resp = $r();
    if (strpos($resp, '235') === false) { fclose($socket); return false; }

    $s("MAIL FROM:<{$fromEmail}>"); $r();
    $s("RCPT TO:<{$toEmail}>"); $r();
    $s("DATA"); $r();

    $msg  = "From: {$fromName} <{$fromEmail}>\r\n";
    $msg .= "To: {$toName} <{$toEmail}>\r\n";
    $msg .= "Subject: {$subject}\r\n";
    $msg .= "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n";
    $msg .= $body . "\r\n.\r\n";
    $s($msg); $r();
    $s("QUIT");
    fclose($socket);
    return true;
}

// Africa's Talking SMS
function sendAfricasTalkingSMS($username, $apiKey, $from, $to, $message) {
    $url  = ($username === 'sandbox')
          ? 'https://api.sandbox.africastalking.com/version1/messaging'
          : 'https://api.africastalking.com/version1/messaging';

    $data = http_build_query([
        'username' => $username,
        'to'       => $to,
        'message'  => $message,
        'from'     => $from,
    ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $data,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'Accept: application/json',
            'apiKey: ' . $apiKey,
            'Content-Type: application/x-www-form-urlencoded',
        ],
        CURLOPT_TIMEOUT => 10,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return $httpCode === 201 || $httpCode === 200;
}

<?php
// Secure Email OTP Helper for Hotel Management System
require_once __DIR__ . '/notifications.php';
require_once __DIR__ . '/helpers.php';

/**
 * Generate cryptographically secure 6-digit OTP
 */
function generateSecureOtp(): string {
    return (string) random_int(100000, 999999);
}

/**
 * Generate cryptographically secure 64-char reset authorization token
 */
function generateResetToken(): string {
    return bin2hex(random_bytes(32));
}

/**
 * Hash reset token using SHA-256 for secure storage
 */
function hashResetToken(string $token): string {
    return hash('sha256', $token);
}

/**
 * Safely get client IP address
 */
function getClientIp(): string {
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        return $_SERVER['HTTP_CF_CONNECTING_IP'];
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($ips[0]);
    }
    return $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
}

/**
 * Check IP-based rate limiting (max 12 OTP requests per 15 mins per IP)
 */
function isIpRateLimited(mysqli $conn, string $ip): bool {
    $stmt = $conn->prepare("SELECT COUNT(*) as cnt FROM password_resets WHERE ip_address = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)");
    $stmt->bind_param("s", $ip);
    $stmt->execute();
    $res = $stmt->get_result()->fetch_assoc();
    return ($res['cnt'] ?? 0) >= 12;
}

/**
 * Send branded 6-Digit Email OTP
 */
function sendOtpEmail(string $toEmail, string $userName, string $otp): bool {
    $subject = "Your Hotel Management System Password Reset Code";
    $formattedOtp = substr($otp, 0, 3) . ' ' . substr($otp, 3, 3);
    $displayName = !empty($userName) ? htmlspecialchars($userName) : 'Valued Guest';

    $html = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{$subject}</title>
</head>
<body style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color:#050805; color:#e2e8f0; margin:0; padding:24px;">
  <div style="max-width:560px; margin:0 auto; background-color:#0c130c; border:1px solid #d4af37; border-radius:16px; overflow:hidden; box-shadow:0 12px 40px rgba(0,0,0,0.65);">
    <!-- Top Luxury Header -->
    <div style="background:linear-gradient(135deg, #1b261b 0%, #0d160e 100%); padding:28px 24px; text-align:center; border-bottom:1px solid rgba(212,175,55,0.3);">
      <div style="display:inline-block; width:52px; height:52px; line-height:52px; background:linear-gradient(135deg,#d4af37,#996515); border-radius:14px; font-size:26px; color:#050805; margin-bottom:8px;">🏨</div>
      <h1 style="margin:0; font-size:22px; font-weight:800; color:#ffffff; letter-spacing:-0.01em;">Grand Escape Hotel & Resort</h1>
      <p style="margin:4px 0 0; font-size:11px; text-transform:uppercase; letter-spacing:0.14em; color:#d4af37; font-weight:700;">6-Floor International Hospitality</p>
    </div>

    <!-- Main Content -->
    <div style="padding:32px 28px;">
      <h2 style="color:#ffffff; font-size:18px; margin-top:0; font-weight:700;">Password Reset Verification</h2>
      <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin-bottom:20px;">
        Hello <strong>{$displayName}</strong>,<br>
        We received a request to reset the password for your Hotel Management System account. Use the 6-digit verification code below to authorize the password reset:
      </p>

      <!-- OTP Display Box -->
      <div style="background:#142014; border:1.5px solid #d4af37; border-radius:12px; padding:20px; text-align:center; margin:24px 0;">
        <span style="font-size:12px; text-transform:uppercase; letter-spacing:0.12em; color:#94a3b8; display:block; margin-bottom:8px; font-weight:600;">Your 6-Digit Verification Code</span>
        <div style="font-family:Courier, monospace, sans-serif; font-size:36px; font-weight:800; letter-spacing:8px; color:#d4af37; text-shadow:0 0 12px rgba(212,175,55,0.4);">
          {$formattedOtp}
        </div>
        <span style="display:inline-block; margin-top:8px; font-size:12px; color:#ef4444; font-weight:600;">⏱️ Valid for 5 minutes only</span>
      </div>

      <!-- Security Notice -->
      <div style="background:rgba(239,68,68,0.1); border-left:4px solid #ef4444; padding:12px 16px; border-radius:6px; margin:20px 0;">
        <p style="margin:0; font-size:12.5px; color:#fca5a5; line-height:1.5;">
          <strong>Security Warning:</strong> Never share this code with anyone. Grand Hotel staff will never contact you asking for your verification code.
        </p>
      </div>

      <p style="color:#94a3b8; font-size:13px; line-height:1.5; margin-top:20px;">
        If you did not initiate this request, you can safely disregard this email. Your current password remains active and secure.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#080e09; padding:20px; text-align:center; border-top:1px solid rgba(255,255,255,0.08); font-size:12px; color:#64748b;">
      <p style="margin:0 0 6px;">Grand Escape Hotel & Resort Park • Addis Ababa, Ethiopia</p>
      <p style="margin:0;">Support: <strong>0932338138</strong> • Email: <strong>befather7@gmail.com</strong></p>
    </div>
  </div>
</body>
</html>
HTML;

    $text = "Your Grand Hotel Password Reset Code is: {$otp}\n\n"
          . "This code expires in 5 minutes.\n"
          . "Security Warning: Never share this code with anyone.\n"
          . "If you did not request this, please ignore this message.\n\n"
          . "Grand Escape Hotel & Resort";

    // 1. Try Resend Transactional Email Engine
    require_once __DIR__ . '/resend.php';
    if (!empty(getResendApiKey())) {
        $resResult = sendResendEmail($toEmail, $subject, $html, $text);
        if (!empty($resResult['success'])) {
            return true;
        }
    }

    // 2. Fallback to direct SMTP / PHP mail
    return sendEmailAlert($toEmail, $displayName, $subject, $text);
}

/**
 * Send confirmation email after password reset
 */
function sendPasswordResetConfirmationEmail(string $toEmail, string $userName): bool {
    $subject = "Password Changed Successfully - Hotel Management System";
    $displayName = !empty($userName) ? htmlspecialchars($userName) : 'Valued Guest';
    $time = date('F j, Y, g:i a') . ' (Server Time)';

    $html = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>{$subject}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background-color:#050805; color:#e2e8f0; margin:0; padding:24px;">
  <div style="max-width:540px; margin:0 auto; background-color:#0c130c; border:1px solid #22c55e; border-radius:14px; overflow:hidden;">
    <div style="background:linear-gradient(135deg,#059669,#047857); padding:20px; text-align:center; color:#ffffff;">
      <h2 style="margin:0; font-size:20px;">Grand Escape Hotel & Resort</h2>
      <p style="margin:4px 0 0; font-size:12px;">Security Alert Notification</p>
    </div>
    <div style="padding:24px;">
      <h3 style="color:#22c55e; margin-top:0;">Password Reset Successful</h3>
      <p style="color:#cbd5e1; font-size:14px; line-height:1.6;">
        Hello <strong>{$displayName}</strong>,<br>
        Your account password was successfully updated on <strong>{$time}</strong> via verified email OTP.
      </p>
      <div style="background:#142014; border:1px solid #1e3820; border-radius:8px; padding:14px; margin:16px 0; font-size:13px; color:#94a3b8;">
        If you performed this action, no further steps are required. You can now sign in with your new password.
      </div>
      <p style="color:#ef4444; font-size:12.5px; line-height:1.5;">
        <strong>Didn't make this change?</strong> Please contact Administrator Mulugeta Fisiha immediately at <strong>0932338138</strong> or <strong>befather7@gmail.com</strong>.
      </p>
    </div>
  </div>
</body>
</html>
HTML;

    $text = "Hello {$displayName},\n\n"
          . "Your account password was successfully updated on {$time}.\n\n"
          . "If you did not perform this action, contact support immediately at 0932338138.\n\n"
          . "Grand Escape Hotel & Resort";

    require_once __DIR__ . '/resend.php';
    if (!empty(getResendApiKey())) {
        $resResult = sendResendEmail($toEmail, $subject, $html, $text);
        if (!empty($resResult['success'])) return true;
    }
    return sendEmailAlert($toEmail, $displayName, $subject, $text);
}


<?php
// Resend Email Integration Engine for Hotel Management System
// Loads Resend API key from backend/.env and dispatches transactional emails

if (!function_exists('loadEnvFile')) {
    function loadEnvFile() {
        static $loaded = false;
        if ($loaded) return;
        $loaded = true;

        $candidatePaths = [
            dirname(__DIR__) . '/.env',
            'c:/Hotel managment/hotel-management/backend/.env',
            dirname(__DIR__, 2) . '/backend/.env',
            'C:/wamp64/www/hotel-management/backend/.env',
            dirname(__DIR__, 2) . '/.env'
        ];

        foreach ($candidatePaths as $path) {
            if (file_exists($path)) {
                $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                if ($lines !== false) {
                    foreach ($lines as $line) {
                        $line = trim($line);
                        if (empty($line) || str_starts_with($line, '#')) continue;
                        if (str_starts_with($line, 're_')) {
                            $val = trim($line, "\"' \t\n\r\0\x0B");
                            putenv("Resend_API_KEY={$val}");
                            putenv("RESEND_API_KEY={$val}");
                            $_ENV['Resend_API_KEY'] = $val;
                            $_ENV['RESEND_API_KEY'] = $val;
                            $_SERVER['Resend_API_KEY'] = $val;
                            $_SERVER['RESEND_API_KEY'] = $val;
                            continue;
                        }
                        $parts = explode('=', $line, 2);
                        if (count($parts) === 2) {
                            $key = trim($parts[0]);
                            $val = trim(trim($parts[1]), "\"' \t\n\r\0\x0B");
                            if (!empty($key)) {
                                putenv("{$key}={$val}");
                                $_ENV[$key] = $val;
                                $_SERVER[$key] = $val;
                                if (strcasecmp($key, 'RESEND_API_KEY') === 0) {
                                    putenv("Resend_API_KEY={$val}");
                                    putenv("RESEND_API_KEY={$val}");
                                    $_ENV['Resend_API_KEY'] = $val;
                                    $_ENV['RESEND_API_KEY'] = $val;
                                    $_SERVER['Resend_API_KEY'] = $val;
                                    $_SERVER['RESEND_API_KEY'] = $val;
                                }
                            }
                        }
                    }
                    break;
                }
            }
        }
    }
}

// Auto-load .env on include
loadEnvFile();

function getResendApiKey() {
    loadEnvFile();
    return getenv('RESEND_API_KEY') 
        ?: getenv('Resend_API_KEY') 
        ?: ($_ENV['RESEND_API_KEY'] ?? '') 
        ?: ($_ENV['Resend_API_KEY'] ?? '')
        ?: ($_SERVER['RESEND_API_KEY'] ?? '')
        ?: ($_SERVER['Resend_API_KEY'] ?? '');
}

function getResendFromEmail() {
    loadEnvFile();
    $custom = getenv('RESEND_FROM_EMAIL') 
        ?: ($_ENV['RESEND_FROM_EMAIL'] ?? '')
        ?: ($_SERVER['RESEND_FROM_EMAIL'] ?? '');
    
    // Default sender for Resend (onboarding@resend.dev works out of the box for test account owner)
    return !empty($custom) ? $custom : 'Grand Hotel <onboarding@resend.dev>';
}

/**
 * Dispatch an email using Resend REST API
 * @param string|array $to
 * @param string $subject
 * @param string $htmlContent
 * @param string $textContent
 * @return array ['success' => bool, 'http_code' => int, 'data' => mixed, 'error' => string]
 */
function sendResendEmail($to, $subject, $htmlContent, $textContent = '') {
    $apiKey = getResendApiKey();

    if (empty($apiKey)) {
        error_log("[Resend Email] Missing API key in backend/.env (Resend_API_KEY).");
        return [
            'success' => false,
            'http_code' => 0,
            'error' => 'Missing Resend API key in backend/.env'
        ];
    }

    $toList = is_array($to) ? $to : [trim((string)$to)];
    $toList = array_values(array_filter($toList, function($e) {
        return filter_var($e, FILTER_VALIDATE_EMAIL);
    }));

    if (empty($toList)) {
        error_log("[Resend Email] No valid recipient email provided: " . json_encode($to));
        return [
            'success' => false,
            'http_code' => 0,
            'error' => 'Invalid recipient email address'
        ];
    }

    $payload = [
        'from' => getResendFromEmail(),
        'to' => $toList,
        'subject' => $subject,
        'html' => $htmlContent
    ];

    if (!empty($textContent)) {
        $payload['text'] = $textContent;
    }

    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json'
        ]
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        error_log("[Resend Email] cURL Error: " . $curlErr);
        return [
            'success' => false,
            'http_code' => $httpCode,
            'error' => $curlErr
        ];
    }

    $data = json_decode($response, true);
    $isSuccess = ($httpCode >= 200 && $httpCode < 300);

    if (!$isSuccess) {
        $errMsg = $data['message'] ?? $response ?? 'Unknown Resend error';
        error_log("[Resend Email] HTTP {$httpCode} Error: " . $errMsg);
        return [
            'success' => false,
            'http_code' => $httpCode,
            'error' => $errMsg,
            'data' => $data
        ];
    }

    error_log("[Resend Email] Success sending to " . implode(', ', $toList) . " (ID: " . ($data['id'] ?? '') . ")");
    return [
        'success' => true,
        'http_code' => $httpCode,
        'id' => $data['id'] ?? null,
        'data' => $data
    ];
}

/**
 * Optional SMTP Socket Fallback (e.g. Gmail SMTP or custom host)
 */
function sendSmtpEmailFallback($toEmail, $toName, $subject, $htmlContent, $textContent = '') {
    loadEnvFile();
    $smtpUser = getenv('SMTP_USER') ?: ($_ENV['SMTP_USER'] ?? '');
    $smtpPass = getenv('SMTP_PASS') ?: ($_ENV['SMTP_PASS'] ?? '');
    $smtpHost = getenv('SMTP_HOST') ?: ($_ENV['SMTP_HOST'] ?? 'ssl://smtp.gmail.com');
    $smtpPort = getenv('SMTP_PORT') ?: ($_ENV['SMTP_PORT'] ?? 465);
    $smtpFrom = getenv('SMTP_FROM') ?: ($_ENV['SMTP_FROM'] ?? $smtpUser);
    $smtpName = getenv('SMTP_NAME') ?: ($_ENV['SMTP_NAME'] ?? 'Grand 6-Floor Hotel & Resort Park');

    if (empty($smtpUser) || empty($smtpPass) || $smtpUser === 'your_gmail@gmail.com') {
        return false;
    }

    $socket = @fsockopen($smtpHost, (int)$smtpPort, $errno, $errstr, 10);
    if (!$socket) {
        error_log("[SMTP Email] Socket connection failed: {$errstr} ({$errno})");
        return false;
    }

    $r = function() use ($socket) { return fgets($socket, 515); };
    $s = function($cmd) use ($socket) { fputs($socket, $cmd . "\r\n"); };

    $r();
    $s("EHLO localhost");
    while ($line = $r()) { if (substr($line, 3, 1) === ' ') break; }
    $s("AUTH LOGIN"); $r();
    $s(base64_encode($smtpUser)); $r();
    $s(base64_encode($smtpPass));
    $resp = $r();
    if (strpos($resp, '235') === false) {
        fclose($socket);
        error_log("[SMTP Email] Auth failed: " . trim((string)$resp));
        return false;
    }

    $s("MAIL FROM:<{$smtpFrom}>"); $r();
    $s("RCPT TO:<{$toEmail}>"); $r();
    $s("DATA"); $r();

    $boundary = "----=_Part_" . md5(uniqid());
    $msg  = "From: {$smtpName} <{$smtpFrom}>\r\n";
    $msg .= "To: {$toName} <{$toEmail}>\r\n";
    $msg .= "Subject: {$subject}\r\n";
    $msg .= "MIME-Version: 1.0\r\n";
    $msg .= "Content-Type: multipart/alternative; boundary=\"{$boundary}\"\r\n\r\n";

    if (!empty($textContent)) {
        $msg .= "--{$boundary}\r\n";
        $msg .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $msg .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
        $msg .= $textContent . "\r\n\r\n";
    }

    $msg .= "--{$boundary}\r\n";
    $msg .= "Content-Type: text/html; charset=UTF-8\r\n";
    $msg .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
    $msg .= $htmlContent . "\r\n\r\n";
    $msg .= "--{$boundary}--\r\n.\r\n";

    $s($msg);
    $r();
    $s("QUIT");
    fclose($socket);
    error_log("[SMTP Email] Successfully sent email to {$toEmail} via SMTP.");
    return true;
}

/**
 * Send customer registration welcome email using Resend API to the customer's actual registered email address
 * @param string $toEmail Customer's registered email address
 * @param string $toName Customer's full name
 * @param array $extra Optional parameters [loginUrl, temporary_password, phone]
 * @return array ['success' => bool, 'channel' => string, 'delivered_to' => string|null, 'id' => string|null, 'error' => string|null, 'message' => string]
 */
function sendCustomerWelcomeEmail($toEmail, $toName, $extra = []) {
    $toEmail = trim((string)$toEmail);
    if (empty($toEmail) || !filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
        error_log("[Resend Welcome Email] Invalid recipient email provided: '{$toEmail}'");
        return [
            'success' => false,
            'channel' => 'resend',
            'delivered_to' => null,
            'target_email' => $toEmail,
            'http_code' => 400,
            'error' => 'Invalid recipient email address',
            'message' => 'Invalid recipient email address provided.'
        ];
    }

    $toName = trim((string)$toName);
    if (empty($toName)) {
        $toName = 'Valued Guest';
    }
    $safeName = htmlspecialchars($toName, ENT_QUOTES, 'UTF-8');
    $safeEmail = htmlspecialchars($toEmail, ENT_QUOTES, 'UTF-8');

    $loginUrl = $extra['loginUrl'] ?? 'http://localhost:5173/login';
    $setupUrl = !empty($extra['setup_url']) ? trim((string)$extra['setup_url']) : '';
    $tempPassword = !empty($extra['temporary_password']) ? trim((string)$extra['temporary_password']) : '';
    $supportEmail = 'befather7@gmail.com';
    $supportPhone = '+251 932 338 138';

    // Required standardized subject
    $subject = "Welcome to Grand Hotel – Your Account Has Been Successfully Created!";

    // Prefer secure one-time password setup link over plaintext temporary password
    $tempPasswordHtml = '';
    $tempPasswordText = '';
    if (!empty($setupUrl)) {
        $safeSetupUrl = htmlspecialchars($setupUrl, ENT_QUOTES, 'UTF-8');
        $tempPasswordHtml = <<<HTML
      <div style="background:#142014; border:1.5px solid #22c55e; border-radius:10px; padding:16px; margin:20px 0; text-align:center;">
        <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; font-weight:700; margin-bottom:10px;">Set Your Account Password</div>
        <a href="{$safeSetupUrl}" style="display:inline-block; background:#22c55e; color:#041d0a; font-weight:800; padding:10px 22px; border-radius:99px; text-decoration:none; font-size:13px;">Set Password Now</a>
        <div style="font-size:12px; color:#cbd5e1; margin-top:10px;">This one-time setup link expires in 24 hours. Please set a strong personal password before signing in.</div>
      </div>
HTML;
        $tempPasswordText = "\nSet Your Password (one-time link, expires in 24 hours): {$setupUrl}\n";
    } elseif (!empty($tempPassword)) {
        $safeTempPw = htmlspecialchars($tempPassword, ENT_QUOTES, 'UTF-8');
        $tempPasswordHtml = <<<HTML
      <div style="background:#142014; border:1.5px dashed #22c55e; border-radius:10px; padding:16px; margin:20px 0; text-align:center;">
        <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; font-weight:700; margin-bottom:6px;">Your Temporary Access Password</div>
        <div style="font-family:Courier, monospace; font-size:22px; font-weight:800; letter-spacing:2px; color:#22c55e;">{$safeTempPw}</div>
        <div style="font-size:12px; color:#cbd5e1; margin-top:8px;">Please sign in using this temporary password and update it immediately.</div>
      </div>
HTML;
        $tempPasswordText = "\nTemporary Access Password: {$tempPassword}\n(Please sign in and change this temporary password immediately).\n";
    }

    // Professional, Responsive Luxury HTML Template
    $htmlContent = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Grand Hotel</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #050805; color: #e7ffe4; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 20px auto; background-color: #0c130c; border: 1px solid #1e3820; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }
    .header p { margin: 8px 0 0; font-size: 13px; opacity: 0.92; font-weight: 500; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 99px; background: rgba(255,255,255,0.2); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }
    .content { padding: 30px 24px; color: #e2e8f0; }
    .greeting { font-size: 18px; font-weight: 700; color: #ffffff; margin-bottom: 14px; }
    .lead { font-size: 14px; line-height: 1.6; color: #cbd5e1; margin-bottom: 20px; }
    .card { background-color: #142014; border: 1px solid #1e3820; border-radius: 12px; padding: 18px; margin-bottom: 22px; }
    .card-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #22c55e; margin-bottom: 12px; }
    .feature-list { list-style: none; padding: 0; margin: 0; font-size: 13px; line-height: 1.8; color: #cbd5e1; }
    .feature-list li { margin-bottom: 6px; }
    .feature-list strong { color: #ffffff; }
    .btn-container { text-align: center; margin: 28px 0; }
    .btn { display: inline-block; background-color: #22c55e; color: #041d0a !important; font-weight: 800; font-size: 14px; text-decoration: none; padding: 13px 30px; border-radius: 99px; box-shadow: 0 4px 14px rgba(34,197,94,0.35); text-transform: uppercase; letter-spacing: 0.05em; }
    .account-box { background: #070c07; border: 1px dashed #1e3820; border-radius: 10px; padding: 14px; font-size: 12.5px; line-height: 1.6; color: #94a3b8; }
    .account-box span { color: #22c55e; font-weight: 700; }
    .amharic-section { background-color: #111a11; border-left: 3px solid #22c55e; padding: 14px 16px; margin-top: 20px; font-size: 13px; color: #cbd5e1; line-height: 1.6; border-radius: 0 8px 8px 0; }
    .footer { background-color: #070c07; border-top: 1px solid #1e3820; padding: 22px; text-align: center; font-size: 11.5px; color: #64748b; line-height: 1.6; }
    .footer a { color: #22c55e; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <!-- HEADER -->
    <div class="header">
      <div class="badge">🏛️ Grand Hospitality Architecture</div>
      <h1>Grand Hotel & Resort Park</h1>
      <p>Luxury Accommodation • Resort Park & Gardens • Ethiopian & International Dining</p>
    </div>

    <!-- MAIN BODY -->
    <div class="content">
      <div class="greeting">Dear {$safeName},</div>
      <p class="lead">
        <strong>Welcome to Grand Hotel!</strong><br><br>
        We are delighted to welcome you as our valued customer.<br><br>
        Your account has been successfully created. You can now explore our hotel services, browse available rooms across our 6-floor architectural building, make reservations, and manage your bookings conveniently through our website.
      </p>

      {$tempPasswordHtml}

      <!-- HIGHLIGHTS CARD -->
      <div class="card">
        <div class="card-title">✨ What You Can Experience At Grand Hotel</div>
        <ul class="feature-list">
          <li>🏢 <strong>6-Floor Luxury Architecture:</strong> Explore & book rooms across all six floors — from botanical garden terrace suites to panoramic sky penthouses.</li>
          <li>🇪🇹 <strong>Authentic Ethiopian Cuisine:</strong> Savor gourmet culinary specialties including Doro Wat, Special Tibs, Kitfo, and traditional coffee ceremonies.</li>
          <li>🍹 <strong>Refreshment & Cocktail Lounge:</strong> Enjoy artisan refreshments, fresh juices, fine wines, and handcrafted beverages.</li>
          <li>💳 <strong>Easy Local & Mobile Payments:</strong> Securely reserve and pay via Telebirr, CBE Birr, Chapa, or Pay at Desk.</li>
        </ul>
      </div>

      <!-- ACCOUNT SUMMARY -->
      <div class="account-box">
        <div><strong>Registered Email:</strong> <span>{$safeEmail}</span></div>
        <div><strong>Customer Name:</strong> <span>{$safeName}</span></div>
        <div><strong>Account Status:</strong> <span style="color:#10b981;">Active & Ready</span></div>
      </div>

      <!-- CTA BUTTON -->
      <div class="btn-container">
        <a href="{$loginUrl}" class="btn" target="_blank">Access Guest Portal & Book Your Stay</a>
      </div>

      <p style="font-size:13.5px; line-height:1.6; color:#cbd5e1; margin-top:24px;">
        Thank you for choosing Grand Hotel. We look forward to providing you with an excellent hospitality experience.
      </p>

      <p style="font-size:13.5px; color:#ffffff; font-weight:700; margin-top:16px;">
        Best regards,<br>
        <span style="color:#22c55e;">Grand Hotel Management Team</span>
      </p>

      <!-- BILINGUAL AMHARIC WELCOME -->
      <div class="amharic-section">
        <strong>እንኳን ወደ ግራንድ ሆቴል በደህና መጡ!</strong><br>
        የእርስዎ የተጠቃሚ መለያ በተሳካ ሁኔታ ተፈጥሯል። በሆቴላችን ውስጥ የሚገኙ የቅንጦት ክፍሎችን መያዝ፣ የባህላዊ እና ዓለም አቀፍ ምግቦችን ማዘዝ፣ እንዲሁም ዘመናዊ መስተንግዶ ማግኘት ይችላሉ።
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <div>System Administrator: <strong>Mulugeta Fisiha</strong></div>
      <div>Direct Inquiries: <a href="mailto:{$supportEmail}">{$supportEmail}</a> | Phone: <strong>{$supportPhone}</strong></div>
      <div style="margin-top: 8px;">&copy; 2026 Grand Hotel & Resort Park • Addis Ababa, Ethiopia. All rights reserved.</div>
    </div>
  </div>
</body>
</html>
HTML;

    // Plain text alternative
    $textContent = <<<TEXT
Dear {$toName},

Welcome to Grand Hotel!

We are delighted to welcome you as our valued customer.

Your account has been successfully created. You can now explore our hotel services, browse available rooms, make reservations, and manage your bookings conveniently through our website.
{$tempPasswordText}
Account Details:
- Registered Email: {$toEmail}
- Customer Name: {$toName}
- Status: Active & Ready

Experience at Grand Hotel:
1. 6-Floor Hospitality Architecture & Executive Suites
2. Authentic Ethiopian Traditional Cuisine (Doro Wat, Special Tibs, Kitfo)
3. Refreshment, Cocktail & Arabica Coffee Ceremony Lounge
4. Instant bookings with Telebirr, CBE Birr, and Chapa

Sign in to your guest portal:
{$loginUrl}

Thank you for choosing Grand Hotel. We look forward to providing you with an excellent hospitality experience.

Best regards,
Grand Hotel Management Team

Need assistance? Contact System Administrator Mulugeta Fisiha at {$supportEmail} or {$supportPhone}.
Grand Hotel & Resort Park • Addis Ababa, Ethiopia
TEXT;

    // Direct delivery via Resend API - recipient is strictly the customer's email ($toEmail)
    $resendResult = sendResendEmail($toEmail, $subject, $htmlContent, $textContent);

    if (!empty($resendResult['success'])) {
        error_log("[Resend Welcome Email] Successfully dispatched welcome email to customer: {$toEmail} (ID: " . ($resendResult['id'] ?? '') . ")");
        return [
            'success' => true,
            'channel' => 'resend',
            'delivered_to' => $toEmail,
            'id' => $resendResult['id'] ?? null,
            'http_code' => $resendResult['http_code'] ?? 200,
            'message' => "Welcome email sent successfully to {$toEmail} via Resend."
        ];
    }

    $errMsg = is_string($resendResult['error'] ?? '') ? $resendResult['error'] : json_encode($resendResult['error'] ?? '');
    $isSandboxRestriction = (isset($resendResult['http_code']) && ($resendResult['http_code'] === 403 || $resendResult['http_code'] === 422))
        || stripos($errMsg, 'testing emails') !== false
        || stripos($errMsg, 'verify a domain') !== false;

    error_log("[Resend Welcome Email] Delivery to customer {$toEmail} failed (HTTP " . ($resendResult['http_code'] ?? 0) . "): {$errMsg}");

    // Note: We never reroute the customer's welcome email to the administrator.
    // The recipient is strictly preserved as the customer.
    return [
        'success' => false,
        'channel' => 'resend',
        'delivered_to' => null,
        'target_email' => $toEmail,
        'http_code' => $resendResult['http_code'] ?? 0,
        'error' => $errMsg,
        'sandbox_restricted' => $isSandboxRestriction,
        'message' => $isSandboxRestriction
            ? "Resend is using onboarding@resend.dev (test domain). To deliver to external customer inboxes like {$toEmail}, please verify your custom domain in Resend and update RESEND_FROM_EMAIL in backend/.env."
            : "Failed to deliver welcome email to {$toEmail}: {$errMsg}"
    ];
}

/**
 * Send a secure one-time password reset link via Resend without storing the link in DB notifications.
 */
function sendPasswordResetLinkEmail(string $toEmail, string $toName, string $resetUrl): array {
    $safeName = htmlspecialchars($toName ?: 'Valued User', ENT_QUOTES, 'UTF-8');
    $safeUrl = htmlspecialchars($resetUrl, ENT_QUOTES, 'UTF-8');
    $subject = 'Grand Hotel – Secure Password Reset Link';
    $html = <<<HTML
<!DOCTYPE html>
<html lang="en">
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#050805; color:#e2e8f0; padding:24px;">
  <div style="max-width:540px; margin:0 auto; background:#0c130c; border:1px solid #22c55e; border-radius:14px; padding:24px;">
    <h2 style="color:#22c55e; margin-top:0;">Password Reset Request</h2>
    <p>Hello <strong>{$safeName}</strong>,</p>
    <p>A one-time password reset link was generated for your Grand Hotel account. This link expires in 1 hour.</p>
    <div style="text-align:center; margin:24px 0;">
      <a href="{$safeUrl}" style="display:inline-block; background:#22c55e; color:#041d0a; font-weight:800; padding:12px 26px; border-radius:99px; text-decoration:none;">Reset Password</a>
    </div>
    <p style="font-size:12px; color:#94a3b8;">If you did not request this, please ignore this email and contact your administrator.</p>
  </div>
</body>
</html>
HTML;
    $text = "Hello {$toName},\n\nUse this one-time link (expires in 1 hour) to reset your Grand Hotel password:\n{$resetUrl}\n";
    return sendResendEmail($toEmail, $subject, $html, $text);
}

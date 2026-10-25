<?php
// Resend Email Integration Engine for Hotel Management System
// Loads Resend API key from backend/.env and dispatches transactional emails

if (!function_exists('loadEnvFile')) {
    function loadEnvFile() {
        static $loaded = false;
        if ($loaded) return;
        $loaded = true;

        $candidatePaths = [
            'c:/Hotel managment/hotel-management/backend/.env',
            'C:/wamp64/www/hotel-management/backend/.env',
            'C:/wamp64/www/hotel-management/.env',
            dirname(__DIR__) . '/.env',
            dirname(__DIR__, 2) . '/backend/.env',
            dirname(__DIR__, 2) . '/.env'
        ];

        foreach ($candidatePaths as $path) {
            if (file_exists($path) && is_readable($path)) {
                $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                if ($lines !== false) {
                    foreach ($lines as $line) {
                        $line = trim($line);
                        if (empty($line) || str_starts_with($line, '#')) continue;
                        $parts = explode('=', $line, 2);
                        if (count($parts) === 2) {
                            $key = trim($parts[0]);
                            $val = trim(trim($parts[1]), "\"'");
                            if (!empty($key)) {
                                putenv("{$key}={$val}");
                                $_ENV[$key] = $val;
                                $_SERVER[$key] = $val;
                            }
                        }
                    }
                }
                break;
            }
        }
    }
}

// Auto-load .env on include
loadEnvFile();

function getResendApiKey() {
    loadEnvFile();
    return getenv('Resend_API_KEY') 
        ?: getenv('RESEND_API_KEY') 
        ?: ($_ENV['Resend_API_KEY'] ?? '') 
        ?: ($_ENV['RESEND_API_KEY'] ?? '')
        ?: ($_SERVER['Resend_API_KEY'] ?? '')
        ?: ($_SERVER['RESEND_API_KEY'] ?? '');
}

function getResendFromEmail() {
    loadEnvFile();
    $custom = getenv('RESEND_FROM_EMAIL') 
        ?: ($_ENV['RESEND_FROM_EMAIL'] ?? '')
        ?: ($_SERVER['RESEND_FROM_EMAIL'] ?? '');
    
    // Default sender for Resend (onboarding@resend.dev works out of the box for all accounts)
    return !empty($custom) ? $custom : 'Hotel Management & Resort Park <onboarding@resend.dev>';
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
 * Send customer registration welcome email using Resend with multi-tier fallback
 * @param string $toEmail
 * @param string $toName
 * @param array $extra [phone, loginUrl]
 * @return array
 */
function sendCustomerWelcomeEmail($toEmail, $toName, $extra = []) {
    $toName = trim($toName ?: 'Valued Guest');
    $toEmail = trim($toEmail);
    $loginUrl = $extra['loginUrl'] ?? 'http://localhost:5173/login';
    $supportEmail = 'befather7@gmail.com';
    $supportPhone = '+251 932 338 138';

    $subject = "Welcome to Grand 6-Floor Hotel & Resort Park, {$toName}!";

    // Premium HTML Template
    $htmlContent = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Grand 6-Floor Hotel & Resort Park</title>
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
    .card-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #22c55e; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
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
      <h1>Grand 6-Floor Hotel & Resort Park</h1>
      <p>Luxury Accommodation • Resort Park & Gardens • Ethiopian & International Dining</p>
    </div>

    <!-- MAIN BODY -->
    <div class="content">
      <div class="greeting">Dear {$toName},</div>
      <p class="lead">
        Welcome to the <strong>Grand 6-Floor International Hospitality Building & Resort Park</strong> guest platform! Your customer account has been successfully provisioned. We are delighted to host you for world-class hospitality, gourmet dining, and relaxing botanical gardens.
      </p>

      <!-- HIGHLIGHTS CARD -->
      <div class="card">
        <div class="card-title">✨ What You Can Experience On Our Platform</div>
        <ul class="feature-list">
          <li>🏢 <strong>6-Floor Architecture:</strong> Explore & book rooms across all six floors — from ground botanical gardens to executive suites and panoramic sky penthouse.</li>
          <li>🇪🇹 <strong>Authentic Ethiopian Food:</strong> Taste authentic culinary feasts including Doro Wat, Special Tibs, Kitfo, and traditional fasting platters (starting from 150 ETB).</li>
          <li>🍹 <strong>Refreshment & Cocktail Lounge:</strong> Enjoy craft cocktails, draft beers, natural juices, and traditional Ethiopian Arabica coffee ceremonies.</li>
          <li>💳 <strong>Easy Local & Mobile Payments:</strong> Reserve rooms and settle dining bills instantly via Telebirr, CBE Birr, Chapa, or Pay at Desk.</li>
        </ul>
      </div>

      <!-- ACCOUNT SUMMARY -->
      <div class="account-box">
        <div><strong>Registered Account:</strong> <span>{$toEmail}</span></div>
        <div><strong>Access Level:</strong> <span>Registered Hotel Guest / Customer</span></div>
        <div><strong>Platform Status:</strong> <span style="color:#10b981;">Active & Ready</span></div>
      </div>

      <!-- CTA BUTTON -->
      <div class="btn-container">
        <a href="{$loginUrl}" class="btn" target="_blank">Access Guest Portal & Book Room</a>
      </div>

      <!-- BILINGUAL AMHARIC WELCOME -->
      <div class="amharic-section">
        <strong>እንኳን ወደ ሆቴላችን በደህና መጡ!</strong><br>
        የእርስዎ የተጠቃሚ መለያ በተሳካ ሁኔታ ተፈጥሯል። በ6ቱ ፎቆች ውስጥ የሚገኙ የቅንጦት ክፍሎችን መያዝ፣ የባህላዊ እና ዓለም አቀፍ ምግቦችን ማዘዝ፣ እንዲሁም ዘመናዊ መስተንግዶ ማግኘት ይችላሉ።
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <div>System Administrator: <strong>Mulugeta Fisiha</strong></div>
      <div>Direct Inquiries: <a href="mailto:{$supportEmail}">{$supportEmail}</a> | Phone: <strong>{$supportPhone}</strong></div>
      <div style="margin-top: 8px;">&copy; 2026 Grand 6-Floor Hotel & Resort Park. All rights reserved.</div>
    </div>
  </div>
</body>
</html>
HTML;

    // Plain text fallback
    $textContent = <<<TEXT
Welcome to Grand 6-Floor Hotel & Resort Park!

Dear {$toName},

Your customer account has been successfully registered on our luxury hospitality platform.

Account Details:
- Email: {$toEmail}
- Role: Guest / Customer
- Status: Active & Ready

What you can experience:
1. 6-Floor Hospitality Architecture & Executive Suites
2. Authentic Ethiopian Traditional Food (Doro Wat, Special Tibs, Kitfo, from 150 ETB)
3. Refreshment, Cocktail & Arabica Coffee Lounge
4. Instant bookings with Telebirr, CBE Birr, and Chapa

Sign in to your guest portal:
{$loginUrl}

Bilingual Welcome:
እንኳን ወደ ታላቁ 6 ፎቅ ዓለም አቀፍ የሆቴል ህንፃ እና የሪዞርት ፓርክ በደህና መጡ!

Need assistance? Contact System Administrator Mulugeta Fisiha at {$supportEmail} or {$supportPhone}.

Grand 6-Floor Hotel & Resort Park
TEXT;

    // 1. Direct delivery via Resend
    $resendResult = sendResendEmail($toEmail, $subject, $htmlContent, $textContent);

    if (!empty($resendResult['success'])) {
        return [
            'success' => true,
            'channel' => 'resend',
            'delivered_to' => $toEmail,
            'id' => $resendResult['id'] ?? null,
            'http_code' => $resendResult['http_code'] ?? 200,
            'message' => "Welcome email sent directly to {$toEmail} via Resend."
        ];
    }

    // 2. Check for Resend Sandbox / Unverified Domain Restriction (HTTP 403 / 422)
    $errStr = is_string($resendResult['error'] ?? '') ? $resendResult['error'] : json_encode($resendResult['error'] ?? '');
    $isSandboxRestriction = (isset($resendResult['http_code']) && ($resendResult['http_code'] === 403 || $resendResult['http_code'] === 422))
        || stripos($errStr, 'testing emails') !== false
        || stripos($errStr, 'verify a domain') !== false;

    // Attempt direct SMTP fallback if configured
    if (sendSmtpEmailFallback($toEmail, $toName, $subject, $htmlContent, $textContent)) {
        return [
            'success' => true,
            'channel' => 'smtp',
            'delivered_to' => $toEmail,
            'message' => "Welcome email sent directly to {$toEmail} via SMTP fallback."
        ];
    }

    // 3. Resend Sandbox Mode: Dispatch a verified notification copy to the administrator (befather7@gmail.com)
    if ($isSandboxRestriction) {
        $dispatchSubject = "[Customer Welcome Notice] Welcome {$toName} ({$toEmail})";
        $bannerHtml = '<div style="background:#1e1b4b;border:1px solid #4338ca;color:#e0e7ff;padding:14px;border-radius:10px;margin-bottom:20px;font-size:13px;line-height:1.6;">'
            . '<div style="font-weight:bold;color:#818cf8;margin-bottom:4px;">⚠️ Resend Sandbox Mode Active</div>'
            . 'New customer <strong>' . htmlspecialchars($toName) . '</strong> registered with email <strong>' . htmlspecialchars($toEmail) . '</strong>.<br>'
            . 'Because Resend is using the default test domain (<em>onboarding@resend.dev</em>), Resend sends to the verified account owner (<strong>' . htmlspecialchars($supportEmail) . '</strong>).<br>'
            . '<span style="color:#94a3b8;">To send directly to external customer inboxes, verify a custom domain at <a href="https://resend.com/domains" style="color:#a5b4fc;text-decoration:underline;" target="_blank">resend.com/domains</a> and set <code>RESEND_FROM_EMAIL</code> in <code>backend/.env</code>.</span>'
            . '</div>';
        $dispHtml = str_replace('<div class="content">', '<div class="content">' . $bannerHtml, $htmlContent);
        $dispText = "=== RESEND SANDBOX DISPATCH ===\nNew Customer Registered: {$toName} ({$toEmail})\nDelivered to Admin: {$supportEmail}\nVerify custom domain at resend.com/domains for direct recipient dispatch.\n===============================\n\n" . $textContent;

        $dispResult = sendResendEmail($supportEmail, $dispatchSubject, $dispHtml, $dispText);
        if (!empty($dispResult['success'])) {
            return [
                'success' => true,
                'channel' => 'resend_sandbox_dispatch',
                'delivered_to' => $supportEmail,
                'customer_email' => $toEmail,
                'sandbox_mode' => true,
                'id' => $dispResult['id'] ?? null,
                'message' => "Welcome email dispatched to administrator ({$supportEmail}) in Resend sandbox mode."
            ];
        }
    }

    return $resendResult;
}

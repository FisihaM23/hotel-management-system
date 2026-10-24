<?php
// Notification Engine: Dispatches multi-channel alerts (SMS, Email, Telegram, In-App)
require_once __DIR__ . '/chapa.php';

// Normalize Ethiopian & International Phone Numbers: e.g. 0912345678 -> +251912345678
function normalizePhoneNumber($phone) {
    $phone = preg_replace('/[^\d+]/', '', trim((string)$phone));
    if (empty($phone)) return '';
    if (str_starts_with($phone, '+')) return $phone;
    if (str_starts_with($phone, '00')) return '+' . substr($phone, 2);
    if (str_starts_with($phone, '251')) return '+' . $phone;
    if (str_starts_with($phone, '0')) return '+251' . substr($phone, 1);
    return '+' . $phone;
}

// 1. Direct SMS Dispatch via SMS Gateway
function sendSMS($toPhone, $message) {
    $cleanPhone = normalizePhoneNumber($toPhone);
    if (empty($cleanPhone)) return false;

    // Check Africa's Talking SMS
    $atUsername = defined('AT_USERNAME') ? AT_USERNAME : getenv('AT_USERNAME');
    $atApiKey   = defined('AT_API_KEY') ? AT_API_KEY : getenv('AT_API_KEY');
    $atSender   = defined('AT_SENDER') ? AT_SENDER : 'HotelMS';

    if (!empty($atUsername) && !empty($atApiKey) && $atApiKey !== 'your_at_api_key') {
        $url = ($atUsername === 'sandbox')
            ? 'https://api.sandbox.africastalking.com/version1/messaging'
            : 'https://api.africastalking.com/version1/messaging';

        $data = http_build_query([
            'username' => $atUsername,
            'to'       => $cleanPhone,
            'message'  => $message,
            'from'     => $atSender,
        ]);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $data,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => [
                'Accept: application/json',
                'apiKey: ' . $atApiKey,
                'Content-Type: application/x-www-form-urlencoded',
            ],
            CURLOPT_TIMEOUT => 10,
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($httpCode === 201 || $httpCode === 200) {
            return true;
        }
    }

    // Check Generic HTTP SMS Webhook (supports local SMS gateways or GSM modems)
    $webhookUrl = defined('SMS_WEBHOOK_URL') ? SMS_WEBHOOK_URL : getenv('SMS_WEBHOOK_URL');
    if (!empty($webhookUrl)) {
        $ch = curl_init($webhookUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode(['to' => $cleanPhone, 'message' => $message]),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_TIMEOUT        => 8,
        ]);
        curl_exec($ch);
        curl_close($ch);
        return true;
    }

    return false;
}

// 2. Direct SMTP Email Dispatch (Push to Phone)
function sendEmailAlert($toEmail, $toName, $subject, $body) {
    if (empty($toEmail) || !filter_var($toEmail, FILTER_VALIDATE_EMAIL)) return false;

    $smtpUser = defined('SMTP_USER') ? SMTP_USER : getenv('SMTP_USER');
    $smtpPass = defined('SMTP_PASS') ? SMTP_PASS : getenv('SMTP_PASS');
    $smtpFrom = defined('SMTP_FROM') ? SMTP_FROM : ($smtpUser ?: 'noreply@hotel.com');
    $smtpName = defined('SMTP_NAME') ? SMTP_NAME : 'Hotel Management System';

    if (!empty($smtpUser) && !empty($smtpPass) && $smtpUser !== 'your_gmail@gmail.com') {
        $socket = @fsockopen('ssl://smtp.gmail.com', 465, $errno, $errstr, 8);
        if ($socket) {
            $r = function() use ($socket) { return fgets($socket, 515); };
            $s = function($cmd) use ($socket) { fputs($socket, $cmd . "\r\n"); };

            $r();
            $s("EHLO localhost");
            while ($line = $r()) { if (substr($line, 3, 1) === ' ') break; }
            $s("AUTH LOGIN"); $r();
            $s(base64_encode($smtpUser)); $r();
            $s(base64_encode($smtpPass));
            $resp = $r();
            if (strpos($resp, '235') !== false) {
                $s("MAIL FROM:<{$smtpFrom}>"); $r();
                $s("RCPT TO:<{$toEmail}>"); $r();
                $s("DATA"); $r();

                $msg  = "From: {$smtpName} <{$smtpFrom}>\r\n";
                $msg .= "To: {$toName} <{$toEmail}>\r\n";
                $msg .= "Subject: {$subject}\r\n";
                $msg .= "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n";
                $msg .= $body . "\r\n.\r\n";
                $s($msg); $r();
                $s("QUIT");
                fclose($socket);
                return true;
            }
            fclose($socket);
        }
    }

    // Fallback: standard PHP mail()
    $headers = "From: {$smtpName} <{$smtpFrom}>\r\n" .
               "Reply-To: {$smtpFrom}\r\n" .
               "X-Mailer: PHP/" . phpversion();
    return @mail($toEmail, $subject, $body, $headers);
}

// 3. Instant Telegram Push Notification to Phone (100% Free & Fast)
function sendTelegramAlert($message) {
    $botToken = defined('TELEGRAM_BOT_TOKEN') ? TELEGRAM_BOT_TOKEN : getenv('TELEGRAM_BOT_TOKEN');
    $chatId   = defined('TELEGRAM_CHAT_ID')   ? TELEGRAM_CHAT_ID   : getenv('TELEGRAM_CHAT_ID');

    if (empty($botToken) || empty($chatId)) return false;

    $url = "https://api.telegram.org/bot" . urlencode($botToken) . "/sendMessage";
    $payload = [
        'chat_id'    => $chatId,
        'text'       => $message,
        'parse_mode' => 'Markdown'
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 6
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    return !empty($res);
}

// 4. Master Payment Notification Dispatcher (Dispatches to Phone via SMS, Email, Telegram, and In-App)
function dispatchPaymentNotification($conn, $payment) {
    $amountFormatted = number_format((float) $payment['amount'], 2);
    $currency = defined('CHAPA_CURRENCY') ? CHAPA_CURRENCY : 'ETB';
    $bookingId = $payment['booking_id'] ?? 'N/A';
    $roomNum = $payment['room_number'] ?? 'N/A';
    $guestName = $payment['guest_name'] ?? 'Valued Guest';
    $guestPhone = $payment['guest_phone'] ?? '';
    $guestEmail = $payment['guest_email'] ?? '';
    $txRef = $payment['transaction_id'] ?? 'N/A';
    $customerId = (int)($payment['customer_id'] ?? 0);
    $payMethod = !empty($payment['method']) ? $payment['method'] : 'Chapa';

    // ── In-App Notifications for Customer ──
    $title = "Payment Received: {$currency} {$amountFormatted}";
    $guestInApp = "Your payment of {$currency} {$amountFormatted} for Booking #{$bookingId} (Room {$roomNum}) was verified. Ref: {$txRef}. Thank you!";

    if ($customerId) {
        $stmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'success')");
        $stmt->bind_param("iss", $customerId, $title, $guestInApp);
        $stmt->execute();
    }

    // ── Notify Hotel Staff: Admin receives Mobile Banking Alert, other staff workers receive Due & Room Status only ──
    $payMethodUpper = strtoupper(str_replace('_', ' ', $payMethod));
    $workerRes = $conn->query("SELECT id, role, phone, email FROM users WHERE role IN ('admin', 'manager', 'receptionist', 'housekeeping', 'maintenance') AND status = 'active'");
    if ($workerRes) {
        $adminStmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'success')");
        $workerStmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'info')");

        $adminTitle = "📱 Mobile Banking Deposit: {$currency} {$amountFormatted} ({$payMethodUpper})";
        $adminMsg = "Customer {$guestName} (" . ($guestPhone ?: 'Guest') . ") sent {$currency} {$amountFormatted} via {$payMethodUpper} directly to Admin Account (0932338138) for Room {$roomNum}. Ref: {$txRef}. Booking #{$bookingId}.";

        $workerTitle = "🚪 Room {$roomNum} is now Occupied";
        $workerMsg = "Room {$roomNum} is now OCCUPIED by {$guestName}. Status: Occupied. Booking #{$bookingId}. Staff please check room status and top-right Due tracker.";

        while ($worker = $workerRes->fetch_assoc()) {
            if ($worker['id'] != $customerId) {
                if ($worker['role'] === 'admin') {
                    $adminStmt->bind_param("iss", $worker['id'], $adminTitle, $adminMsg);
                    $adminStmt->execute();
                } else {
                    $workerStmt->bind_param("iss", $worker['id'], $workerTitle, $workerMsg);
                    $workerStmt->execute();
                }
            }
        }
    }

    // ── Phone Notification 1: SMS to Customer ──
    if (!empty($guestPhone)) {
        $customerSms = "HotelMS: Your payment of {$currency} {$amountFormatted} for Room {$roomNum} is confirmed. Booking #{$bookingId}. Ref: {$txRef}. Sent to Admin Account. Thank you!";
        sendSMS($guestPhone, $customerSms);
    }

    // ── Phone Notification 2: SMS to Admin Phone (0932338138) ──
    $adminPhone = defined('ADMIN_NOTIFICATION_PHONE') ? ADMIN_NOTIFICATION_PHONE : (getenv('ADMIN_NOTIFICATION_PHONE') ?: '0932338138');
    if (!empty($adminPhone)) {
        $adminSms = "HotelMS ADMIN MOBILE BANKING: Customer {$guestName} sent {$currency} {$amountFormatted} via {$payMethodUpper} to Admin Account for Room {$roomNum}. Ref: {$txRef}. Booking #{$bookingId}.";
        sendSMS($adminPhone, $adminSms);
    }

    // ── Phone Notification 3: Push Email to Admin & Guest (triggers lockscreen notification on phone) ──
    $adminEmail = defined('ADMIN_NOTIFICATION_EMAIL') ? ADMIN_NOTIFICATION_EMAIL : (getenv('ADMIN_NOTIFICATION_EMAIL') ?: 'befather7@gmail.com');
    $emailSubject = "Room {$roomNum} is now Occupied (Paid: {$currency} {$amountFormatted} - {$guestName})";
    $emailBody = "HOTEL MANAGEMENT SYSTEM - OCCUPANCY & PAYMENT ALERT\n"
               . "================================================\n"
               . "Status: PAID & ROOM OCCUPIED\n"
               . "Room Number: {$roomNum}\n"
               . "Amount: {$currency} {$amountFormatted}\n"
               . "Guest: {$guestName}\n"
               . "Booking ID: #{$bookingId}\n"
               . "Transaction Ref: {$txRef}\n"
               . "Gateway / Method: {$payMethod}\n"
               . "All Hotel Staff Notified: Admin, Manager, Receptionist, Housekeeping, Maintenance\n"
               . "Date: " . date('Y-m-d H:i:s') . "\n"
               . "================================================\n"
               . "Thank you for using HotelMS!";

    if (!empty($adminEmail)) {
        sendEmailAlert($adminEmail, "Hotel Operations Team", $emailSubject, $emailBody);
    }
    if (!empty($guestEmail) && $guestEmail !== $adminEmail) {
        sendEmailAlert($guestEmail, $guestName, "Payment Receipt & Booking Confirmed - Room {$roomNum} (#{$bookingId})", $emailBody);
    }

    // ── Phone Notification 4: Telegram Bot Alert (Instant Push on Smartphone) ──
    $telegramText = "🚪 *ROOM OCCUPIED ALERT*\n\n"
                  . "🏨 *Room:* `{$roomNum}` is now *OCCUPIED*\n"
                  . "💰 *Amount:* `{$currency} {$amountFormatted}`\n"
                  . "👤 *Guest:* {$guestName}\n"
                  . "📋 *Booking:* #{$bookingId}\n"
                  . "🔑 *TxRef:* `{$txRef}`\n"
                  . "⚡ *Method:* {$payMethod}\n"
                  . "⏱ *Time:* " . date('Y-m-d H:i:s');
    sendTelegramAlert($telegramText);
}

/**
 * Broadcasts to ALL hotel staff (admin, manager, receptionist, housekeeping, maintenance)
 * that a room is now OCCUPIED following a paid booking.
 */
function broadcastRoomOccupiedAlert($conn, $bookingId, $roomId, $roomNumber, $guestName, $amount, $paymentMethod, $checkIn = '', $checkOut = '', $dueAmount = 0.0) {
    $currency = defined('CHAPA_CURRENCY') ? CHAPA_CURRENCY : 'ETB';
    $amountFormatted = number_format((float) $amount, 2);
    $dueFormatted = number_format((float) $dueAmount, 2);
    $payMethodLabel = strtoupper(str_replace('_', ' ', $paymentMethod ?: 'Cash/Direct'));

    // 1. Immediately update room status to 'occupied'
    if (!empty($roomId)) {
        $upd = $conn->prepare("UPDATE rooms SET status = 'occupied' WHERE id = ?");
        $upd->bind_param("i", $roomId);
        $upd->execute();
    }

    // 2. Broadcast in-app notification to ALL hotel staff roles
    $staffRoles = "'admin', 'manager', 'receptionist', 'housekeeping', 'maintenance'";
    $staffRes = $conn->query("SELECT id, role, name, phone, email FROM users WHERE role IN ($staffRoles) AND status = 'active'");

    $dateInfo = ($checkIn && $checkOut) ? " (Stay: {$checkIn} to {$checkOut})" : "";
    if ($dueAmount > 0.01) {
        $adminTitle = "📱 Room {$roomNumber} Occupied (Paid {$currency} {$amountFormatted} • Due {$currency} {$dueFormatted})";
        $adminMsg = "Customer {$guestName} paid {$currency} {$amountFormatted} via {$payMethodLabel} directly to Admin Account for Room {$roomNumber}{$dateInfo}. Outstanding Due balance: {$currency} {$dueFormatted}. Booking #{$bookingId}.";

        $workerTitle = "🚪 Room {$roomNumber} Occupied (Due: {$currency} {$dueFormatted})";
        $workerMsg = "Room {$roomNumber} is now OCCUPIED by {$guestName}{$dateInfo}. Outstanding DUE balance: {$currency} {$dueFormatted}. Staff please check top-right Due menu to track or collect settlement.";
    } else {
        $adminTitle = "📱 Room {$roomNumber} Occupied (Paid in Full: {$currency} {$amountFormatted})";
        $adminMsg = "Customer {$guestName} paid in full {$currency} {$amountFormatted} via {$payMethodLabel} directly to Admin Account for Room {$roomNumber}{$dateInfo}. Booking #{$bookingId}.";

        $workerTitle = "🚪 Room {$roomNumber} is now Occupied";
        $workerMsg = "Room {$roomNumber} is now OCCUPIED by {$guestName}{$dateInfo}. Booking #{$bookingId}. Status: Occupied.";
    }

    if ($staffRes) {
        $adminStmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'success')");
        $workerStmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'warning')");
        while ($staff = $staffRes->fetch_assoc()) {
            if ($staff['role'] === 'admin') {
                $adminStmt->bind_param("iss", $staff['id'], $adminTitle, $adminMsg);
                $adminStmt->execute();
            } else {
                $workerStmt->bind_param("iss", $staff['id'], $workerTitle, $workerMsg);
                $workerStmt->execute();
            }
        }
    }

    // 3. Send SMS Alert to Admin / Manager Phone (0932338138)
    $adminPhone = defined('ADMIN_NOTIFICATION_PHONE') ? ADMIN_NOTIFICATION_PHONE : (getenv('ADMIN_NOTIFICATION_PHONE') ?: '0932338138');
    if (!empty($adminPhone)) {
        $dueNote = ($dueAmount > 0.01) ? " Outstanding DUE: {$currency} {$dueFormatted}." : " Paid in full.";
        $adminSms = "HotelMS OCCUPANCY ALERT: Room {$roomNumber} is now OCCUPIED by {$guestName}. Paid {$currency} {$amountFormatted} via {$payMethodLabel}.{$dueNote} Booking #{$bookingId}.";
        sendSMS($adminPhone, $adminSms);
    }

    // 4. Send Email Alert
    $adminEmail = defined('ADMIN_NOTIFICATION_EMAIL') ? ADMIN_NOTIFICATION_EMAIL : (getenv('ADMIN_NOTIFICATION_EMAIL') ?: 'befather7@gmail.com');
    if (!empty($adminEmail)) {
        $subject = "OCCUPANCY ALERT: Room {$roomNumber} is now OCCUPIED ({$guestName})";
        $body = "HOTEL MANAGEMENT OCCUPANCY ALERT\n"
              . "=================================\n"
              . "Room Number: {$roomNumber}\n"
              . "Status: OCCUPIED\n"
              . "Guest: {$guestName}\n"
              . "Booking ID: #{$bookingId}\n"
              . "Paid: {$currency} {$amountFormatted} via {$payMethodLabel}\n"
              . "Dates: {$checkIn} to {$checkOut}\n"
              . "Timestamp: " . date('Y-m-d H:i:s') . "\n"
              . "=================================\n"
              . "All hotel staff (Receptionist, Housekeeping, Maintenance, Management) have been notified.";
        sendEmailAlert($adminEmail, "Hotel Staff Operations", $subject, $body);
    }

    // 5. Telegram Alert
    $telegramText = "🚪 *ROOM OCCUPIED ALERT*\n\n"
                  . "🏨 *Room:* `{$roomNumber}` is now *OCCUPIED*\n"
                  . "👤 *Guest:* {$guestName}\n"
                  . "💰 *Paid:* `{$currency} {$amountFormatted}` ({$payMethodLabel})\n"
                  . "📋 *Booking:* #{$bookingId}\n"
                  . "📅 *Dates:* {$checkIn} to {$checkOut}\n"
                  . "⏱ *Time:* " . date('Y-m-d H:i:s');
    sendTelegramAlert($telegramText);
}

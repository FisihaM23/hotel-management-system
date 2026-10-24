<?php
// Chapa Payment Gateway & Phone Notification Configuration

// Allow overriding via custom_keys.php if present
if (file_exists(__DIR__ . '/custom_keys.php')) {
    require_once __DIR__ . '/custom_keys.php';
}

// 1. Chapa API Keys
// Set your Chapa Public Key (provided by user for client-side and hosted checkout)
if (!defined('CHAPA_PUBLIC_KEY')) {
    define('CHAPA_PUBLIC_KEY', getenv('CHAPA_PUBLIC_KEY') ?: 'CHAPA_TEST_PUB_FJxLS1GQRO2GQUq1ek4XIyoyBvYuIWE9r0QPJCjs');
}

// Set your Chapa Secret Key (from Chapa Dashboard: Settings > API & Webhooks)
if (!defined('CHAPA_SECRET_KEY')) {
    define('CHAPA_SECRET_KEY', getenv('CHAPA_SECRET_KEY') ?: '');
}

// Optional Chapa Webhook Secret for signature validation
if (!defined('CHAPA_WEBHOOK_SECRET')) {
    define('CHAPA_WEBHOOK_SECRET', getenv('CHAPA_WEBHOOK_SECRET') ?: '');
}

// Currency (Ethiopian Birr: ETB)
if (!defined('CHAPA_CURRENCY')) {
    define('CHAPA_CURRENCY', 'ETB');
}

// Chapa API Endpoints
if (!defined('CHAPA_BASE_URL')) {
    define('CHAPA_BASE_URL', 'https://api.chapa.co/v1');
}

if (!defined('FRONTEND_URL')) {
    define('FRONTEND_URL', 'http://localhost:5173');
}

// 2. Phone Alert Destinations (receives SMS / Call / Telegram when customer pays)
if (!defined('ADMIN_NOTIFICATION_PHONE')) {
    define('ADMIN_NOTIFICATION_PHONE', getenv('ADMIN_NOTIFICATION_PHONE') ?: '');
}

if (!defined('ADMIN_NOTIFICATION_EMAIL')) {
    define('ADMIN_NOTIFICATION_EMAIL', getenv('ADMIN_NOTIFICATION_EMAIL') ?: 'befather7@gmail.com');
}

// 3. SMS Gateway Settings (Africa's Talking / Twilio / Custom Webhook)
if (!defined('AT_USERNAME')) {
    define('AT_USERNAME', getenv('AT_USERNAME') ?: 'sandbox');
}
if (!defined('AT_API_KEY')) {
    define('AT_API_KEY', getenv('AT_API_KEY') ?: 'your_at_api_key');
}
if (!defined('AT_SENDER')) {
    define('AT_SENDER', getenv('AT_SENDER') ?: 'HotelMS');
}

// 4. Telegram Bot (Instant smartphone push notification)
if (!defined('TELEGRAM_BOT_TOKEN')) {
    define('TELEGRAM_BOT_TOKEN', getenv('TELEGRAM_BOT_TOKEN') ?: '');
}
if (!defined('TELEGRAM_CHAT_ID')) {
    define('TELEGRAM_CHAT_ID', getenv('TELEGRAM_CHAT_ID') ?: '');
}

// 5. Gmail SMTP for instant push email alerts to smartphone
if (!defined('SMTP_USER')) {
    define('SMTP_USER', getenv('SMTP_USER') ?: 'befather7@gmail.com');
}
if (!defined('SMTP_PASS')) {
    define('SMTP_PASS', getenv('SMTP_PASS') ?: '');
}
if (!defined('SMTP_FROM')) {
    define('SMTP_FROM', getenv('SMTP_FROM') ?: 'befather7@gmail.com');
}
if (!defined('SMTP_NAME')) {
    define('SMTP_NAME', 'Hotel Management System');
}

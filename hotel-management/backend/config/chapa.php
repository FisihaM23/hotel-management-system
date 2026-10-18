<?php
// Chapa Payment Gateway Configuration

// Default Chapa test secret key (can be overridden by environment variable or replaced with your actual Chapa secret key from dashboard.chapa.co)
if (!defined('CHAPA_SECRET_KEY')) {
    define('CHAPA_SECRET_KEY', getenv('CHAPA_SECRET_KEY') ?: 'CHASECK_TEST-sample_test_key_for_hotel_mgmt');
}

// Chapa Webhook Secret (optional hash validation)
if (!defined('CHAPA_WEBHOOK_SECRET')) {
    define('CHAPA_WEBHOOK_SECRET', getenv('CHAPA_WEBHOOK_SECRET') ?: '');
}

// Default currency for payments (ETB or USD)
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

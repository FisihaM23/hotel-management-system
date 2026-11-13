<?php
// Protected Web-Accessible Database Setup & Migration Entry Point
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/helpers.php';
require_once __DIR__ . '/config/auth_middleware.php';

// Security check: Must provide INSTALLER_TOKEN via header/param OR be authenticated as admin
$installerToken = getenv('INSTALLER_TOKEN') ?: ($_ENV['INSTALLER_TOKEN'] ?? ($_SERVER['INSTALLER_TOKEN'] ?? ''));
$providedToken = $_SERVER['HTTP_X_INSTALLER_TOKEN'] ?? ($_GET['token'] ?? '');

$authorized = false;

// 1. Check strong installer token if configured
if (!empty($installerToken) && !empty($providedToken) && hash_equals($installerToken, $providedToken)) {
    $authorized = true;
}

// 2. Or allow active authenticated administrator
if (!$authorized) {
    $auth = getAuthorizationHeader();
    if ($auth && str_starts_with($auth, 'Bearer ')) {
        try {
            $user = authenticate(['admin']);
            if ($user && $user['role'] === 'admin') {
                $authorized = true;
            }
        } catch (\Throwable $e) {
            $authorized = false;
        }
    }
}

// 3. Or allow CLI execution
if (PHP_SAPI === 'cli') {
    $authorized = true;
}

if (!$authorized) {
    http_response_code(403);
    echo json_encode([
        'status' => 'error',
        'error'  => 'Forbidden: Database setup is protected. Please provide a valid X-Installer-Token or authenticate as an Administrator.'
    ]);
    exit;
}

// Forward execution to the safe maintenance script outside the web root
define('IN_PROTECTED_INSTALLER', true);
require __DIR__ . '/scripts/setup_db.php';

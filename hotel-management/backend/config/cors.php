<?php
// Centralized CORS Configuration for Hotel Management System

if (!function_exists('loadCorsEnv')) {
    function loadCorsEnv(): void {
        static $loaded = false;
        if ($loaded) {
            return;
        }
        $loaded = true;

        $candidatePaths = [
            dirname(__DIR__) . '/.env',
            'c:/Hotel managment/hotel-management/backend/.env',
            dirname(__DIR__, 2) . '/backend/.env',
            'C:/wamp64/www/hotel-management/backend/.env',
            dirname(__DIR__, 2) . '/.env',
        ];

        foreach ($candidatePaths as $path) {
            if (file_exists($path)) {
                $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                if ($lines !== false) {
                    foreach ($lines as $line) {
                        $line = trim($line);
                        if (empty($line) || str_starts_with($line, '#')) {
                            continue;
                        }
                        $parts = explode('=', $line, 2);
                        if (count($parts) === 2) {
                            $key = trim($parts[0]);
                            $val = trim(trim($parts[1]), "\"' \t\n\r\0\x0B");
                            if ($key !== '' && getenv($key) === false) {
                                putenv("{$key}={$val}");
                                $_ENV[$key] = $val;
                                $_SERVER[$key] = $val;
                            }
                        }
                    }
                    break;
                }
            }
        }
    }
}

loadCorsEnv();

/**
 * Retrieve the canonical list of trusted frontend origins from environment or defaults.
 */
function getCorsAllowedOrigins(): array {
    $rawEnv = getenv('CORS_ALLOWED_ORIGINS')
        ?: ($_ENV['CORS_ALLOWED_ORIGINS'] ?? ($_SERVER['CORS_ALLOWED_ORIGINS'] ?? ''));

    $origins = [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'http://localhost',
        'http://127.0.0.1',
    ];

    $appUrl = getenv('APP_URL') ?: ($_ENV['APP_URL'] ?? ($_SERVER['APP_URL'] ?? ''));
    if ($appUrl) {
        $origins[] = rtrim($appUrl, '/');
    }
    $frontendUrl = getenv('FRONTEND_URL') ?: ($_ENV['FRONTEND_URL'] ?? ($_SERVER['FRONTEND_URL'] ?? ''));
    if ($frontendUrl) {
        $origins[] = rtrim($frontendUrl, '/');
    }

    if (!empty($rawEnv)) {
        $items = array_map('trim', explode(',', $rawEnv));
        foreach ($items as $item) {
            if ($item !== '') {
                $origins[] = rtrim($item, '/');
            }
        }
    }

    return array_values(array_unique(array_filter($origins)));
}

/**
 * Check if a given origin is allowed under the explicit allowlist or approved local dev regex.
 */
function isCorsOriginAllowed(string $origin, array $allowedList): bool {
    if (empty($origin)) {
        return false;
    }

    $normalized = rtrim(strtolower($origin), '/');
    foreach ($allowedList as $allowed) {
        if (rtrim(strtolower($allowed), '/') === $normalized) {
            return true;
        }
    }

    // Support standard local development hosts on any valid port
    if (preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#i', $origin)) {
        return true;
    }

    return false;
}

$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = getCorsAllowedOrigins();
$isAllowed = isCorsOriginAllowed($requestOrigin, $allowedOrigins);

if ($requestOrigin !== '') {
    if ($isAllowed) {
        // Return the exact approved origin; credentials must NEVER be combined with wildcard
        header("Access-Control-Allow-Origin: {$requestOrigin}");
        header('Access-Control-Allow-Credentials: true');
        header('Vary: Origin');
    } else {
        // Unauthorized external origin: DO NOT reflect origin and DO NOT send wildcard
        // Origin is denied CORS access
        header('Vary: Origin');
    }
}

header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Chapa-Signature, X-HTTP-Method-Override');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    if ($requestOrigin !== '' && !$isAllowed) {
        http_response_code(403);
        echo json_encode(['error' => 'Origin not allowed by CORS policy']);
        exit;
    }
    http_response_code(200);
    exit;
}

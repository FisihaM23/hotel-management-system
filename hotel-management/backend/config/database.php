<?php
date_default_timezone_set('Africa/Addis_Ababa');

// Load environment variables if available
if (!function_exists('loadEnvDatabaseConfig')) {
    function loadEnvDatabaseConfig(): void {
        static $loaded = false;
        if ($loaded) return;
        $loaded = true;
        $candidatePaths = [
            dirname(__DIR__) . '/.env',
            'c:/Hotel managment/hotel-management/backend/.env',
            dirname(__DIR__, 2) . '/backend/.env',
            dirname(__DIR__, 2) . '/.env',
        ];
        foreach ($candidatePaths as $path) {
            if (file_exists($path)) {
                $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                if ($lines !== false) {
                    foreach ($lines as $line) {
                        $line = trim($line);
                        if (empty($line) || str_starts_with($line, '#')) continue;
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
loadEnvDatabaseConfig();
if (!defined('DB_HOST')) {
    define('DB_HOST', getenv('DB_HOST') ?: '127.0.0.1');
}
if (!defined('DB_USER')) {
    define('DB_USER', getenv('DB_USER') ?: 'root');
}
if (!defined('DB_PASS')) {
    define('DB_PASS', getenv('DB_PASS') !== false ? getenv('DB_PASS') : '');
}
if (!defined('DB_NAME')) {
    define('DB_NAME', getenv('DB_NAME') ?: 'hotel_management');
}
if (!defined('DB_PORT')) {
    define('DB_PORT', (int) (getenv('DB_PORT') ?: 3307));
}

function getConnection(): mysqli {
    mysqli_report(MYSQLI_REPORT_OFF);

    // Primary connection using configured port
    $conn = @new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
    if ($conn->connect_error && DB_PORT !== 3306) {
        // Fallback to 3306 only if primary port fails
        $conn = @new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, 3306);
    }

    if ($conn->connect_error) {
        // Production safety: Log exact connection error internally, never expose credentials or SQL error to client
        error_log('[Database Error] Connection failed: ' . $conn->connect_error);
        http_response_code(500);
        die(json_encode(['error' => 'Database connection unavailable. Please contact the administrator.']));
    }

    $conn->set_charset('utf8mb4');
    $conn->query("SET time_zone = '+03:00'");
    return $conn;
}

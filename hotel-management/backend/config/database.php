<?php
define('DB_HOST', '127.0.0.1');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'hotel_management');
define('DB_PORT', 3307);

function getConnection() {
    mysqli_report(MYSQLI_REPORT_OFF);
    // Connect directly to active WAMP MariaDB port 3307 (0ms delay)
    $conn = @new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
    if ($conn->connect_error) {
        // Fallback to 3306 only if 3307 fails
        $conn = @new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, 3306);
    }
    if ($conn->connect_error) {
        http_response_code(500);
        die(json_encode(['error' => 'DB connection failed: ' . $conn->connect_error]));
    }
    $conn->set_charset('utf8mb4');
    return $conn;
}

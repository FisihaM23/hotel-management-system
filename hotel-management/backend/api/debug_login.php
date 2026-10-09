<?php
// Debug file - DELETE after fixing
require_once '../config/cors.php';

$host = 'localhost'; $user = 'root'; $pass = ''; $db = 'hotel_management';
$conn = new mysqli($host, $user, $pass, $db);

if ($conn->connect_error) {
    die(json_encode(['step' => 'DB_CONNECT', 'error' => $conn->connect_error]));
}

// Check user exists
$stmt = $conn->prepare("SELECT id, email, password, status FROM users WHERE email = 'admin@hotel.com'");
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();

if (!$row) {
    // Try to list all users
    $all = $conn->query("SELECT id, email, role, status FROM users")->fetch_all(MYSQLI_ASSOC);
    die(json_encode(['step' => 'USER_NOT_FOUND', 'all_users' => $all]));
}

$hash = $row['password'];
$verify = password_verify('password123', $hash);

// Also test fresh hash
$fresh = password_hash('password123', PASSWORD_BCRYPT);
$freshVerify = password_verify('password123', $fresh);

echo json_encode([
    'step'          => 'COMPLETE',
    'user_found'    => true,
    'status'        => $row['status'],
    'hash_length'   => strlen($hash),
    'hash_prefix'   => substr($hash, 0, 7),
    'verify_result' => $verify ? 'PASS' : 'FAIL',
    'fresh_hash_verify' => $freshVerify ? 'PASS' : 'FAIL',
    'php_version'   => PHP_VERSION,
    'action_needed' => $verify ? 'NONE - login should work' : 'HASH_MISMATCH - need to reset password'
], JSON_PRETTY_PRINT);

$conn->close();

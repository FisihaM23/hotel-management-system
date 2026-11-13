<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/helpers.php';
require_once '../config/auth_middleware.php';

// Public status check: Never disclose table names, row counts, database names, credentials or topology.
// Detailed diagnostics are strictly restricted to authenticated administrators.

$auth = getAuthorizationHeader();
$isAdmin = false;
if (PHP_SAPI === 'cli') {
    $isAdmin = true;
} elseif ($auth && str_starts_with($auth, 'Bearer ')) {
    try {
        $user = authenticate([]);
        if ($user && ($user['role'] ?? '') === 'admin') {
            $isAdmin = true;
        }
    } catch (\Throwable $e) {
        $isAdmin = false;
    }
}

try {
    $conn = getConnection();
    $pingOk = $conn->ping();
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Service temporarily unavailable']);
    exit;
}

if (!$isAdmin) {
    // Public response: minimal, non-disclosing health check
    json_ok([
        'status'  => 'success',
        'message' => 'Service healthy'
    ]);
    $conn->close();
    exit;
}

// Administrator response: detailed diagnostic information
$tables = [];
$result = $conn->query('SHOW TABLES');
if ($result) {
    while ($row = $result->fetch_array()) {
        $t = $row[0];
        $countResult = $conn->query("SELECT COUNT(*) as c FROM `$t`");
        $c = $countResult ? $countResult->fetch_assoc()['c'] : 0;
        $tables[$t] = (int) $c . ' records';
    }
}
json_ok(['status' => 'success', 'message' => 'Connected', 'database' => DB_NAME, 'tables' => $tables]);
$conn->close();

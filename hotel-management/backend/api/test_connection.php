<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/helpers.php';

$conn = getConnection();
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

<?php
require_once '../config/cors.php';
require_once '../config/database.php';

$conn = getConnection();
$tables = [];
$result = $conn->query("SHOW TABLES");
while ($row = $result->fetch_array()) {
    $t = $row[0];
    $c = $conn->query("SELECT COUNT(*) as c FROM `$t`")->fetch_assoc()['c'];
    $tables[$t] = (int)$c . ' records';
}
echo json_encode(['status' => 'success', 'message' => 'Connected', 'database' => DB_NAME, 'tables' => $tables]);
$conn->close();

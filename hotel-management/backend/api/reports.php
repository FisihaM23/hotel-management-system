<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

authenticate(['admin', 'manager']);
$conn = getConnection();

$type = $_GET['type'] ?? 'revenue';
$from = $_GET['from'] ?? date('Y-m-01');
$to = $_GET['to'] ?? date('Y-m-d');

$response = ['summary' => [], 'rows' => []];

if ($type === 'revenue') {
    $stmt = $conn->prepare("SELECT COALESCE(SUM(amount),0) as total_revenue, COUNT(*) as total_payments, COALESCE(AVG(amount),0) as avg_payment
        FROM payments WHERE status = 'completed' AND DATE(paid_at) BETWEEN ? AND ?");
    $stmt->bind_param('ss', $from, $to);
    $stmt->execute();
    $response['summary'] = $stmt->get_result()->fetch_assoc();

    $stmt = $conn->prepare("SELECT DATE(paid_at) as date, COUNT(*) as payments, SUM(amount) as revenue
        FROM payments WHERE status = 'completed' AND DATE(paid_at) BETWEEN ? AND ? GROUP BY DATE(paid_at) ORDER BY date");
    $stmt->bind_param('ss', $from, $to);
    $stmt->execute();
    $response['rows'] = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

} elseif ($type === 'bookings') {
    $stmt = $conn->prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) as confirmed, SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled, SUM(CASE WHEN status='checked_out' THEN 1 ELSE 0 END) as checked_out FROM bookings WHERE check_in BETWEEN ? AND ?");
    $stmt->bind_param('ss', $from, $to);
    $stmt->execute();
    $response['summary'] = $stmt->get_result()->fetch_assoc();

    $stmt = $conn->prepare("SELECT b.id, u.name as guest, r.room_number, b.check_in, b.check_out, b.total_amount, b.status FROM bookings b JOIN users u ON b.customer_id=u.id JOIN rooms r ON b.room_id=r.id WHERE b.check_in BETWEEN ? AND ? ORDER BY b.check_in");
    $stmt->bind_param('ss', $from, $to);
    $stmt->execute();
    $response['rows'] = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

} elseif ($type === 'occupancy') {
    $result = $conn->query("SELECT COUNT(*) as total_rooms FROM rooms");
    $total = (int) $result->fetch_assoc()['total_rooms'];
    $days = max(1, (int) ((strtotime($to) - strtotime($from)) / 86400) + 1);
    $inventoryNights = $total * $days;
    $toExclusive = date('Y-m-d', strtotime($to . ' +1 day'));
    $stmt = $conn->prepare("SELECT COALESCE(SUM(GREATEST(0, DATEDIFF(LEAST(check_out, ?), GREATEST(check_in, ?)))), 0) as room_nights
        FROM bookings
        WHERE status IN ('confirmed','checked_in','checked_out')
          AND check_in < ? AND check_out > ?");
    $stmt->bind_param('ssss', $toExclusive, $from, $toExclusive, $from);
    $stmt->execute();
    $roomNights = (float) $stmt->get_result()->fetch_assoc()['room_nights'];
    $rate = $inventoryNights > 0 ? round(($roomNights / $inventoryNights) * 100, 1) : 0;
    $response['summary'] = [
        'total_rooms' => $total,
        'period_days' => $days,
        'room_nights' => $roomNights,
        'occupancy_rate' => $rate . '%',
    ];

    $stmt = $conn->prepare("SELECT r.room_number, r.type, r.status, COUNT(b.id) as total_bookings FROM rooms r LEFT JOIN bookings b ON r.id=b.room_id AND b.check_in BETWEEN ? AND ? AND b.status != 'cancelled' GROUP BY r.id ORDER BY r.room_number");
    $stmt->bind_param('ss', $from, $to);
    $stmt->execute();
    $response['rows'] = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
}

json_ok($response);
$conn->close();

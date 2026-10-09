<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$authUser = authenticate();
$conn = getConnection();
$stats = [];

// Room stats
$result = $conn->query("SELECT status, COUNT(*) as count FROM rooms GROUP BY status");
$roomStats = ['available'=>0,'occupied'=>0,'cleaning'=>0,'maintenance'=>0];
while ($row = $result->fetch_assoc()) $roomStats[$row['status']] = (int)$row['count'];
$stats['rooms'] = $roomStats;
$stats['total_rooms'] = array_sum($roomStats);

// Booking stats
$result = $conn->query("SELECT status, COUNT(*) as count FROM bookings GROUP BY status");
$bookingStats = [];
while ($row = $result->fetch_assoc()) $bookingStats[$row['status']] = (int)$row['count'];
$stats['bookings'] = $bookingStats;

// Revenue this month
$result = $conn->query("SELECT COALESCE(SUM(total_amount),0) as revenue FROM bookings WHERE MONTH(created_at)=MONTH(NOW()) AND YEAR(created_at)=YEAR(NOW()) AND status != 'cancelled'");
$stats['monthly_revenue'] = (float)$result->fetch_assoc()['revenue'];

// Total guests
$result = $conn->query("SELECT COUNT(*) as count FROM users WHERE role='customer'");
$stats['total_guests'] = (int)$result->fetch_assoc()['count'];

// Housekeeping stats
$result = $conn->query("SELECT status, COUNT(*) as count FROM housekeeping_tasks GROUP BY status");
$hkStats = [];
while ($row = $result->fetch_assoc()) $hkStats[$row['status']] = (int)$row['count'];
$stats['housekeeping'] = $hkStats;

// Maintenance stats
$result = $conn->query("SELECT status, COUNT(*) as count FROM maintenance_requests GROUP BY status");
$mStats = [];
while ($row = $result->fetch_assoc()) $mStats[$row['status']] = (int)$row['count'];
$stats['maintenance'] = $mStats;

// Recent bookings
$result = $conn->query("SELECT b.id, b.check_in, b.check_out, b.status, b.total_amount, u.name as guest_name, r.room_number
    FROM bookings b JOIN users u ON b.customer_id=u.id JOIN rooms r ON b.room_id=r.id
    ORDER BY b.created_at DESC LIMIT 5");
$stats['recent_bookings'] = $result->fetch_all(MYSQLI_ASSOC);

echo json_encode($stats);
$conn->close();

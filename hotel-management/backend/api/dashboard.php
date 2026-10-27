<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$authUser = authenticate(['admin', 'manager', 'receptionist', 'housekeeping', 'maintenance']);
$conn = getConnection();
$stats = [];

function withDefaults(array $defaults, array $counts) {
    return array_merge($defaults, array_intersect_key($counts, $defaults));
}

// Auto-heal: Ensure rooms marked 'occupied' return to 'available' if all bookings were deleted or completed
$conn->query("UPDATE rooms r 
    SET r.status = 'available' 
    WHERE r.status = 'occupied' 
    AND NOT EXISTS (
        SELECT 1 FROM bookings b 
        WHERE b.room_id = r.id 
        AND b.status IN ('checked_in', 'confirmed') 
        AND b.check_out >= CURDATE()
    )");

$roomStats = [];
$result = $conn->query("SELECT status, COUNT(*) as count FROM rooms GROUP BY status");
while ($result && $row = $result->fetch_assoc()) $roomStats[$row['status']] = (int) $row['count'];
$roomStats = withDefaults(['available' => 0, 'occupied' => 0, 'cleaning' => 0, 'maintenance' => 0], $roomStats);
$stats['rooms'] = $roomStats;
$stats['total_rooms'] = array_sum($roomStats);
$stats['occupancy_rate'] = $stats['total_rooms'] > 0
    ? (int) round(($roomStats['occupied'] / $stats['total_rooms']) * 100)
    : 0;

$roomTypes = [];
$result = $conn->query("SELECT type, COUNT(*) AS total, SUM(status = 'available') AS available, AVG(price_per_night) AS avg_price
    FROM rooms GROUP BY type ORDER BY avg_price ASC");
while ($result && $row = $result->fetch_assoc()) {
    $roomTypes[] = [
        'type' => $row['type'],
        'label' => ucfirst($row['type']),
        'total' => (int) $row['total'],
        'available' => (int) $row['available'],
        'avg_price' => round((float) $row['avg_price'], 2),
    ];
}
$stats['room_types'] = $roomTypes;

$bookingStats = [];
$result = $conn->query("SELECT status, COUNT(*) as count FROM bookings GROUP BY status");
while ($result && $row = $result->fetch_assoc()) $bookingStats[$row['status']] = (int) $row['count'];
$bookingStats = withDefaults([
    'pending' => 0, 'confirmed' => 0, 'checked_in' => 0, 'checked_out' => 0, 'cancelled' => 0,
], $bookingStats);
$stats['bookings'] = $bookingStats;
$stats['total_bookings'] = array_sum($bookingStats);
$stats['active_bookings'] = $bookingStats['confirmed'] + $bookingStats['checked_in'];

$result = $conn->query("SELECT COUNT(*) as count FROM bookings WHERE check_in = CURDATE() AND status IN ('pending','confirmed')");
$stats['arrivals_today'] = (int) $result->fetch_assoc()['count'];
$result = $conn->query("SELECT COUNT(*) as count FROM bookings WHERE check_out = CURDATE() AND status = 'checked_in'");
$stats['departures_today'] = (int) $result->fetch_assoc()['count'];
$result = $conn->query("SELECT COUNT(*) as count FROM bookings WHERE check_in > CURDATE() AND status IN ('pending','confirmed')");
$stats['upcoming_arrivals'] = (int) $result->fetch_assoc()['count'];
$result = $conn->query("SELECT COALESCE(SUM(b.adults + b.children), 0) as count FROM bookings b WHERE b.status = 'checked_in'");
$stats['in_house_guests'] = (int) $result->fetch_assoc()['count'];

$result = $conn->query("SELECT COALESCE(SUM(amount),0) as revenue FROM payments
    WHERE status = 'completed' AND MONTH(paid_at)=MONTH(NOW()) AND YEAR(paid_at)=YEAR(NOW())");
$stats['monthly_revenue'] = (float) $result->fetch_assoc()['revenue'];

$result = $conn->query("SELECT COALESCE(SUM(amount),0) as revenue FROM payments
    WHERE status = 'completed' AND DATE(paid_at) = CURDATE()");
$stats['revenue_today'] = (float) $result->fetch_assoc()['revenue'];

$revenueByDay = [];
$result = $conn->query("SELECT DATE(paid_at) as day, SUM(amount) as total FROM payments
    WHERE status = 'completed' AND paid_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
    GROUP BY DATE(paid_at)");
while ($result && $row = $result->fetch_assoc()) $revenueByDay[$row['day']] = (float) $row['total'];

$revenueSeries = [];
for ($i = 6; $i >= 0; $i--) {
    $day = date('Y-m-d', strtotime("-$i day"));
    $revenueSeries[] = [
        'date' => $day,
        'label' => date('D', strtotime($day)),
        'total' => $revenueByDay[$day] ?? 0.0,
    ];
}
$stats['revenue_series'] = $revenueSeries;

$result = $conn->query("SELECT COALESCE(SUM(b.total_amount), 0) - COALESCE(SUM(p.paid), 0) as outstanding
    FROM bookings b
    LEFT JOIN (SELECT booking_id, SUM(amount) as paid FROM payments WHERE status = 'completed' GROUP BY booking_id) p
        ON p.booking_id = b.id
    WHERE b.status != 'cancelled'");
$stats['outstanding_balance'] = max(0, (float) $result->fetch_assoc()['outstanding']);

$result = $conn->query("SELECT COUNT(*) as count FROM users WHERE role='customer'");
$stats['total_guests'] = (int) $result->fetch_assoc()['count'];

$hkStats = [];
$result = $conn->query("SELECT status, COUNT(*) as count FROM housekeeping_tasks GROUP BY status");
while ($result && $row = $result->fetch_assoc()) $hkStats[$row['status']] = (int) $row['count'];
$stats['housekeeping'] = withDefaults([
    'pending' => 0, 'in_progress' => 0, 'completed' => 0, 'skipped' => 0,
], $hkStats);
$result = $conn->query("SELECT COUNT(*) as count FROM housekeeping_tasks WHERE status = 'completed' AND DATE(completed_at) = CURDATE()");
$stats['housekeeping']['completed_today'] = (int) $result->fetch_assoc()['count'];

$mStats = [];
$result = $conn->query("SELECT status, COUNT(*) as count FROM maintenance_requests GROUP BY status");
while ($result && $row = $result->fetch_assoc()) $mStats[$row['status']] = (int) $row['count'];
$stats['maintenance'] = withDefaults([
    'open' => 0, 'assigned' => 0, 'in_progress' => 0, 'resolved' => 0, 'closed' => 0,
], $mStats);
$result = $conn->query("SELECT COUNT(*) as count FROM maintenance_requests
    WHERE status NOT IN ('resolved','closed') AND priority IN ('high','urgent')");
$stats['maintenance']['urgent_open'] = (int) $result->fetch_assoc()['count'];

$result = $conn->query("SELECT COUNT(*) as count FROM users
    WHERE role IN ('admin','manager','receptionist','housekeeping','maintenance') AND status = 'active'");
$stats['active_staff'] = (int) $result->fetch_assoc()['count'];

$result = $conn->query("SELECT b.id, b.check_in, b.check_out, b.status, b.total_amount, b.created_at,
        u.name as guest_name, u.email as guest_email, r.room_number, r.type as room_type
    FROM bookings b
    JOIN users u ON b.customer_id = u.id
    JOIN rooms r ON b.room_id = r.id
    ORDER BY b.created_at DESC LIMIT 6");
$stats['recent_bookings'] = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];

$stats['users'] = [];
if ($authUser['role'] === 'admin') {
    $usersRes = $conn->query("SELECT id, name, email, role, phone, status FROM users
        WHERE role != 'customer'
        ORDER BY FIELD(role, 'admin', 'manager', 'receptionist', 'housekeeping', 'maintenance'), name ASC LIMIT 12");
    $stats['users'] = $usersRes ? $usersRes->fetch_all(MYSQLI_ASSOC) : [];
}

echo json_encode([
    'generated_at' => date('c'),
    'server_date' => date('Y-m-d'),
] + $stats);

$conn->close();

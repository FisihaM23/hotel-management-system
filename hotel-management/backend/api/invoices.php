<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;

switch ($method) {
    case 'GET':
        $user = authenticate(['admin','manager','receptionist','customer']);
        if ($id) {
            $stmt = $conn->prepare("
                SELECT i.*, b.check_in, b.check_out, b.adults, b.children,
                       b.special_requests, b.status as booking_status,
                       u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
                       r.room_number, r.type as room_type, r.price_per_night,
                       p.method as payment_method, p.transaction_id, p.paid_at
                FROM invoices i
                JOIN bookings b ON i.booking_id = b.id
                JOIN users u ON b.customer_id = u.id
                JOIN rooms r ON b.room_id = r.id
                LEFT JOIN payments p ON p.booking_id = b.id AND p.status = 'completed'
                WHERE i.id = ?
            ");
            $stmt->bind_param("i", $id);
            $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_assoc());
        } else {
            if ($user['role'] === 'customer') {
                $stmt = $conn->prepare("
                    SELECT i.*, r.room_number, b.check_in, b.check_out
                    FROM invoices i
                    JOIN bookings b ON i.booking_id = b.id
                    JOIN rooms r ON b.room_id = r.id
                    WHERE b.customer_id = ?
                    ORDER BY i.created_at DESC
                ");
                $stmt->bind_param("i", $user['id']);
                $stmt->execute();
            } else {
                $stmt = $conn->prepare("
                    SELECT i.*, u.name as customer_name, r.room_number, b.check_in, b.check_out
                    FROM invoices i
                    JOIN bookings b ON i.booking_id = b.id
                    JOIN users u ON b.customer_id = u.id
                    JOIN rooms r ON b.room_id = r.id
                    ORDER BY i.created_at DESC
                ");
                $stmt->execute();
            }
            echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        }
        break;

    case 'POST':
        $user = authenticate(['admin','manager','receptionist']);
        $data = json_decode(file_get_contents('php://input'), true);
        $inv_number = 'INV-' . date('Y') . '-' . strtoupper(uniqid());
        $tax = ($data['subtotal'] ?? 0) * 0.10;
        $total = ($data['subtotal'] ?? 0) + $tax - ($data['discount'] ?? 0);
        $due = $data['due_date'] ?? date('Y-m-d', strtotime('+7 days'));
        $stmt = $conn->prepare("INSERT INTO invoices (booking_id, invoice_number, subtotal, tax, discount, total, status, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param("isddddss", $data['booking_id'], $inv_number, $data['subtotal'], $tax, $data['discount'], $total, $data['status'], $due);
        if ($stmt->execute()) {
            echo json_encode(['id' => $conn->insert_id, 'invoice_number' => $inv_number, 'total' => $total]);
        } else {
            http_response_code(400); echo json_encode(['error' => $conn->error]);
        }
        break;
}
$conn->close();

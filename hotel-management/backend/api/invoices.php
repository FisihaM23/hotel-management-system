<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;

$paymentJoin = "LEFT JOIN (
    SELECT p1.booking_id, p1.method, p1.transaction_id, p1.paid_at
    FROM payments p1
    INNER JOIN (
        SELECT booking_id, MAX(id) AS mid FROM payments WHERE status = 'completed' GROUP BY booking_id
    ) latest ON latest.mid = p1.id
) p ON p.booking_id = b.id";

switch ($method) {
    case 'GET':
        $user = authenticate(['admin', 'manager', 'receptionist', 'customer']);
        if ($id) {
            $sql = "SELECT i.*, b.check_in, b.check_out, b.adults, b.children,
                       b.special_requests, b.status as booking_status,
                       u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
                       r.room_number, r.type as room_type, r.price_per_night,
                       p.method as payment_method, p.transaction_id, p.paid_at
                FROM invoices i
                JOIN bookings b ON i.booking_id = b.id
                JOIN users u ON b.customer_id = u.id
                JOIN rooms r ON b.room_id = r.id
                $paymentJoin
                WHERE i.id = ?";
            if ($user['role'] === 'customer') {
                $sql .= " AND b.customer_id = ?";
                $stmt = $conn->prepare($sql);
                $stmt->bind_param('ii', $id, $user['id']);
            } else {
                $stmt = $conn->prepare($sql);
                $stmt->bind_param('i', $id);
            }
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            if (!$row) {
                json_fail(404, 'Invoice not found');
            }
            json_ok($row);
        } else {
            if ($user['role'] === 'customer') {
                $stmt = $conn->prepare("
                    SELECT i.*, u.name as guest_name, r.room_number, b.check_in, b.check_out
                    FROM invoices i
                    JOIN bookings b ON i.booking_id = b.id
                    JOIN users u ON b.customer_id = u.id
                    JOIN rooms r ON b.room_id = r.id
                    WHERE b.customer_id = ?
                    ORDER BY i.created_at DESC
                ");
                $stmt->bind_param('i', $user['id']);
                $stmt->execute();
            } else {
                $stmt = $conn->prepare("
                    SELECT i.*, u.name as customer_name, u.name as guest_name, r.room_number, b.check_in, b.check_out
                    FROM invoices i
                    JOIN bookings b ON i.booking_id = b.id
                    JOIN users u ON b.customer_id = u.id
                    JOIN rooms r ON b.room_id = r.id
                    ORDER BY i.created_at DESC
                ");
                $stmt->execute();
            }
            json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        }
        break;

    case 'POST':
        authenticate(['admin', 'manager', 'receptionist']);
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $bookingId = (int) ($data['booking_id'] ?? 0);
        if (!$bookingId) {
            json_fail(400, 'Booking is required');
        }
        $booking = $conn->prepare("SELECT total_amount FROM bookings WHERE id = ?");
        $booking->bind_param('i', $bookingId);
        $booking->execute();
        $brow = $booking->get_result()->fetch_assoc();
        if (!$brow) {
            json_fail(400, 'Booking not found');
        }
        $exists = $conn->prepare("SELECT id FROM invoices WHERE booking_id = ?");
        $exists->bind_param('i', $bookingId);
        $exists->execute();
        if ($exists->get_result()->fetch_assoc()) {
            json_fail(400, 'An invoice already exists for this booking');
        }
        $subtotal = isset($data['subtotal']) ? (float) $data['subtotal'] : (float) $brow['total_amount'];
        $discount = (float) ($data['discount'] ?? 0);
        $tax = $subtotal * 0.10;
        $total = $subtotal + $tax - $discount;
        $due = $data['due_date'] ?? date('Y-m-d', strtotime('+7 days'));
        $status = $data['status'] ?? 'sent';
        $inv_number = 'INV-' . date('Y') . '-' . strtoupper(uniqid());
        $stmt = $conn->prepare("INSERT INTO invoices (booking_id, invoice_number, subtotal, tax, discount, total, status, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('isddddss', $bookingId, $inv_number, $subtotal, $tax, $discount, $total, $status, $due);
        executeOrFail($stmt, $conn);
        json_ok(['id' => $conn->insert_id, 'invoice_number' => $inv_number, 'total' => $total]);
        break;

    case 'PUT':
        authenticate(['admin', 'manager', 'receptionist']);
        if (!$id) {
            json_fail(400, 'Invoice ID is required');
        }
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $updates = [];
        $types = '';
        $params = [];

        if (isset($data['status'])) {
            $allowedStatus = ['draft', 'sent', 'paid', 'overdue'];
            if (!in_array($data['status'], $allowedStatus, true)) {
                json_fail(400, 'Invalid invoice status');
            }
            $updates[] = 'status = ?';
            $types .= 's';
            $params[] = $data['status'];
        }
        if (isset($data['due_date'])) {
            $updates[] = 'due_date = ?';
            $types .= 's';
            $params[] = $data['due_date'];
        }
        if (isset($data['discount'])) {
            $updates[] = 'discount = ?';
            $types .= 'd';
            $params[] = (float)$data['discount'];
        }
        if (isset($data['total'])) {
            $updates[] = 'total = ?';
            $types .= 'd';
            $params[] = (float)$data['total'];
        }

        if (empty($updates)) {
            json_fail(400, 'No fields to update');
        }

        $types .= 'i';
        $params[] = $id;
        $sql = 'UPDATE invoices SET ' . implode(', ', $updates) . ' WHERE id = ?';
        $stmt = $conn->prepare($sql);
        $stmt->bind_param($types, ...$params);
        executeOrFail($stmt, $conn);
        json_ok(['message' => 'Invoice updated successfully']);
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

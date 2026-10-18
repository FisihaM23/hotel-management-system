<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

authenticate(['admin', 'manager', 'receptionist']);
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;

switch ($method) {
    case 'GET':
        $booking_id = $_GET['booking_id'] ?? null;
        $query = "SELECT p.*, u.name as guest_name, u.email as guest_email, r.room_number, b.total_amount
                  FROM payments p
                  JOIN bookings b ON p.booking_id = b.id
                  JOIN users u ON b.customer_id = u.id
                  JOIN rooms r ON b.room_id = r.id";
        if ($booking_id) {
            $stmt = $conn->prepare("$query WHERE p.booking_id=? ORDER BY p.paid_at DESC");
            $stmt->bind_param('i', $booking_id);
            $stmt->execute();
            json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            json_ok($conn->query("$query ORDER BY p.paid_at DESC")->fetch_all(MYSQLI_ASSOC));
        }
        break;

    case 'POST':
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $booking_id = (int) ($d['booking_id'] ?? 0);
        $amount = (float) ($d['amount'] ?? 0);
        $methodPay = trim($d['method'] ?? 'cash');
        $status = trim($d['status'] ?? 'completed');
        $txn = trim($d['transaction_id'] ?? '');
        $notes = trim($d['notes'] ?? '');

        if (!$booking_id || $amount <= 0) {
            json_fail(400, 'Booking and a positive amount are required');
        }

        $stmt = $conn->prepare("INSERT INTO payments (booking_id, amount, method, status, transaction_id, notes) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('idssss', $booking_id, $amount, $methodPay, $status, $txn, $notes);
        executeOrFail($stmt, $conn);
        $newPayId = $conn->insert_id;

        // If payment completed, send guest notification and check invoice status
        if ($status === 'completed') {
            $bStmt = $conn->prepare("SELECT b.customer_id, r.room_number FROM bookings b JOIN rooms r ON b.room_id = r.id WHERE b.id = ?");
            $bStmt->bind_param('i', $booking_id);
            $bStmt->execute();
            $bData = $bStmt->get_result()->fetch_assoc();
            if ($bData) {
                $cId = (int) $bData['customer_id'];
                $methodDisplay = ucwords(str_replace('_', ' ', $methodPay));
                $msg = "Payment of " . number_format($amount, 2) . " ETB received via " . $methodDisplay . " for Room " . $bData['room_number'] . ". Thank you!";
                $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Payment Received', ?, 'success')");
                $notif->bind_param('is', $cId, $msg);
                $notif->execute();
            }

            // Update matching invoice to paid if balance is settled
            $invStmt = $conn->prepare("SELECT id, total FROM invoices WHERE booking_id = ?");
            $invStmt->bind_param('i', $booking_id);
            $invStmt->execute();
            $inv = $invStmt->get_result()->fetch_assoc();
            if ($inv) {
                $sumStmt = $conn->prepare("SELECT SUM(amount) as paid FROM payments WHERE booking_id = ? AND status = 'completed'");
                $sumStmt->bind_param('i', $booking_id);
                $sumStmt->execute();
                $sumRes = $sumStmt->get_result()->fetch_assoc();
                if ($sumRes && (float)$sumRes['paid'] >= (float)$inv['total']) {
                    $updInv = $conn->prepare("UPDATE invoices SET status = 'paid' WHERE id = ?");
                    $updInv->bind_param('i', $inv['id']);
                    $updInv->execute();
                }
            }
        }

        json_ok(['id' => $newPayId, 'message' => 'Payment recorded successfully']);
        break;

    case 'PUT':
        if (!$id) {
            json_fail(400, 'Payment ID is required');
        }
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $amount = (float) ($d['amount'] ?? 0);
        $methodPay = trim($d['method'] ?? 'cash');
        $status = trim($d['status'] ?? 'pending');
        $txn = trim($d['transaction_id'] ?? '');
        $notes = trim($d['notes'] ?? '');

        $stmt = $conn->prepare("UPDATE payments SET amount=?, method=?, status=?, transaction_id=?, notes=? WHERE id=?");
        $stmt->bind_param('dssssi', $amount, $methodPay, $status, $txn, $notes, $id);
        executeOrFail($stmt, $conn);

        json_ok(['message' => 'Payment updated successfully']);
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

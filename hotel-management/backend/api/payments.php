<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';
require_once '../config/financial_service.php';

$authUser = authenticate(ROLE_GROUP_FRONT_DESK);
$conn = getConnection();
FinancialService::ensureSchema($conn);
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;

switch ($method) {
    case 'GET':
        $booking_id = $_GET['booking_id'] ?? null;
        $query = "SELECT p.*, u.name as guest_name, u.email as guest_email, u.phone as guest_phone,
                  COALESCE(r.room_number, 'Dining Only') as room_number, r.id as room_id, b.total_amount,
                  b.receptionist_id, staff.name as staff_name, staff.role as staff_role
                  FROM payments p
                  JOIN bookings b ON p.booking_id = b.id
                  JOIN users u ON b.customer_id = u.id
                  LEFT JOIN rooms r ON b.room_id = r.id
                  LEFT JOIN users staff ON b.receptionist_id = staff.id";

        // Admin Real-Time Mobile Banking alerts endpoint (Admin only)
        if (isset($_GET['recent_for_admin'])) {
            $sinceId = isset($_GET['since_id']) ? (int)$_GET['since_id'] : 0;
            if ($sinceId > 0) {
                $stmt = $conn->prepare("$query WHERE p.id > ? AND p.status = 'completed' ORDER BY p.id DESC LIMIT 10");
                $stmt->bind_param('i', $sinceId);
                $stmt->execute();
                json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
            } else {
                $res = $conn->query("$query WHERE p.status = 'completed' ORDER BY p.id DESC LIMIT 5");
                json_ok($res ? $res->fetch_all(MYSQLI_ASSOC) : []);
            }
            break;
        }

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
        $amount = round((float) ($d['amount'] ?? 0), 2);
        $methodPay = trim($d['method'] ?? 'telebirr');
        $status = trim($d['status'] ?? 'completed');
        $txn = trim($d['transaction_id'] ?? '');
        $notes = trim($d['notes'] ?? 'Paid to Admin Account (0932338138 - Mulugeta Fisiha)');

        if (!$booking_id || $amount <= 0) {
            json_fail(400, 'Booking and a positive amount are required');
        }
        if (!in_array($status, ['pending', 'completed', 'failed'], true)) {
            json_fail(400, 'Invalid payment status');
        }

        $conn->begin_transaction();
        try {
            $bChk = $conn->prepare("SELECT b.customer_id, b.total_amount, r.room_number, r.id as room_id, u.name as guest_name, u.phone as guest_phone, u.email as guest_email FROM bookings b LEFT JOIN rooms r ON b.room_id = r.id JOIN users u ON b.customer_id = u.id WHERE b.id = ? AND b.deleted_at IS NULL FOR UPDATE");
            $bChk->bind_param('i', $booking_id);
            $bChk->execute();
            $bData = $bChk->get_result()->fetch_assoc();
            $bChk->close();
            if (!$bData) {
                $conn->rollback();
                json_fail(404, 'Booking not found');
            }

            $stmt = $conn->prepare("INSERT INTO payments (booking_id, amount, method, status, transaction_id, notes) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->bind_param('idssss', $booking_id, $amount, $methodPay, $status, $txn, $notes);
            if (!$stmt->execute()) {
                throw new RuntimeException($stmt->error ?: 'Failed to record payment');
            }
            $newPayId = (int) $conn->insert_id;
            $stmt->close();

            $invSync = null;
            if ($status === 'completed') {
                $invSync = FinancialService::syncInvoiceStatusFromPayments($conn, $booking_id);
            }

            $conn->commit();
        } catch (\Throwable $e) {
            $conn->rollback();
            json_fail(500, 'Failed to record payment: ' . $e->getMessage());
        }

        if ($status === 'completed' && !empty($bData)) {
            require_once '../config/notifications.php';
            dispatchPaymentNotification($conn, [
                'booking_id' => $booking_id,
                'customer_id' => (int)$bData['customer_id'],
                'amount' => $amount,
                'method' => $methodPay,
                'transaction_id' => $txn,
                'room_number' => $bData['room_number'] ?? 'Dining Only',
                'guest_name' => $bData['guest_name'],
                'guest_phone' => $bData['guest_phone'] ?? '',
                'guest_email' => $bData['guest_email'] ?? ''
            ]);
        }

        json_ok([
            'id' => $newPayId,
            'message' => 'Payment recorded successfully',
            'invoice_status' => $invSync['invoice_status'] ?? null,
            'balance_due' => $invSync['balance_due'] ?? null,
        ]);
        break;

    case 'PUT':
        if (!$id) {
            json_fail(400, 'Payment ID is required');
        }
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $amount = round((float) ($d['amount'] ?? 0), 2);
        $methodPay = trim($d['method'] ?? 'cash');
        $status = trim($d['status'] ?? 'pending');
        $txn = trim($d['transaction_id'] ?? '');
        $notes = trim($d['notes'] ?? '');
        $reason = trim((string) ($d['reason'] ?? $d['refund_reason'] ?? 'Payment updated'));

        if ($amount <= 0) {
            json_fail(400, 'Payment amount must be positive');
        }
        if (!in_array($status, ['pending', 'completed', 'refunded', 'failed'], true)) {
            json_fail(400, 'Invalid payment status');
        }

        $conn->begin_transaction();
        try {
            $pLock = $conn->prepare("SELECT * FROM payments WHERE id = ? FOR UPDATE");
            $pLock->bind_param('i', $id);
            $pLock->execute();
            $existingPay = $pLock->get_result()->fetch_assoc();
            $pLock->close();
            if (!$existingPay) {
                $conn->rollback();
                json_fail(404, 'Payment not found');
            }

            $isRefundOrAmountEdit = ($status === 'refunded' && $existingPay['status'] !== 'refunded')
                || abs($amount - (float) $existingPay['amount']) > 0.009;

            if ($isRefundOrAmountEdit && !in_array($authUser['role'], ['admin', 'manager'], true)) {
                $conn->rollback();
                json_fail(403, 'Only Admin or Manager can process refunds or modify payment amounts');
            }

            $stmt = $conn->prepare("UPDATE payments SET amount=?, method=?, status=?, transaction_id=?, notes=? WHERE id=?");
            $stmt->bind_param('dssssi', $amount, $methodPay, $status, $txn, $notes, $id);
            if (!$stmt->execute()) {
                throw new RuntimeException($stmt->error ?: 'Failed to update payment');
            }
            $stmt->close();

            if ($isRefundOrAmountEdit) {
                $actionName = ($status === 'refunded') ? 'refund' : 'payment_adjustment';
                FinancialService::recordAudit(
                    $conn,
                    'payment',
                    $id,
                    $actionName,
                    ['amount' => (float) $existingPay['amount'], 'status' => $existingPay['status']],
                    ['amount' => $amount, 'status' => $status],
                    $reason,
                    (int) $authUser['id'],
                    $authUser['role']
                );
            }

            $invSync = FinancialService::syncInvoiceStatusFromPayments($conn, (int) $existingPay['booking_id']);
            $conn->commit();

            json_ok([
                'message' => 'Payment updated successfully',
                'invoice_status' => $invSync['invoice_status'] ?? null,
                'balance_due' => $invSync['balance_due'] ?? null,
            ]);
        } catch (\Throwable $e) {
            $conn->rollback();
            json_fail(500, 'Failed to update payment: ' . $e->getMessage());
        }
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

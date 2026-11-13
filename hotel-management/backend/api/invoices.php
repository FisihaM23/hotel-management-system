<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';
require_once '../config/financial_service.php';

$conn = getConnection();
FinancialService::ensureSchema($conn);
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;
$action = $_GET['action'] ?? null;

if ($action === 'tax_settings') {
    if ($method === 'GET') {
        authenticate(['admin', 'manager', 'receptionist']);
        json_ok(FinancialService::getTaxConfig($conn));
    } elseif ($method === 'PUT') {
        $authUser = authenticate(['admin', 'manager']);
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $reason = trim((string) ($data['reason'] ?? 'Tax settings updated'));
        $res = FinancialService::updateTaxConfig($conn, $data, (int) $authUser['id'], $authUser['role'], $reason);
        if (!$res['ok']) {
            json_fail($res['code'], $res['error']);
        }
        json_ok(['message' => 'Tax configuration updated', 'config' => $res['config']]);
    } else {
        json_fail(405, 'Method not allowed');
    }
    $conn->close();
    exit;
}

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
                       COALESCE(r.room_number, 'Dining Only') as room_number, COALESCE(r.type, 'Dining Only') as room_type, r.price_per_night,
                       p.method as payment_method, p.transaction_id, p.paid_at
                FROM invoices i
                JOIN bookings b ON i.booking_id = b.id
                JOIN users u ON b.customer_id = u.id
                LEFT JOIN rooms r ON b.room_id = r.id
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
                    SELECT i.*, u.name as guest_name, COALESCE(r.room_number, 'Dining Only') as room_number, b.check_in, b.check_out
                    FROM invoices i
                    JOIN bookings b ON i.booking_id = b.id
                    JOIN users u ON b.customer_id = u.id
                    LEFT JOIN rooms r ON b.room_id = r.id
                    WHERE b.customer_id = ?
                    ORDER BY i.created_at DESC
                ");
                $stmt->bind_param('i', $user['id']);
                $stmt->execute();
            } else {
                $stmt = $conn->prepare("
                    SELECT i.*, u.name as customer_name, u.name as guest_name, COALESCE(r.room_number, 'Dining Only') as room_number, b.check_in, b.check_out
                    FROM invoices i
                    JOIN bookings b ON i.booking_id = b.id
                    JOIN users u ON b.customer_id = u.id
                    LEFT JOIN rooms r ON b.room_id = r.id
                    ORDER BY i.created_at DESC
                ");
                $stmt->execute();
            }
            json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        }
        break;

    case 'POST':
        $authUser = authenticate(['admin', 'manager', 'receptionist']);
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        if (isset($data['total']) || isset($data['subtotal']) || isset($data['tax'])) {
            json_fail(400, 'Direct override of subtotal, tax, or total is prohibited; amounts are calculated server-side.');
        }
        $bookingId = (int) ($data['booking_id'] ?? 0);
        if (!$bookingId) {
            json_fail(400, 'Booking is required');
        }
        $booking = $conn->prepare("SELECT b.id, b.room_id, b.check_in, b.check_out, b.total_amount, r.price_per_night FROM bookings b LEFT JOIN rooms r ON b.room_id = r.id WHERE b.id = ? AND b.deleted_at IS NULL");
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

        $discount = (float) ($data['discount'] ?? 0);
        $additionalCharges = (float) ($data['additional_charges'] ?? 0);
        if ($discount < 0 || $additionalCharges < 0) {
            json_fail(400, 'Discount and additional charges cannot be negative');
        }

        $taxExempt = false;
        $taxExemptReason = null;
        if (!empty($data['tax_exempt'])) {
            if (!in_array($authUser['role'], ['admin', 'manager'], true)) {
                json_fail(403, 'Only Admin or Manager can authorize tax exemptions');
            }
            $taxExempt = true;
            $taxExemptReason = trim((string) ($data['tax_exemption_reason'] ?? 'Authorized tax exemption'));
        }

        $diningCharges = FinancialService::getBookingDiningCharges($conn, $bookingId);
        if (!empty($brow['room_id']) && !empty($brow['price_per_night'])) {
            $nights = max(1, (strtotime($brow['check_out']) - strtotime($brow['check_in'])) / 86400);
            $roomCharges = round((float) $brow['price_per_night'] * $nights, 2);
        } else {
            $roomCharges = max(0.0, round((float) $brow['total_amount'] - $diningCharges, 2));
        }

        $subtotalCheck = $roomCharges + $diningCharges + $additionalCharges;
        if ($discount > $subtotalCheck) {
            json_fail(400, 'Discount cannot exceed invoice subtotal');
        }

        $paidAmount = FinancialService::getCompletedPaidAmount($conn, $bookingId);
        $due = $data['due_date'] ?? date('Y-m-d', strtotime('+7 days'));

        $conn->begin_transaction();
        try {
            $created = FinancialService::createInvoiceForBooking(
                $conn,
                $bookingId,
                $roomCharges,
                $diningCharges,
                $additionalCharges,
                $discount,
                $taxExempt,
                $taxExemptReason,
                $paidAmount,
                $due,
                (int) $authUser['id'],
                $authUser['role']
            );
            $conn->commit();
            json_ok([
                'id' => $created['invoice_id'],
                'invoice_number' => $created['invoice_number'],
                'subtotal' => $created['subtotal'],
                'tax_rate' => $created['tax_rate'],
                'tax' => $created['tax'],
                'discount' => $created['discount'],
                'total' => $created['final_total'],
                'status' => $created['invoice_status'],
            ]);
        } catch (\Throwable $e) {
            $conn->rollback();
            json_fail(500, 'Failed to create invoice: ' . $e->getMessage());
        }
        break;

    case 'PUT':
        $authUser = authenticate(['admin', 'manager', 'receptionist']);
        if (!$id) {
            json_fail(400, 'Invoice ID is required');
        }
        $data = json_decode(file_get_contents('php://input'), true) ?: [];

        // Prevent staff from directly overwriting calculated totals
        if (array_key_exists('total', $data) || array_key_exists('subtotal', $data) || array_key_exists('tax', $data) || array_key_exists('tax_rate', $data)) {
            json_fail(400, 'Direct modification of invoice subtotal, tax, tax_rate, or total is prohibited. Use authorized discount, additional_charges, or tax_exempt adjustment fields.');
        }

        $hasFinancialAdj = array_key_exists('discount', $data)
            || array_key_exists('additional_charges', $data)
            || array_key_exists('tax_exempt', $data);

        if ($hasFinancialAdj && !in_array($authUser['role'], ['admin', 'manager'], true)) {
            json_fail(403, 'Only Admin or Manager can apply invoice financial adjustments or tax exemptions');
        }

        $conn->begin_transaction();
        try {
            $lockStmt = $conn->prepare("SELECT * FROM invoices WHERE id = ? FOR UPDATE");
            $lockStmt->bind_param('i', $id);
            $lockStmt->execute();
            $inv = $lockStmt->get_result()->fetch_assoc();
            $lockStmt->close();
            if (!$inv) {
                $conn->rollback();
                json_fail(404, 'Invoice not found');
            }

            if ($hasFinancialAdj && $inv['status'] === 'paid') {
                $conn->rollback();
                json_fail(409, 'Cannot modify financial amounts on an already paid invoice');
            }

            $newDue = $inv['due_date'];
            if (isset($data['due_date'])) {
                $newDue = $data['due_date'];
            }

            $newStatus = $inv['status'];
            if (isset($data['status'])) {
                $allowedStatus = ['draft', 'sent', 'paid', 'overdue'];
                if (!in_array($data['status'], $allowedStatus, true)) {
                    $conn->rollback();
                    json_fail(400, 'Invalid invoice status');
                }
                $newStatus = $data['status'];
            }

            if ($hasFinancialAdj) {
                $discount = array_key_exists('discount', $data) ? (float) $data['discount'] : (float) $inv['discount'];
                $additionalCharges = array_key_exists('additional_charges', $data) ? (float) $data['additional_charges'] : (float) $inv['additional_charges'];
                $taxExempt = array_key_exists('tax_exempt', $data) ? (bool) $data['tax_exempt'] : (bool) $inv['tax_exempt'];
                $taxExemptReason = array_key_exists('tax_exemption_reason', $data)
                    ? trim((string) $data['tax_exemption_reason'])
                    : $inv['tax_exemption_reason'];

                if ($discount < 0 || $additionalCharges < 0) {
                    $conn->rollback();
                    json_fail(400, 'Discount and additional charges cannot be negative');
                }

                $roomCharges = (float) $inv['room_charges'];
                $diningCharges = (float) $inv['dining_charges'];
                if ($roomCharges <= 0.0 && $diningCharges <= 0.0 && (float) $inv['subtotal'] > 0) {
                    $roomCharges = (float) $inv['subtotal'];
                }

                $subtotalCheck = $roomCharges + $diningCharges + $additionalCharges;
                if ($discount > $subtotalCheck) {
                    $conn->rollback();
                    json_fail(400, 'Discount cannot exceed invoice subtotal');
                }

                // Preserve historical rate unless tax_exempt is being toggled off from 0
                $storedRate = (float) $inv['tax_rate'];
                $overrideRate = (!$taxExempt && $storedRate > 0) ? $storedRate : null;

                $calc = FinancialService::calculateItemizedTotals(
                    $conn,
                    $roomCharges,
                    $diningCharges,
                    $additionalCharges,
                    $discount,
                    $taxExempt,
                    $overrideRate,
                    $overrideRate
                );

                $paidNow = FinancialService::getCompletedPaidAmount($conn, (int) $inv['booking_id']);
                $balanceDue = round(max(0.0, $calc['total'] - $paidNow), 2);
                $newStatus = $balanceDue <= 0.01 ? 'paid' : ($newStatus === 'draft' ? 'draft' : 'sent');
                $exemptInt = $calc['tax_exempt'] ? 1 : 0;

                $upd = $conn->prepare("UPDATE invoices SET room_charges=?, dining_charges=?, additional_charges=?, subtotal=?, tax_rate=?, tax=?, tax_exempt=?, tax_exemption_reason=?, discount=?, total=?, status=?, due_date=? WHERE id=?");
                $upd->bind_param(
                    'ddddddisddssi',
                    $calc['room_charges'],
                    $calc['dining_charges'],
                    $calc['additional_charges'],
                    $calc['subtotal'],
                    $calc['tax_rate'],
                    $calc['tax'],
                    $exemptInt,
                    $taxExemptReason,
                    $calc['discount'],
                    $calc['total'],
                    $newStatus,
                    $newDue,
                    $id
                );
                $upd->execute();
                $upd->close();

                $reason = trim((string) ($data['adjustment_reason'] ?? $data['reason'] ?? 'Authorized invoice adjustment'));
                FinancialService::recordAudit(
                    $conn,
                    'invoice',
                    $id,
                    'apply_adjustment',
                    [
                        'additional_charges' => (float) $inv['additional_charges'],
                        'discount' => (float) $inv['discount'],
                        'tax_exempt' => (int) $inv['tax_exempt'],
                        'tax_rate' => (float) $inv['tax_rate'],
                        'tax' => (float) $inv['tax'],
                        'total' => (float) $inv['total'],
                    ],
                    $calc,
                    $reason,
                    (int) $authUser['id'],
                    $authUser['role']
                );
            } else {
                $upd = $conn->prepare("UPDATE invoices SET status = ?, due_date = ? WHERE id = ?");
                $upd->bind_param('ssi', $newStatus, $newDue, $id);
                $upd->execute();
                $upd->close();
            }

            $conn->commit();
            json_ok(['message' => 'Invoice updated successfully']);
        } catch (\Throwable $e) {
            $conn->rollback();
            json_fail(500, 'Failed to update invoice: ' . $e->getMessage());
        }
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

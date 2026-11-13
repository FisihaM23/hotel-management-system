<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';
require_once '../config/chapa.php';
require_once '../config/helpers.php';
require_once '../config/notifications.php';
require_once '../config/booking_state_machine.php';
require_once '../config/financial_service.php';

$conn = getConnection();
BookingStateMachine::ensureAuditTable($conn);
FinancialService::ensureSchema($conn);
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

/**
 * Atomically complete a Chapa payment, mark its invoice paid, transition the booking
 * from pending -> confirmed via BookingStateMachine, record the audit entry, and sync room status.
 */
function completeChapaPaymentTransaction(
    mysqli $conn,
    string $txRef,
    string $actorRole,
    string $auditNote
): array {
    $conn->query("SET SESSION innodb_lock_wait_timeout = 10");
    $conn->begin_transaction();
    try {
        $pLock = $conn->prepare("SELECT id, booking_id, amount, status FROM payments WHERE transaction_id = ? FOR UPDATE");
        if (!$pLock) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare payment lock');
        }
        $pLock->bind_param("s", $txRef);
        if (!$pLock->execute()) {
            throw new RuntimeException($pLock->error ?: 'Failed to lock payment');
        }
        $lockedPayment = $pLock->get_result()->fetch_assoc();
        $pLock->close();

        if (!$lockedPayment) {
            $conn->rollback();
            return ['found' => false, 'already_completed' => false, 'room_id' => 0];
        }

        if ($lockedPayment['status'] === 'completed') {
            $conn->commit();
            return ['found' => true, 'already_completed' => true, 'room_id' => 0];
        }

        $bookingId = (int) $lockedPayment['booking_id'];

        // 1. Mark payment as completed
        $updPay = $conn->prepare("UPDATE payments SET status = 'completed', method = 'chapa', paid_at = NOW() WHERE id = ?");
        if (!$updPay) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare payment update');
        }
        $updPay->bind_param("i", $lockedPayment['id']);
        if (!$updPay->execute()) {
            throw new RuntimeException($updPay->error ?: 'Failed to update payment');
        }
        $updPay->close();

        // 2. Synchronize linked invoice status using FinancialService (only marks 'paid' if balance_due <= 0.01)
        FinancialService::syncInvoiceStatusFromPayments($conn, $bookingId);

        // 3. Lock booking and transition pending -> confirmed through BookingStateMachine
        $bLock = $conn->prepare("SELECT id, room_id, status, total_amount FROM bookings WHERE id = ? FOR UPDATE");
        if (!$bLock) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare booking lock');
        }
        $bLock->bind_param("i", $bookingId);
        if (!$bLock->execute()) {
            throw new RuntimeException($bLock->error ?: 'Failed to lock booking');
        }
        $lockedBooking = $bLock->get_result()->fetch_assoc();
        $bLock->close();

        $roomId = 0;
        if ($lockedBooking) {
            $roomId = (int) ($lockedBooking['room_id'] ?? 0);
            if ($lockedBooking['status'] === 'pending') {
                $transition = BookingStateMachine::validateTransition('pending', 'confirmed', [
                    'total_amount' => $lockedBooking['total_amount'],
                    'paid_amount' => (float) $lockedPayment['amount'],
                ]);
                if (!$transition['ok']) {
                    throw new RuntimeException($transition['error']);
                }

                $updBk = $conn->prepare("UPDATE bookings SET status = 'confirmed' WHERE id = ?");
                if (!$updBk) {
                    throw new RuntimeException($conn->error ?: 'Failed to prepare booking confirmation');
                }
                $updBk->bind_param("i", $bookingId);
                if (!$updBk->execute()) {
                    throw new RuntimeException($updBk->error ?: 'Failed to confirm booking');
                }
                $updBk->close();

                BookingStateMachine::recordTransition(
                    $conn,
                    $bookingId,
                    'pending',
                    'confirmed',
                    null,
                    $actorRole,
                    $auditNote
                );
            }
        }

        // 4. Synchronize physical room status based on current occupancy (not future reservations)
        if ($roomId > 0) {
            syncRoomStatus($conn, $roomId);
        }

        $conn->commit();
        return ['found' => true, 'already_completed' => false, 'room_id' => $roomId];
    } catch (\Throwable $e) {
        $conn->rollback();
        throw $e;
    }
}

function verifyChapaWithGateway(string $txRef, array $webhookData = []): bool
{
    $isLiveKey = (!empty(CHAPA_SECRET_KEY) && !str_contains(CHAPA_SECRET_KEY, 'sample_test_key'));
    if ($isLiveKey) {
        $ch = curl_init(CHAPA_BASE_URL . '/transaction/verify/' . urlencode($txRef));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . CHAPA_SECRET_KEY
        ]);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        $chapaRaw = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $chapaRes = json_decode((string) $chapaRaw, true);
        return ($httpCode === 200 && ($chapaRes['status'] ?? '') === 'success');
    }

    // In local test/simulation mode, reject explicitly failed/cancelled statuses
    if (isset($webhookData['status'])) {
        return strtolower((string) $webhookData['status']) === 'success';
    }
    return true;
}

// Helper to send in-app secure notifications
function notifyUsers($conn, $guestUserId, $title, $message) {
    // 1. Notify guest
    if ($guestUserId) {
        $stmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'success')");
        $stmt->bind_param("iss", $guestUserId, $title, $message);
        $stmt->execute();
    }
    // 2. Notify all admins and managers
    $adminRes = $conn->query("SELECT id FROM users WHERE role IN ('admin', 'manager') AND status = 'active'");
    if ($adminRes) {
        $adminStmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'info')");
        while ($adm = $adminRes->fetch_assoc()) {
            if ($adm['id'] != $guestUserId) {
                $adminStmt->bind_param("iss", $adm['id'], $title, $message);
                $adminStmt->execute();
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CONFIGURATION CHECK (GET ?action=config)
// ─────────────────────────────────────────────────────────────────────────────
if ($action === 'config' && $method === 'GET') {
    json_ok([
        'currency'      => CHAPA_CURRENCY,
        'public_key'    => CHAPA_PUBLIC_KEY,
        'is_configured' => !empty(CHAPA_PUBLIC_KEY)
    ]);
    $conn->close();
    exit;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. INITIALIZE CHAPA TRANSACTION (POST ?action=initialize)
// ─────────────────────────────────────────────────────────────────────────────
if ($action === 'initialize' && $method === 'POST') {
    $authUser = authenticate(['admin', 'manager', 'receptionist', 'customer']);
    $data = json_decode(file_get_contents('php://input'), true) ?: [];

    $bookingId = (int) ($data['booking_id'] ?? 0);
    $invoiceId = (int) ($data['invoice_id'] ?? 0);

    // Look up booking details
    if ($bookingId > 0) {
        $stmt = $conn->prepare("
            SELECT b.*, u.name as guest_name, u.email as guest_email, u.phone as guest_phone,
                   COALESCE(r.room_number, 'Dining Only') as room_number, COALESCE(r.type, 'Dining Only') as room_type
            FROM bookings b
            JOIN users u ON b.customer_id = u.id
            LEFT JOIN rooms r ON b.room_id = r.id
            WHERE b.id = ?
        ");
        $stmt->bind_param("i", $bookingId);
        $stmt->execute();
        $booking = $stmt->get_result()->fetch_assoc();
    } elseif ($invoiceId > 0) {
        $stmt = $conn->prepare("
            SELECT b.*, u.name as guest_name, u.email as guest_email, u.phone as guest_phone,
                   COALESCE(r.room_number, 'Dining Only') as room_number, COALESCE(r.type, 'Dining Only') as room_type, i.total as invoice_total
            FROM invoices i
            JOIN bookings b ON i.booking_id = b.id
            JOIN users u ON b.customer_id = u.id
            LEFT JOIN rooms r ON b.room_id = r.id
            WHERE i.id = ?
        ");
        $stmt->bind_param("i", $invoiceId);
        $stmt->execute();
        $booking = $stmt->get_result()->fetch_assoc();
        if ($booking) {
            $bookingId = (int) $booking['id'];
        }
    } else {
        json_fail(400, 'Valid booking_id or invoice_id is required');
    }

    if (!$booking) {
        json_fail(404, 'Booking or invoice not found');
    }

    // Customer can only pay for their own booking
    if ($authUser['role'] === 'customer' && (int) $booking['customer_id'] !== (int) $authUser['id']) {
        json_fail(403, 'Access denied: You can only pay for your own reservation');
    }

    $finSummary = FinancialService::getBookingSummary($conn, $bookingId, (float) ($booking['total_amount'] ?? 0));
    $defaultDue = $finSummary['balance_due'] > 0 ? $finSummary['balance_due'] : (float) ($booking['invoice_total'] ?? $booking['total_amount'] ?? 0);
    $amount = isset($data['amount']) && (float) $data['amount'] > 0
        ? round((float) $data['amount'], 2)
        : round($defaultDue, 2);

    if ($amount <= 0) {
        json_fail(400, 'Invalid payment amount');
    }

    $guestEmail = !empty($data['email']) ? trim($data['email']) : ($booking['guest_email'] ?: $authUser['email']);
    $guestName  = !empty($data['name'])  ? trim($data['name'])  : ($booking['guest_name']  ?: $authUser['name']);
    $guestPhone = !empty($data['phone']) ? trim($data['phone']) : ($booking['guest_phone'] ?: ($authUser['phone'] ?? '0911223344'));

    $nameParts = explode(' ', trim($guestName), 2);
    $firstName = $nameParts[0] ?: 'Guest';
    $lastName  = $nameParts[1] ?? 'Customer';

    // Generate unique transaction reference (tx_ref)
    $txRef = 'HM-TXN-' . time() . '-' . bin2hex(random_bytes(3));

    // Create pending payment record in DB
    $notes = 'Chapa payment initialized for booking #' . $bookingId;
    $stmt = $conn->prepare("INSERT INTO payments (booking_id, amount, method, status, transaction_id, notes) VALUES (?, ?, 'chapa', 'pending', ?, ?)");
    $stmt->bind_param("idss", $bookingId, $amount, $txRef, $notes);
    $stmt->execute();
    $paymentId = $conn->insert_id;

    $frontendOrigin = !empty($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : FRONTEND_URL;
    $returnUrl = rtrim($frontendOrigin, '/') . '/payment-success?tx_ref=' . $txRef;
    $callbackUrl = 'http://localhost/hotel-management/api/chapa.php?action=webhook';

    $isLiveKey = (!empty(CHAPA_SECRET_KEY) && !str_contains(CHAPA_SECRET_KEY, 'sample_test_key'));

    if ($isLiveKey) {
        // Send request to Chapa API
        $chapaPayload = [
            'amount'        => number_format($amount, 2, '.', ''),
            'currency'      => CHAPA_CURRENCY,
            'email'         => $guestEmail,
            'first_name'    => $firstName,
            'last_name'     => $lastName,
            'phone_number'  => $guestPhone,
            'tx_ref'        => $txRef,
            'callback_url'  => $callbackUrl,
            'return_url'    => $returnUrl,
            'customization' => [
                'title'       => 'Hotel Booking #' . $bookingId,
                'description' => 'Payment for Room ' . ($booking['room_number'] ?? '') . ' (' . CHAPA_CURRENCY . ' ' . $amount . ')'
            ]
        ];

        $ch = curl_init(CHAPA_BASE_URL . '/transaction/initialize');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . CHAPA_SECRET_KEY,
            'Content-Type: application/json'
        ]);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($chapaPayload));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        $chapaRaw = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $chapaRes = json_decode($chapaRaw, true);

        if ($httpCode === 200 && ($chapaRes['status'] ?? '') === 'success' && !empty($chapaRes['data']['checkout_url'])) {
            json_ok([
                'status'       => 'success',
                'public_key'   => CHAPA_PUBLIC_KEY,
                'checkout_url' => $chapaRes['data']['checkout_url'],
                'tx_ref'       => $txRef,
                'amount'       => $amount,
                'currency'     => CHAPA_CURRENCY,
                'email'        => $guestEmail,
                'first_name'   => $firstName,
                'last_name'    => $lastName,
                'phone_number' => $guestPhone,
                'title'        => 'Hotel Booking #' . $bookingId,
                'description'  => 'Payment for Room ' . ($booking['room_number'] ?? '') . ' (' . CHAPA_CURRENCY . ' ' . $amount . ')',
                'callback_url' => $callbackUrl,
                'return_url'   => $returnUrl,
                'booking_id'   => $bookingId,
                'simulated'    => false
            ]);
            $conn->close();
            exit;
        }
    }

    // Hosted / Inline Checkout parameters with user's Chapa Public Key
    $hostedPayUrl = 'https://api.chapa.co/v1/hosted/pay';
    $simulatedUrl = rtrim($frontendOrigin, '/') . '/payment-success?tx_ref=' . $txRef . '&simulated=1';
    json_ok([
        'status'       => 'success',
        'public_key'   => CHAPA_PUBLIC_KEY,
        'checkout_url' => $simulatedUrl,
        'hosted_url'   => $hostedPayUrl,
        'tx_ref'       => $txRef,
        'amount'       => $amount,
        'currency'     => CHAPA_CURRENCY,
        'email'        => $guestEmail,
        'first_name'   => $firstName,
        'last_name'    => $lastName,
        'phone_number' => $guestPhone,
        'title'        => 'Hotel Booking #' . $bookingId,
        'description'  => 'Payment for Room ' . ($booking['room_number'] ?? '') . ' (' . CHAPA_CURRENCY . ' ' . $amount . ')',
        'callback_url' => $callbackUrl,
        'return_url'   => $returnUrl,
        'booking_id'   => $bookingId,
        'simulated'    => true,
        'message'      => 'Chapa transaction initialized with Public Key'
    ]);
    $conn->close();
    exit;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. VERIFY CHAPA TRANSACTION (GET or POST ?action=verify&tx_ref=xxx)
// ─────────────────────────────────────────────────────────────────────────────
if ($action === 'verify') {
    $authUser = authenticate(['admin', 'manager', 'receptionist', 'customer']);
    $txRef = $_GET['tx_ref'] ?? '';
    if (empty($txRef) && $method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $txRef = $data['tx_ref'] ?? '';
    }

    if (empty($txRef)) {
        json_fail(400, 'Transaction reference (tx_ref) is required');
    }

    // Lookup payment record
    $stmt = $conn->prepare("
        SELECT p.*, b.customer_id, b.room_id, b.status as booking_status,
               u.name as guest_name, u.email as guest_email, COALESCE(r.room_number, 'Dining Only') as room_number
        FROM payments p
        JOIN bookings b ON p.booking_id = b.id
        JOIN users u ON b.customer_id = u.id
        LEFT JOIN rooms r ON b.room_id = r.id
        WHERE p.transaction_id = ?
    ");
    $stmt->bind_param("s", $txRef);
    $stmt->execute();
    $payment = $stmt->get_result()->fetch_assoc();

    if (!$payment) {
        json_fail(404, 'Payment transaction record not found');
    }

    if ($authUser['role'] === 'customer' && (int) $payment['customer_id'] !== (int) $authUser['id']) {
        json_fail(403, 'Access denied: you can only verify your own payment');
    }

    // If already verified and completed, return current verified status
    if ($payment['status'] === 'completed') {
        json_ok([
            'status'           => 'success',
            'already_verified' => true,
            'message'          => 'Payment already verified and completed',
            'payment'          => $payment
        ]);
        $conn->close();
        exit;
    }

    $verified = verifyChapaWithGateway($txRef);

    if ($verified) {
        try {
            $txResult = completeChapaPaymentTransaction(
                $conn,
                $txRef,
                'chapa_verify',
                "Confirmed via Chapa verify ($txRef)"
            );
        } catch (\Throwable $e) {
            error_log('[Chapa Verify] Transaction rolled back: ' . $e->getMessage());
            json_fail(500, 'Failed to confirm payment safely. Please try again.');
        }

        $roomId = (int) ($txResult['room_id'] ?? ($payment['room_id'] ?? 0));
        if (empty($txResult['already_completed'])) {
            try {
                // 5. Broadcast to ALL hotel workers (admin, manager, receptionist, housekeeping, maintenance)
                broadcastRoomOccupiedAlert(
                    $conn,
                    $payment['booking_id'],
                    $roomId,
                    $payment['room_number'] ?? 'N/A',
                    $payment['guest_name'] ?? 'Valued Guest',
                    $payment['amount'],
                    'Chapa',
                    $payment['check_in'] ?? '',
                    $payment['check_out'] ?? ''
                );

                // 6. Send Multi-Channel Notifications (SMS to Phone 0932338138, Email, Telegram, In-App)
                dispatchPaymentNotification($conn, $payment);
            } catch (\Throwable $e) {
                error_log('[Chapa Verify Notification] Warning: ' . $e->getMessage());
            }
        }

        // Fetch refreshed payment details
        $stmt->execute();
        $updatedPayment = $stmt->get_result()->fetch_assoc();

        json_ok([
            'status'           => 'success',
            'verified'         => true,
            'already_verified' => !empty($txResult['already_completed']),
            'message'          => 'Payment verified successfully. Reservation confirmed!',
            'payment'          => $updatedPayment
        ]);
    } else {
        json_fail(400, 'Payment verification failed with Chapa gateway');
    }

    $conn->close();
    exit;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CHAPA WEBHOOK (POST ?action=webhook)
// ─────────────────────────────────────────────────────────────────────────────
if ($action === 'webhook' && $method === 'POST') {
    $rawPayload = file_get_contents('php://input');

    // Verify Chapa webhook HMAC signature when CHAPA_WEBHOOK_SECRET is configured
    if (!empty(CHAPA_WEBHOOK_SECRET)) {
        $sigHeader = $_SERVER['HTTP_CHAPA_SIGNATURE']
            ?? $_SERVER['HTTP_X_CHAPA_SIGNATURE']
            ?? '';
        $expectedSig = hash_hmac('sha256', (string) $rawPayload, CHAPA_WEBHOOK_SECRET);
        if (!$sigHeader || !hash_equals($expectedSig, $sigHeader)) {
            json_fail(401, 'Invalid Chapa webhook signature');
        }
    }

    $data = json_decode((string) $rawPayload, true) ?: [];
    $txRef = trim((string) ($data['tx_ref'] ?? ''));

    if (!empty($txRef)) {
        $stmt = $conn->prepare("
            SELECT p.*, b.customer_id, b.room_id, b.status as booking_status, b.check_in, b.check_out,
                   COALESCE(r.room_number, 'Dining Only') as room_number, u.name as guest_name, u.email as guest_email, u.phone as guest_phone
            FROM payments p
            JOIN bookings b ON p.booking_id = b.id
            JOIN users u ON b.customer_id = u.id
            LEFT JOIN rooms r ON b.room_id = r.id
            WHERE p.transaction_id = ?
        ");
        $stmt->bind_param("s", $txRef);
        $stmt->execute();
        $payment = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if ($payment && $payment['status'] !== 'completed') {
            $verified = verifyChapaWithGateway($txRef, $data);
            if (!$verified) {
                if (in_array(strtolower((string) ($data['status'] ?? '')), ['failed', 'cancelled'], true)) {
                    $failStmt = $conn->prepare("UPDATE payments SET status = 'failed' WHERE id = ? AND status = 'pending'");
                    if ($failStmt) {
                        $failStmt->bind_param("i", $payment['id']);
                        $failStmt->execute();
                        $failStmt->close();
                    }
                }
                json_ok(['received' => true, 'confirmed' => false]);
                $conn->close();
                exit;
            }

            try {
                $txResult = completeChapaPaymentTransaction(
                    $conn,
                    $txRef,
                    'chapa_webhook',
                    "Confirmed via Chapa webhook ($txRef)"
                );
            } catch (\Throwable $e) {
                error_log('[Chapa Webhook] Transaction rolled back: ' . $e->getMessage());
                json_fail(500, 'Failed to process Chapa webhook safely');
            }

            if (empty($txResult['already_completed'])) {
                try {
                    $webhookRoomId = (int) ($txResult['room_id'] ?? ($payment['room_id'] ?? 0));
                    broadcastRoomOccupiedAlert(
                        $conn,
                        $payment['booking_id'],
                        $webhookRoomId,
                        $payment['room_number'] ?? 'N/A',
                        $payment['guest_name'] ?? 'Valued Guest',
                        $payment['amount'],
                        'Chapa',
                        $payment['check_in'] ?? '',
                        $payment['check_out'] ?? ''
                    );
                    dispatchPaymentNotification($conn, $payment);
                } catch (\Throwable $e) {
                    error_log('[Chapa Webhook Notification] Warning: ' . $e->getMessage());
                }
            }
        }
    }
    json_ok(['received' => true]);
    $conn->close();
    exit;
}

json_fail(400, 'Invalid Chapa action');
$conn->close();

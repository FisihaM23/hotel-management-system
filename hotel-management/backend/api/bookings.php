<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';
require_once '../config/notifications.php';
require_once '../config/booking_state_machine.php';
require_once '../config/financial_service.php';
require_once '../config/notification_outbox.php';

$authUser = authenticate();
$conn = getConnection();
BookingStateMachine::ensureAuditTable($conn);
NotificationOutbox::ensureTable($conn);
SoftDeleteService::ensureSchema($conn);

$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;
$mine = isset($_GET['mine']);
$staffRoles = ['admin', 'manager', 'receptionist'];

$baseQuery = "SELECT b.*, u.name as guest_name, u.email as guest_email, u.phone as guest_phone,
              u.reason_for_stay, u.id_proof, u.id_number,
              COALESCE(r.room_number, 'Dining Only') as room_number,
              COALESCE(r.type, 'Dining & Bar Feast') as room_type,
              COALESCE(r.price_per_night, 0.00) as price_per_night,
              COALESCE(pay.paid_amount, 0) as paid_amount,
              ROUND(GREATEST(0, b.total_amount - COALESCE(pay.paid_amount, 0)), 2) as balance_amount,
              staff.name as staff_name,
              staff.role as staff_role
              FROM bookings b
              JOIN users u ON b.customer_id = u.id
              LEFT JOIN rooms r ON b.room_id = r.id
              LEFT JOIN users staff ON b.receptionist_id = staff.id
              LEFT JOIN (
                  SELECT booking_id, SUM(amount) as paid_amount 
                  FROM payments 
                  WHERE status = 'completed' 
                  GROUP BY booking_id
              ) pay ON pay.booking_id = b.id";

function fetchBooking($conn, $bookingId) {
    $stmt = $conn->prepare("SELECT * FROM bookings WHERE id = ?");
    if (!$stmt) return null;
    $stmt->bind_param('i', $bookingId);
    $stmt->execute();
    return $stmt->get_result()->fetch_assoc();
}

switch ($method) {
    case 'GET':
        $allStaffRoles = ['admin', 'manager', 'receptionist', 'housekeeping', 'maintenance'];

        // Dues endpoint restricted to front-desk / financial roles (admin, manager, receptionist)
        if (isset($_GET['due_only']) || isset($_GET['dues'])) {
            requireRole($authUser, ROLE_GROUP_FRONT_DESK, 'Access denied: financial dues are restricted to authorized front-desk and management roles');
            $dueSql = "$baseQuery 
                       WHERE b.deleted_at IS NULL AND b.status NOT IN ('cancelled', 'checked_out')
                       HAVING balance_amount > 0.01
                       ORDER BY balance_amount DESC, b.created_at DESC";
            $dueRes = $conn->query($dueSql);
            $dues = $dueRes ? $dueRes->fetch_all(MYSQLI_ASSOC) : [];
            $totalDue = 0.0;
            foreach ($dues as $item) {
                $totalDue += (float)$item['balance_amount'];
            }
            json_ok([
                'total_due' => round($totalDue, 2),
                'count' => count($dues),
                'dues' => $dues
            ]);
            break;
        }

        if ($mine || $authUser['role'] === 'customer') {
            $stmt = $conn->prepare("$baseQuery WHERE b.deleted_at IS NULL AND b.customer_id=? ORDER BY b.created_at DESC");
            if (!$stmt) {
                json_ok([]);
            }
            $stmt->bind_param('i', $authUser['id']);
            $stmt->execute();
            json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
            break;
        }
        if (!in_array($authUser['role'], $staffRoles, true)) {
            json_fail(403, 'Access denied');
        }
        $archived = !empty($_GET['archived']);
        if ($archived && $authUser['role'] !== 'admin') {
            json_fail(403, 'Only administrators can view archived bookings');
        }
        $deletedCond = $archived ? "b.deleted_at IS NOT NULL" : "b.deleted_at IS NULL";
        if ($id) {
            $stmt = $conn->prepare("$baseQuery WHERE b.id=?" . ($authUser['role'] === 'admin' ? "" : " AND b.deleted_at IS NULL"));
            $stmt->bind_param('i', $id);
            $stmt->execute();
            json_ok($stmt->get_result()->fetch_assoc());
        } else {
            $status = $_GET['status'] ?? null;
            if ($status) {
                $stmt = $conn->prepare("$baseQuery WHERE $deletedCond AND b.status=? ORDER BY b.created_at DESC");
                $stmt->bind_param('s', $status);
                $stmt->execute();
                json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
            } else {
                json_ok($conn->query("$baseQuery WHERE $deletedCond ORDER BY b.created_at DESC")->fetch_all(MYSQLI_ASSOC));
            }
        }
        break;

    case 'POST':
        requireRole($authUser, ['admin', 'manager', 'receptionist', 'customer'], 'Access denied: your role cannot create bookings');
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $customer_id = isset($d['customer_id']) ? (int) $d['customer_id'] : (isset($d['guest_id']) ? (int) $d['guest_id'] : 0);

        if ($authUser['role'] === 'customer') {
            $customer_id = (int) $authUser['id'];
        } elseif (!in_array($authUser['role'], $staffRoles, true)) {
            json_fail(403, 'Access denied');
        }

        // Pre-validate guest registration inputs before acquiring row locks
        $guestName = trim($d['name'] ?? ($d['guest_name'] ?? ''));
        $guestEmail = trim($d['email'] ?? ($d['guest_email'] ?? ''));
        $guestPhone = trim($d['phone'] ?? ($d['guest_phone'] ?? ''));
        $reasonForStay = trim($d['reason_for_stay'] ?? '');
        $idProof = trim($d['id_proof'] ?? '');
        $idNumber = trim($d['id_number'] ?? '');
        $address = trim($d['address'] ?? '');

        if (!$customer_id) {
            if (!$guestName) {
                json_fail(400, 'Customer registration is required. Please provide guest name based on hotel registration rules.');
            }
            if ($guestEmail && !isValidUserEmail($guestEmail)) {
                json_fail(400, emailPolicyMessage());
            }
            if (!$guestEmail) {
                $cleanName = strtolower(preg_replace('/[^a-z0-9]/', '', $guestName));
                $guestEmail = ($cleanName ?: 'guest') . '_' . time() . '@hotel.com';
            }
            if (!$reasonForStay) $reasonForStay = 'Tourism / Leisure';
            if (!$idProof) $idProof = 'National ID';
        }

        // Check if customer needs ONLY dining (room is optional)
        $isDiningOnly = !empty($d['is_dining_only'])
            || (empty($d['room_id']) && (!empty($d['dining_items']) || !empty($d['dining_total'])))
            || (isset($d['room_id']) && $d['room_id'] === 'dining_only');

        $room_id = null;
        $room = null;
        $roomTotal = 0.0;
        $check_in = $d['check_in'] ?? date('Y-m-d');
        $check_out = $d['check_out'] ?? date('Y-m-d', strtotime('+1 day'));

        if (!$isDiningOnly) {
            $room_id = (int) ($d['room_id'] ?? 0);
            if (!$room_id || !$check_in || !$check_out || !strtotime($check_in) || !strtotime($check_out) || strtotime($check_out) <= strtotime($check_in)) {
                json_fail(400, 'Valid room, check-in and check-out dates are required');
            }
        } else {
            if (strtotime($check_out) <= strtotime($check_in)) {
                $check_out = date('Y-m-d', strtotime($check_in . ' +1 day'));
            }
        }

        // Pre-calculate Dining & Bar Items before opening room lock transaction
        $diningItems = $d['dining_items'] ?? [];
        if (is_string($diningItems)) {
            $diningItems = json_decode($diningItems, true) ?: [];
        }
        $diningTotal = 0.0;
        $cleanDiningItems = [];
        if (!empty($diningItems) && is_array($diningItems)) {
            foreach ($diningItems as $item) {
                $itemId = (int) ($item['id'] ?? 0);
                $qty = max(1, (int) ($item['qty'] ?? 1));
                if (!$itemId) continue;
                $mStmt = $conn->prepare("SELECT id, name, price, is_available FROM menu_items WHERE id = ?");
                if (!$mStmt) {
                    json_fail(500, 'Failed to prepare menu verification query.');
                }
                $mStmt->bind_param('i', $itemId);
                if (!$mStmt->execute()) {
                    json_fail(500, 'Failed to verify menu item.');
                }
                $menuRow = $mStmt->get_result()->fetch_assoc();
                if ($menuRow) {
                    $itemPrice = (float) $menuRow['price'];
                    $sub = $itemPrice * $qty;
                    $diningTotal += $sub;
                    $cleanDiningItems[] = [
                        'id' => (int) $menuRow['id'],
                        'name' => $menuRow['name'],
                        'price' => $itemPrice,
                        'qty' => $qty,
                        'subtotal' => $sub
                    ];
                }
            }
        }

        // For dining-only customers, dining items are mandatory
        if ($isDiningOnly && ($diningTotal <= 0 || empty($cleanDiningItems))) {
            json_fail(400, 'For dining-only reservations, at least one menu item must be selected from the Dining & Bar menu.');
        }

        // Pre-validate payment method requirements
        $deposit = isset($d['payment_amount']) ? (float)$d['payment_amount'] : (isset($d['deposit_amount']) ? (float)$d['deposit_amount'] : 0);
        $payMethod = trim($d['payment_method'] ?? ($d['method'] ?? ''));
        $txn = trim($d['transaction_id'] ?? ($d['tx_ref'] ?? ''));
        $notes = trim($d['notes'] ?? ($d['payment_notes'] ?? 'Direct Payment to Admin Account (0932338138 - Mulugeta Fisiha)'));

        if ($isDiningOnly && empty($payMethod)) {
            json_fail(400, 'Full payment and payment method are mandatory for dining-only customers.');
        }
        if (!$isDiningOnly && $authUser['role'] === 'customer' && empty($payMethod)) {
            json_fail(400, 'Payment is required before booking registration can be saved. Please select a payment method.');
        }

        $adults = (int) ($d['adults'] ?? 1);
        $children = (int) ($d['children'] ?? 0);
        $recep = $authUser['role'] !== 'customer' ? $authUser['id'] : null;
        $special = trim($d['special_requests'] ?? '');
        if ($diningTotal > 0 && !empty($cleanDiningItems)) {
            $deliveryPref = $d['dining_delivery_time'] ?? ($isDiningOnly ? 'Restaurant Dine-In / Lounge' : 'On arrival / Check-in');
            $diningNote = "[Pre-ordered Dining & Bar: ETB " . number_format($diningTotal, 2) . " (" . count($cleanDiningItems) . " items) - Preference: " . $deliveryPref . "]";
            $special = $special ? ($special . "\n" . $diningNote) : $diningNote;
        }

        // Begin atomic MySQLi transaction BEFORE checking room availability
        $newId = 0;
        $total = 0.0;
        $balanceDue = 0.0;
        $actualGuestName = 'Valued Guest';
        $gUser = null;

        $conn->query("SET SESSION innodb_lock_wait_timeout = 10");
        $conn->begin_transaction();
        try {
            if ($isDiningOnly) {
                $room_id = null;
                $room = [
                    'room_number' => 'Dining Only',
                    'price_per_night' => 0.00,
                    'status' => 'available',
                    'max_guests' => 99
                ];
                $roomTotal = 0.0;
            } else {
                // Lock the relevant room row exclusively while validating availability
                $stmt = $conn->prepare("SELECT id, room_number, price_per_night, status, max_guests FROM rooms WHERE id = ? FOR UPDATE");
                if (!$stmt) {
                    throw new RuntimeException($conn->error ?: 'Failed to prepare room lock query');
                }
                $stmt->bind_param('i', $room_id);
                if (!$stmt->execute()) {
                    throw new RuntimeException($stmt->error ?: 'Failed to execute room lock query');
                }
                $room = $stmt->get_result()->fetch_assoc();

                if (!$room) {
                    $conn->rollback();
                    json_fail(400, 'Room not found');
                }
                if ($room['status'] === 'maintenance') {
                    $conn->rollback();
                    json_fail(400, 'Selected room is under maintenance');
                }

                // Execute overlap validation while holding the exclusive row lock
                if (roomHasOverlap($conn, $room_id, $check_in, $check_out, 0, true)) {
                    $conn->rollback();
                    json_fail(409, 'Room is already booked for those dates. Please select an available room.');
                }

                $totalGuests = max(1, $adults + $children);
                $maxCapacity = (int) ($room['max_guests'] ?? 2);
                if ($totalGuests > $maxCapacity) {
                    $conn->rollback();
                    json_fail(400, "The number of guests ($totalGuests) exceeds Room {$room['room_number']}'s maximum capacity of $maxCapacity guests.");
                }

                $nights = max(1, (strtotime($check_out) - strtotime($check_in)) / 86400);
                $roomTotal = round((float) $room['price_per_night'] * $nights, 2);
            }

            $taxExempt = false;
            $taxExemptReason = null;
            if (in_array($authUser['role'], ['admin', 'manager'], true) && !empty($d['tax_exempt'])) {
                $taxExempt = true;
                $taxExemptReason = trim((string) ($d['tax_exemption_reason'] ?? 'Authorized exemption'));
            }
            $finCalc = FinancialService::calculateItemizedTotals($conn, $roomTotal, $diningTotal, 0.0, 0.0, $taxExempt);
            $total = $finCalc['total'];

            // Payment amount validation
            if ($isDiningOnly) {
                if ($deposit <= 0) {
                    $deposit = $total;
                }
                if ($deposit < $total - 0.01) {
                    $conn->rollback();
                    json_fail(400, 'Due is not permitted for dining-only customers. Full payment of ETB ' . number_format($total, 2) . ' is mandatory before reservation can be confirmed.');
                }
            } elseif ($authUser['role'] === 'customer') {
                if ($deposit <= 0) {
                    $deposit = $total;
                }
            }

            $status = ($deposit >= $total - 0.01 || $deposit > 0) ? 'confirmed' : 'pending';
            if (in_array($authUser['role'], $staffRoles, true) && !empty($d['status'])) {
                $requestedStatus = (string) $d['status'];
                if (in_array($requestedStatus, ['pending', 'confirmed', 'checked_in'], true)) {
                    if ($requestedStatus === 'checked_in') {
                        $checkInCheck = BookingStateMachine::validateTransition('pending', 'checked_in', [
                            'total_amount' => $total,
                            'paid_amount' => $deposit,
                        ]);
                        if (!$checkInCheck['ok']) {
                            $conn->rollback();
                            json_fail($checkInCheck['code'], $checkInCheck['error']);
                        }
                    }
                    $status = $requestedStatus;
                }
            }

            // Resolve, register, or update customer inside the transaction so rollback leaves zero orphaned users
            if (!$customer_id) {
                $findStmt = $conn->prepare("SELECT id FROM users WHERE email = ?");
                if (!$findStmt) throw new RuntimeException($conn->error);
                $findStmt->bind_param('s', $guestEmail);
                if (!$findStmt->execute()) throw new RuntimeException($findStmt->error ?: 'Failed to lookup guest');
                $existingGuest = $findStmt->get_result()->fetch_assoc();

                if ($existingGuest) {
                    $customer_id = (int) $existingGuest['id'];
                    $updGuest = $conn->prepare("UPDATE users SET name=?, phone=?, reason_for_stay=?, id_proof=?, id_number=?, address=? WHERE id=?");
                    if (!$updGuest) throw new RuntimeException($conn->error);
                    $updGuest->bind_param('ssssssi', $guestName, $guestPhone, $reasonForStay, $idProof, $idNumber, $address, $customer_id);
                    if (!$updGuest->execute()) throw new RuntimeException($updGuest->error ?: 'Failed to update guest');
                } else {
                    $pwdHash = password_hash(DEMO_PASSWORD, PASSWORD_DEFAULT);
                    $insGuest = $conn->prepare("INSERT INTO users (name, email, password, role, phone, address, reason_for_stay, id_proof, id_number) VALUES (?, ?, ?, 'customer', ?, ?, ?, ?, ?)");
                    if (!$insGuest) throw new RuntimeException($conn->error);
                    $insGuest->bind_param('ssssssss', $guestName, $guestEmail, $pwdHash, $guestPhone, $address, $reasonForStay, $idProof, $idNumber);
                    if (!$insGuest->execute()) throw new RuntimeException($insGuest->error ?: 'Failed to register guest');
                    $customer_id = $conn->insert_id;
                }
            } else {
                $updates = [];
                $params = [];
                $types = '';
                if ($guestName) { $updates[] = "name = ?"; $params[] = $guestName; $types .= 's'; }
                if ($guestPhone) { $updates[] = "phone = ?"; $params[] = $guestPhone; $types .= 's'; }
                if ($reasonForStay) { $updates[] = "reason_for_stay = ?"; $params[] = $reasonForStay; $types .= 's'; }
                if ($idProof) { $updates[] = "id_proof = ?"; $params[] = $idProof; $types .= 's'; }
                if ($idNumber) { $updates[] = "id_number = ?"; $params[] = $idNumber; $types .= 's'; }

                if (!empty($updates)) {
                    $params[] = $customer_id;
                    $types .= 'i';
                    $sqlUpd = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?";
                    $uStmt = $conn->prepare($sqlUpd);
                    if (!$uStmt) throw new RuntimeException($conn->error);
                    $uStmt->bind_param($types, ...$params);
                    if (!$uStmt->execute()) throw new RuntimeException($uStmt->error ?: 'Failed to update guest details');
                }
            }

            // Insert booking
            if ($room_id === null) {
                $stmt = $conn->prepare("INSERT INTO bookings (customer_id,room_id,receptionist_id,check_in,check_out,adults,children,special_requests,total_amount,status) VALUES (?,NULL,?,?,?,?,?,?,?,?)");
                if (!$stmt) throw new RuntimeException($conn->error);
                $stmt->bind_param('iissiisds', $customer_id, $recep, $check_in, $check_out, $adults, $children, $special, $total, $status);
            } else {
                $stmt = $conn->prepare("INSERT INTO bookings (customer_id,room_id,receptionist_id,check_in,check_out,adults,children,special_requests,total_amount,status) VALUES (?,?,?,?,?,?,?,?,?,?)");
                if (!$stmt) throw new RuntimeException($conn->error);
                $stmt->bind_param('iiissiisds', $customer_id, $room_id, $recep, $check_in, $check_out, $adults, $children, $special, $total, $status);
            }
            if (!$stmt->execute()) {
                throw new RuntimeException($stmt->error ?: 'Failed to insert booking');
            }
            $newId = $conn->insert_id;
            BookingStateMachine::recordTransition($conn, $newId, null, $status, (int) $authUser['id'], $authUser['role'], 'Booking created');

            // If dining items were ordered, automatically create an order in dining_orders
            if ($diningTotal > 0 && !empty($cleanDiningItems)) {
                $order_num = 'ORD-' . date('Y') . '-' . strtoupper(substr(uniqid(), -6));
                $itemsJson = json_encode($cleanDiningItems);
                $deliveryType = $isDiningOnly ? 'restaurant_dine_in' : 'room_service';
                $orderStatus = 'pending';
                $paymentStatus = ($deposit >= $total) ? 'paid' : ($deposit > 0 ? 'partially_paid' : 'charged_to_room');
                $diningNotes = ($isDiningOnly ? 'Dining-Only Feast (No room needed). ' : ('Pre-ordered with Booking #' . $newId . '. ')) . ($d['dining_notes'] ?? '');
                $roomNumDisplay = $isDiningOnly ? 'Dining Plaza' : $room['room_number'];

                $dStmt = $conn->prepare("INSERT INTO dining_orders (order_number, customer_id, booking_id, room_number, items, total_amount, delivery_type, status, payment_status, special_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                if (!$dStmt) throw new RuntimeException($conn->error);
                $dStmt->bind_param('siisdsssss', $order_num, $customer_id, $newId, $roomNumDisplay, $itemsJson, $diningTotal, $deliveryType, $orderStatus, $paymentStatus, $diningNotes);
                if (!$dStmt->execute()) throw new RuntimeException($dStmt->error ?: 'Failed to create dining order');
            }

            // If payment was provided, record payment, invoice, and update room status inside transaction
            if ($deposit > 0) {
                if (!$txn) {
                    $txn = strtoupper($payMethod) . '-' . time() . '-' . rand(100, 999);
                }
                $pStmt = $conn->prepare("INSERT INTO payments (booking_id, amount, method, status, transaction_id, notes, paid_at) VALUES (?, ?, ?, 'completed', ?, ?, NOW())");
                if (!$pStmt) throw new RuntimeException($conn->error);
                $pStmt->bind_param('idsss', $newId, $deposit, $payMethod, $txn, $notes);
                if (!$pStmt->execute()) throw new RuntimeException($pStmt->error ?: 'Failed to record payment');

                $invCreated = FinancialService::createInvoiceForBooking(
                    $conn,
                    $newId,
                    $roomTotal,
                    $diningTotal,
                    0.0,
                    0.0,
                    $taxExempt,
                    $taxExemptReason,
                    $deposit,
                    date('Y-m-d'),
                    (int) $authUser['id'],
                    $authUser['role']
                );
                $balanceDue = $invCreated['balance_due'];
                $invStatus = $invCreated['invoice_status'];

                $gStmt = $conn->prepare("SELECT name, phone, email FROM users WHERE id = ?");
                if (!$gStmt) throw new RuntimeException($conn->error);
                $gStmt->bind_param('i', $customer_id);
                if (!$gStmt->execute()) throw new RuntimeException($gStmt->error ?: 'Failed to load customer details');
                $gUser = $gStmt->get_result()->fetch_assoc();
                $actualGuestName = $gUser['name'] ?? 'Valued Guest';

                if (!empty($room_id)) {
                    syncRoomStatus($conn, $room_id);
                }
            } else {
                $balanceDue = $total;
                if (!empty($room_id)) {
                    syncRoomStatus($conn, $room_id);
                }
            }

            // Record customer confirmation notification inside transaction
            $bookingLabel = $isDiningOnly ? 'Dining Only' : ('Room ' . ($room['room_number'] ?? ''));
            $msg = "Your booking for {$bookingLabel} has been created successfully.";
            $notif = $conn->prepare("INSERT INTO notifications (user_id,title,message,type) VALUES (?,'Booking Confirmed',?,'info')");
            if (!$notif) throw new RuntimeException($conn->error);
            $notif->bind_param('is', $customer_id, $msg);
            if (!$notif->execute()) throw new RuntimeException($notif->error ?: 'Failed to insert confirmation notification');

            $conn->commit();
        } catch (\Throwable $e) {
            $errno = $conn->errno ?: (int)$e->getCode();
            $conn->rollback();
            error_log('[Booking Create] Transaction failed and rolled back: ' . $e->getMessage());
            if ($errno === 1205 || $errno === 1213) {
                json_fail(409, 'Room is currently being reserved by another customer. Please try again.');
            }
            json_fail(500, 'Failed to process booking safely. Please try again.');
        }

        // Dispatch external notifications safely AFTER committing transaction and releasing row lock
        if ($deposit > 0) {
            try {
                if (!empty($room_id)) {
                    broadcastRoomOccupiedAlert(
                        $conn,
                        $newId,
                        $room_id,
                        $room['room_number'],
                        $actualGuestName,
                        $deposit,
                        $payMethod,
                        $check_in,
                        $check_out,
                        $balanceDue
                    );
                } else {
                    $feastAlert = "🍽️ New Dining-Only Feast (#{$newId}): {$actualGuestName} paid in full (ETB " . number_format($total, 2) . ") via {$payMethod}. No room needed.";
                    $allWorkers = $conn->query("SELECT id FROM users WHERE role IN ('admin', 'manager', 'receptionist')");
                    if ($allWorkers) {
                        while ($w = $allWorkers->fetch_assoc()) {
                            $nStmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Dining-Only Feast Paid in Full', ?, 'success')");
                            if ($nStmt) {
                                $nStmt->bind_param('is', $w['id'], $feastAlert);
                                $nStmt->execute();
                            }
                        }
                    }
                }

                dispatchPaymentNotification($conn, [
                    'booking_id' => $newId,
                    'customer_id' => $customer_id,
                    'amount' => $deposit,
                    'method' => $payMethod,
                    'transaction_id' => $txn,
                    'room_number' => $room['room_number'],
                    'guest_name' => $actualGuestName,
                    'guest_phone' => $gUser['phone'] ?? '',
                    'guest_email' => $gUser['email'] ?? ''
                ]);
            } catch (\Throwable $e) {
                error_log('[Booking Post-Commit Notification] Warning: ' . $e->getMessage());
            }
        }

        $actualRoomStatus = null;
        if (!empty($room_id)) {
            $rStatStmt = $conn->prepare("SELECT status FROM rooms WHERE id = ?");
            if ($rStatStmt) {
                $rStatStmt->bind_param('i', $room_id);
                if ($rStatStmt->execute()) {
                    $rStatRow = $rStatStmt->get_result()->fetch_assoc();
                    $actualRoomStatus = $rStatRow['status'] ?? null;
                }
            }
        }

        json_ok([
            'id' => $newId,
            'total_amount' => $total,
            'paid_amount' => $deposit,
            'balance_due' => round($balanceDue, 2),
            'customer_id' => $customer_id,
            'payment_status' => ($deposit >= $total ? 'paid' : ($deposit > 0 ? 'partially_paid' : 'pending')),
            'room_status' => $actualRoomStatus,
            'message' => 'Booking registered successfully.'
        ]);
        break;

    case 'PUT':
        requireRole($authUser, ['admin', 'manager', 'receptionist', 'customer'], 'Access denied: your role cannot modify bookings');
        if (!$id) {
            json_fail(400, 'Booking ID is required');
        }
        $existing = fetchBooking($conn, $id);
        if (!$existing) {
            json_fail(404, 'Booking not found');
        }
        $d = json_decode(file_get_contents('php://input'), true) ?: [];

        if ($authUser['role'] === 'customer') {
            if ((int) $existing['customer_id'] !== (int) $authUser['id']) {
                json_fail(403, 'Access denied');
            }
            $targetStatus = (string) ($d['status'] ?? '');
            if ($targetStatus !== 'cancelled') {
                json_fail(403, 'Customers can only cancel their own bookings');
            }
            $transition = BookingStateMachine::validateTransition($existing['status'], 'cancelled', ['is_action' => true]);
            if (!$transition['ok']) {
                json_fail($transition['code'], $transition['error']);
            }
            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("UPDATE bookings SET status='cancelled' WHERE id=?");
                $stmt->bind_param('i', $id);
                if (!$stmt->execute()) throw new RuntimeException($stmt->error ?: 'Failed to cancel booking');
                BookingStateMachine::recordTransition($conn, $id, $existing['status'], 'cancelled', (int) $authUser['id'], $authUser['role'], 'Cancelled by customer');
                syncRoomStatus($conn, (int) $existing['room_id']);
                $conn->commit();
            } catch (\Throwable $e) {
                $conn->rollback();
                json_fail(500, 'Failed to cancel booking safely');
            }
            json_ok(['message' => 'Booking cancelled']);
            break;
        }

        if (!in_array($authUser['role'], $staffRoles, true)) {
            json_fail(403, 'Access denied');
        }

        $oldRoom = (int) $existing['room_id'];
        $action = $d['action'] ?? ($_GET['action'] ?? '');
        $newStatus = $d['status'] ?? '';

        // Admin-only Restore Action for archived bookings
        if ($action === 'restore') {
            if ($authUser['role'] !== 'admin') {
                json_fail(403, 'Only administrators can restore archived bookings');
            }
            $res = SoftDeleteService::restoreBooking($conn, $id, (int) $authUser['id'], $authUser['role']);
            if (!$res['ok']) {
                json_fail($res['code'], $res['error']);
            }
            json_ok(['message' => $res['message']]);
            break;
        }

        if ($existing['deleted_at'] !== null) {
            json_fail(409, 'Archived bookings cannot be modified until restored by an administrator');
        }

        // Dedicated Check-In Action (transactional with room & booking row locks)
        if ($action === 'check_in' || $newStatus === 'checked_in') {
            $conn->query("SET SESSION innodb_lock_wait_timeout = 10");
            $conn->begin_transaction();
            try {
                if ($oldRoom > 0) {
                    $rLock = $conn->prepare("SELECT id, status FROM rooms WHERE id=? FOR UPDATE");
                    if (!$rLock) throw new RuntimeException($conn->error);
                    $rLock->bind_param('i', $oldRoom);
                    if (!$rLock->execute()) throw new RuntimeException($rLock->error ?: 'Failed to lock room');
                    $rRow = $rLock->get_result()->fetch_assoc();
                    if (!$rRow) {
                        $conn->rollback();
                        json_fail(400, 'Room not found');
                    }
                    if ($rRow['status'] === 'maintenance') {
                        $conn->rollback();
                        json_fail(400, 'Selected room is under maintenance');
                    }
                }

                $bLock = $conn->prepare("SELECT * FROM bookings WHERE id=? FOR UPDATE");
                if (!$bLock) throw new RuntimeException($conn->error);
                $bLock->bind_param('i', $id);
                if (!$bLock->execute()) throw new RuntimeException($bLock->error ?: 'Failed to lock booking');
                $lockedBooking = $bLock->get_result()->fetch_assoc();
                if (!$lockedBooking) {
                    $conn->rollback();
                    json_fail(404, 'Booking not found');
                }

                $payAmount = isset($d['payment_amount']) ? (float)$d['payment_amount'] : (isset($d['deposit_amount']) ? (float)$d['deposit_amount'] : 0);
                $existingPaid = BookingStateMachine::getCompletedPaidAmount($conn, $id);
                $transition = BookingStateMachine::validateTransition($lockedBooking['status'], 'checked_in', [
                    'is_action' => true,
                    'total_amount' => $lockedBooking['total_amount'],
                    'paid_amount' => $existingPaid,
                    'check_in_payment' => $payAmount,
                ]);
                if (!$transition['ok']) {
                    $conn->rollback();
                    json_fail($transition['code'], $transition['error']);
                }

                $stmt = $conn->prepare("UPDATE bookings SET status='checked_in' WHERE id=?");
                if (!$stmt) throw new RuntimeException($conn->error);
                $stmt->bind_param('i', $id);
                if (!$stmt->execute()) throw new RuntimeException($stmt->error ?: 'Failed to update booking status');
                BookingStateMachine::recordTransition($conn, $id, $lockedBooking['status'], 'checked_in', (int) $authUser['id'], $authUser['role'], 'Guest checked in');

                // Update room status to occupied via centralized service
                if ($oldRoom > 0) {
                    RoomStatusService::handleCheckIn($conn, $oldRoom);
                }

                // Load room number & guest name for notification & outbox
                $roomNum = 'Dining Only';
                if ($oldRoom > 0) {
                    $roomStmt = $conn->prepare("SELECT room_number FROM rooms WHERE id=?");
                    if (!$roomStmt) throw new RuntimeException($conn->error);
                    $roomStmt->bind_param('i', $oldRoom);
                    if (!$roomStmt->execute()) throw new RuntimeException($roomStmt->error ?: 'Failed to load room number');
                    $roomNum = $roomStmt->get_result()->fetch_assoc()['room_number'] ?? 'Dining Only';
                }
                $cId = (int) $lockedBooking['customer_id'];

                // Record check-in deposit or payment if provided
                if ($payAmount < 0) {
                    $conn->rollback();
                    json_fail(400, 'Payment amount cannot be negative.');
                }
                if ($payAmount > 0) {
                    $payMethod = trim($d['payment_method'] ?? ($d['method'] ?? 'cash'));
                    $txn = trim($d['transaction_id'] ?? '');
                    $notes = trim($d['notes'] ?? 'Check-in payment / deposit');
                    $statusPay = 'completed';
                    $pStmt = $conn->prepare("INSERT INTO payments (booking_id, amount, method, status, transaction_id, notes, paid_at) VALUES (?, ?, ?, ?, ?, ?, NOW())");
                    if (!$pStmt) throw new RuntimeException($conn->error);
                    $pStmt->bind_param('idssss', $id, $payAmount, $payMethod, $statusPay, $txn, $notes);
                    if (!$pStmt->execute()) throw new RuntimeException($pStmt->error ?: 'Failed to record check-in payment');

                    NotificationOutbox::enqueue($conn, 'payment', $id, [
                        'booking_id' => $id,
                        'customer_id' => $cId,
                        'amount' => $payAmount,
                        'method' => $payMethod,
                        'transaction_id' => $txn,
                        'room_number' => $roomNum,
                    ]);
                }

                $msg = $oldRoom > 0
                    ? "Welcome! You have checked in to Room " . $roomNum . ". Enjoy your stay!"
                    : "Welcome! Your Dining Only booking has been checked in. Enjoy your meal!";
                $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Checked In Successfully', ?, 'success')");
                if (!$notif) throw new RuntimeException($conn->error);
                $notif->bind_param('is', $cId, $msg);
                if (!$notif->execute()) throw new RuntimeException($notif->error ?: 'Failed to record check-in notification');

                $conn->commit();
            } catch (\Throwable $e) {
                $errno = $conn->errno ?: (int)$e->getCode();
                $conn->rollback();
                error_log('[Booking Check-In] Transaction rolled back: ' . $e->getMessage());
                if ($errno === 1205 || $errno === 1213) {
                    json_fail(409, 'Booking is currently being updated by another request. Please try again.');
                }
                json_fail(500, 'Failed to check in guest safely. Please try again.');
            }

            // Safely dispatch outbox notifications after commit; never rolls back committed DB state
            NotificationOutbox::dispatchForBooking($conn, $id);

            json_ok(['message' => 'Guest successfully checked in. Room marked as occupied.']);
            break;
        }

        // Dedicated Check-Out Action (transactional)
        if ($action === 'check_out' || $newStatus === 'checked_out') {
            $conn->query("SET SESSION innodb_lock_wait_timeout = 10");
            $conn->begin_transaction();
            try {
                if ($oldRoom > 0) {
                    $rLock = $conn->prepare("SELECT id FROM rooms WHERE id=? FOR UPDATE");
                    if (!$rLock) throw new RuntimeException($conn->error);
                    $rLock->bind_param('i', $oldRoom);
                    if (!$rLock->execute()) throw new RuntimeException($rLock->error ?: 'Failed to lock room');
                    $rLock->get_result()->fetch_assoc();
                    $rLock->close();
                }

                $bLock = $conn->prepare("SELECT * FROM bookings WHERE id=? FOR UPDATE");
                if (!$bLock) throw new RuntimeException($conn->error);
                $bLock->bind_param('i', $id);
                if (!$bLock->execute()) throw new RuntimeException($bLock->error ?: 'Failed to lock booking');
                $lockedBooking = $bLock->get_result()->fetch_assoc();
                if (!$lockedBooking) {
                    $conn->rollback();
                    json_fail(404, 'Booking not found');
                }

                $transition = BookingStateMachine::validateTransition($lockedBooking['status'], 'checked_out', [
                    'is_action' => true,
                ]);
                if (!$transition['ok']) {
                    $conn->rollback();
                    json_fail($transition['code'], $transition['error']);
                }

                $stmt = $conn->prepare("UPDATE bookings SET status='checked_out' WHERE id=?");
                if (!$stmt) throw new RuntimeException($conn->error);
                $stmt->bind_param('i', $id);
                if (!$stmt->execute()) throw new RuntimeException($stmt->error ?: 'Failed to update booking status');
                BookingStateMachine::recordTransition($conn, $id, $lockedBooking['status'], 'checked_out', (int) $authUser['id'], $authUser['role'], 'Guest checked out');

                // Load room number & guest name for checkout housekeeping task and notification
                $roomNum = 'Dining Only';
                if ($oldRoom > 0) {
                    $roomStmt = $conn->prepare("SELECT room_number FROM rooms WHERE id=?");
                    if (!$roomStmt) throw new RuntimeException($conn->error);
                    $roomStmt->bind_param('i', $oldRoom);
                    if (!$roomStmt->execute()) throw new RuntimeException($roomStmt->error ?: 'Failed to load room number');
                    $roomNum = $roomStmt->get_result()->fetch_assoc()['room_number'] ?? 'Dining Only';
                }
                $cId = (int) $lockedBooking['customer_id'];
                $guestName = '';
                if ($cId > 0) {
                    $gStmt = $conn->prepare("SELECT name FROM users WHERE id=?");
                    if ($gStmt) {
                        $gStmt->bind_param('i', $cId);
                        if ($gStmt->execute()) {
                            $guestName = $gStmt->get_result()->fetch_assoc()['name'] ?? '';
                        }
                    }
                }

                // Transition room status & auto-create housekeeping task via centralized service
                $checkoutInfo = ['room_status' => null, 'housekeeping_task_id' => null];
                if ($oldRoom > 0) {
                    $checkoutInfo = RoomStatusService::handleCheckout($conn, $oldRoom, $id, $roomNum, $guestName);
                }

                // Record settlement payment if provided
                $payAmount = isset($d['payment_amount']) ? (float)$d['payment_amount'] : 0;
                if ($payAmount < 0) {
                    $conn->rollback();
                    json_fail(400, 'Payment amount cannot be negative.');
                }
                if ($payAmount > 0) {
                    $payMethod = trim($d['payment_method'] ?? ($d['method'] ?? 'cash'));
                    $txn = trim($d['transaction_id'] ?? '');
                    $notes = trim($d['notes'] ?? 'Check-out settlement payment');
                    $statusPay = 'completed';
                    $pStmt = $conn->prepare("INSERT INTO payments (booking_id, amount, method, status, transaction_id, notes, paid_at) VALUES (?, ?, ?, ?, ?, ?, NOW())");
                    if (!$pStmt) throw new RuntimeException($conn->error);
                    $pStmt->bind_param('idssss', $id, $payAmount, $payMethod, $statusPay, $txn, $notes);
                    if (!$pStmt->execute()) throw new RuntimeException($pStmt->error ?: 'Failed to record settlement payment');

                    NotificationOutbox::enqueue($conn, 'payment', $id, [
                        'booking_id' => $id,
                        'customer_id' => $cId,
                        'amount' => $payAmount,
                        'method' => $payMethod,
                        'transaction_id' => $txn,
                        'room_number' => $roomNum,
                        'guest_name' => $guestName,
                    ]);
                }

                // Calculate authoritative payments & finalize invoice via FinancialService
                $totalPaid = FinancialService::getCompletedPaidAmount($conn, $id);
                $invoiceInfo = FinancialService::finalizeCheckoutInvoice(
                    $conn,
                    $id,
                    (float) $lockedBooking['total_amount'],
                    $totalPaid
                );

                // Send notification to guest
                $msg = $oldRoom > 0
                    ? "You have checked out of Room " . $roomNum . ". Thank you for staying with us!"
                    : "Your Dining Only booking has been checked out. Thank you for dining with us!";
                $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Checked Out', ?, 'info')");
                if (!$notif) throw new RuntimeException($conn->error);
                $notif->bind_param('is', $cId, $msg);
                if (!$notif->execute()) throw new RuntimeException($notif->error ?: 'Failed to create check-out notification');

                $conn->commit();
            } catch (\Throwable $e) {
                $errno = $conn->errno ?: (int)$e->getCode();
                $conn->rollback();
                error_log('[Booking Check-Out] Transaction rolled back: ' . $e->getMessage());
                if ($errno === 1205 || $errno === 1213) {
                    json_fail(409, 'Booking is currently being updated by another request. Please try again.');
                }
                json_fail(500, 'Failed to check out guest safely. Please try again.');
            }

            // Safely dispatch outbox notifications after commit; never rolls back committed DB state
            NotificationOutbox::dispatchForBooking($conn, $id);

            json_ok([
                'message' => 'Guest checked out successfully. Room sent to housekeeping (Cleaning).',
                'room_status' => $checkoutInfo['room_status'],
                'housekeeping_task_id' => $checkoutInfo['housekeeping_task_id'],
                'invoice_number' => $invoiceInfo['invoice_number'],
                'final_total' => $invoiceInfo['final_total'],
                'paid_amount' => $invoiceInfo['paid_amount'],
                'balance_due' => $invoiceInfo['balance_due'],
                'invoice_status' => $invoiceInfo['invoice_status'],
            ]);
            break;
        }

        // Full Booking Edit or dates/room change (transactional with deterministic room & booking row locks)
        $editFinancialSummary = null;
        if (isset($d['check_in']) || isset($d['check_out']) || isset($d['room_id'])) {
            $new_room_id = (int) ($d['room_id'] ?? $oldRoom);
            $customer_id = isset($d['guest_id']) ? (int) $d['guest_id'] : (isset($d['customer_id']) ? (int) $d['customer_id'] : (int) $existing['customer_id']);
            $check_in = $d['check_in'] ?? $existing['check_in'];
            $check_out = $d['check_out'] ?? $existing['check_out'];
            if (!strtotime($check_in) || !strtotime($check_out) || strtotime($check_out) <= strtotime($check_in)) {
                json_fail(400, 'Check-out must be after check-in');
            }

            $conn->query("SET SESSION innodb_lock_wait_timeout = 10");
            $conn->begin_transaction();
            try {
                // Lock rooms in ascending ID order to prevent deadlocks on room swaps
                $lockRoomIds = array_values(array_unique(array_filter([$oldRoom, $new_room_id])));
                sort($lockRoomIds, SORT_NUMERIC);
                $roomData = null;
                foreach ($lockRoomIds as $lockRid) {
                    $stmt2 = $conn->prepare("SELECT id, price_per_night, status, max_guests, room_number FROM rooms WHERE id=? FOR UPDATE");
                    if (!$stmt2) throw new RuntimeException($conn->error);
                    $stmt2->bind_param('i', $lockRid);
                    if (!$stmt2->execute()) throw new RuntimeException($stmt2->error ?: 'Failed to lock room');
                    $rowLocked = $stmt2->get_result()->fetch_assoc();
                    if ($lockRid === $new_room_id) {
                        $roomData = $rowLocked;
                    }
                }

                if (!$roomData) {
                    $conn->rollback();
                    json_fail(400, 'Room not found');
                }
                if ($roomData['status'] === 'maintenance') {
                    $conn->rollback();
                    json_fail(400, 'Selected room is under maintenance');
                }

                // Lock the booking row being edited to serialize simultaneous edits on the same booking
                $bLock = $conn->prepare("SELECT * FROM bookings WHERE id=? FOR UPDATE");
                if (!$bLock) throw new RuntimeException($conn->error);
                $bLock->bind_param('i', $id);
                if (!$bLock->execute()) throw new RuntimeException($bLock->error ?: 'Failed to lock booking');
                $lockedExisting = $bLock->get_result()->fetch_assoc();
                if (!$lockedExisting) {
                    $conn->rollback();
                    json_fail(404, 'Booking not found');
                }
                $lockedOldRoom = (int) $lockedExisting['room_id'];

                $status = $d['status'] ?? $lockedExisting['status'];
                if ($status !== $lockedExisting['status']) {
                    $existingPaid = BookingStateMachine::getCompletedPaidAmount($conn, $id);
                    $transition = BookingStateMachine::validateTransition($lockedExisting['status'], $status, [
                        'total_amount' => $lockedExisting['total_amount'],
                        'paid_amount' => $existingPaid,
                    ]);
                    if (!$transition['ok']) {
                        $conn->rollback();
                        json_fail($transition['code'], $transition['error']);
                    }
                }
                if (in_array($status, ['pending', 'confirmed', 'checked_in'], true)) {
                    if (roomHasOverlap($conn, $new_room_id, $check_in, $check_out, $id, true)) {
                        $conn->rollback();
                        json_fail(409, 'Room is already booked for those dates');
                    }
                }

                $adults = (int) ($d['adults'] ?? $lockedExisting['adults']);
                $children = (int) ($d['children'] ?? $lockedExisting['children']);
                $totalGuests = max(1, $adults + $children);
                $maxCapacity = (int) ($roomData['max_guests'] ?? 2);
                if ($totalGuests > $maxCapacity) {
                    $conn->rollback();
                    json_fail(400, "The number of guests ($totalGuests) exceeds Room {$roomData['room_number']}'s maximum capacity of $maxCapacity guests.");
                }
                $nights = max(1, (strtotime($check_out) - strtotime($check_in)) / 86400);
                $roomChargesEdit = ($new_room_id > 0) ? round((float) $roomData['price_per_night'] * $nights, 2) : 0.0;
                $editFinancialSummary = FinancialService::recalculateBookingAndInvoice($conn, $id, $roomChargesEdit);
                $total = $editFinancialSummary['total'];
                $special = $d['special_requests'] ?? $lockedExisting['special_requests'];

                $stmt = $conn->prepare("UPDATE bookings SET customer_id=?,room_id=?,check_in=?,check_out=?,adults=?,children=?,special_requests=?,total_amount=?,status=? WHERE id=?");
                if (!$stmt) throw new RuntimeException($conn->error);
                $stmt->bind_param('iissiisdsi', $customer_id, $new_room_id, $check_in, $check_out, $adults, $children, $special, $total, $status, $id);
                if (!$stmt->execute()) throw new RuntimeException($stmt->error ?: 'Failed to update booking');
                BookingStateMachine::recordTransition($conn, $id, $lockedExisting['status'], $status, (int) $authUser['id'], $authUser['role'], 'Booking updated');

                if ($new_room_id !== $lockedOldRoom && $lockedOldRoom > 0) {
                    syncRoomStatus($conn, $lockedOldRoom);
                }
                syncRoomStatus($conn, $new_room_id);
                $conn->commit();
            } catch (\Throwable $e) {
                $errno = $conn->errno ?: (int)$e->getCode();
                $conn->rollback();
                error_log('[Booking PUT] Transaction failed and rolled back: ' . $e->getMessage());
                if ($errno === 1205 || $errno === 1213) {
                    json_fail(409, 'Room or booking is currently being updated by another request. Please try again.');
                }
                json_fail(500, 'Failed to update booking safely. Please try again.');
            }
        } else {
            // Status-only update (e.g. cancelled -> confirmed reactivation must check overlap under lock)
            $conn->query("SET SESSION innodb_lock_wait_timeout = 10");
            $conn->begin_transaction();
            try {
                if ($oldRoom > 0) {
                    $rLock = $conn->prepare("SELECT id, status FROM rooms WHERE id=? FOR UPDATE");
                    if (!$rLock) throw new RuntimeException($conn->error);
                    $rLock->bind_param('i', $oldRoom);
                    if (!$rLock->execute()) throw new RuntimeException($rLock->error ?: 'Failed to lock room');
                    $rLock->get_result()->fetch_assoc();
                    $rLock->close();
                }

                $bLock = $conn->prepare("SELECT * FROM bookings WHERE id=? FOR UPDATE");
                if (!$bLock) throw new RuntimeException($conn->error);
                $bLock->bind_param('i', $id);
                if (!$bLock->execute()) throw new RuntimeException($bLock->error ?: 'Failed to lock booking');
                $lockedExisting = $bLock->get_result()->fetch_assoc();
                if (!$lockedExisting) {
                    $conn->rollback();
                    json_fail(404, 'Booking not found');
                }

                $status = $d['status'] ?? $lockedExisting['status'];
                $existingPaid = BookingStateMachine::getCompletedPaidAmount($conn, $id);
                $transition = BookingStateMachine::validateTransition($lockedExisting['status'], $status, [
                    'total_amount' => $lockedExisting['total_amount'],
                    'paid_amount' => $existingPaid,
                ]);
                if (!$transition['ok']) {
                    $conn->rollback();
                    json_fail($transition['code'], $transition['error']);
                }

                $wasInactive = in_array($lockedExisting['status'], ['cancelled', 'checked_out'], true);
                $becomesActive = in_array($status, ['pending', 'confirmed', 'checked_in'], true);

                if ($oldRoom > 0 && $wasInactive && $becomesActive) {
                    if (roomHasOverlap($conn, $oldRoom, $lockedExisting['check_in'], $lockedExisting['check_out'], $id, true)) {
                        $conn->rollback();
                        json_fail(409, 'Room is already booked for those dates');
                    }
                }

                $adults = isset($d['adults']) ? max(1, (int) $d['adults']) : (int) $lockedExisting['adults'];
                $children = isset($d['children']) ? max(0, (int) $d['children']) : (int) $lockedExisting['children'];
                $special = array_key_exists('special_requests', $d) ? (string) $d['special_requests'] : $lockedExisting['special_requests'];

                $stmt = $conn->prepare("UPDATE bookings SET adults=?, children=?, special_requests=?, status=? WHERE id=?");
                if (!$stmt) throw new RuntimeException($conn->error);
                $stmt->bind_param('iissi', $adults, $children, $special, $status, $id);
                if (!$stmt->execute()) throw new RuntimeException($stmt->error ?: 'Failed to update booking status');
                BookingStateMachine::recordTransition($conn, $id, $lockedExisting['status'], $status, (int) $authUser['id'], $authUser['role'], 'Booking updated');
                syncRoomStatus($conn, $oldRoom);
                $conn->commit();
                $editFinancialSummary = FinancialService::getBookingSummary($conn, $id, (float) $lockedExisting['total_amount']);
            } catch (\Throwable $e) {
                $errno = $conn->errno ?: (int)$e->getCode();
                $conn->rollback();
                error_log('[Booking PUT Status] Transaction failed and rolled back: ' . $e->getMessage());
                if ($errno === 1205 || $errno === 1213) {
                    json_fail(409, 'Room or booking is currently being updated by another request. Please try again.');
                }
                json_fail(500, 'Failed to update booking status safely. Please try again.');
            }
        }
        json_ok(array_merge(['message' => 'Booking updated'], $editFinancialSummary ? ['financial' => $editFinancialSummary] : []));
        break;

    case 'DELETE':
        authenticate(['admin', 'manager']);
        if (!$id) {
            json_fail(400, 'Booking ID is required');
        }
        $res = SoftDeleteService::softDeleteBooking($conn, $id, (int) $authUser['id'], $authUser['role']);
        if (!$res['ok']) {
            json_fail($res['code'], $res['error']);
        }
        json_ok(['message' => $res['message']]);
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

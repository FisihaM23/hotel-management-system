<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';
require_once '../config/notifications.php';

$authUser = authenticate();
$conn = getConnection();
$conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS reason_for_stay VARCHAR(100) DEFAULT 'Tourism / Leisure'");
$conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS id_proof VARCHAR(50) DEFAULT 'National ID'");
$conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS id_number VARCHAR(100) DEFAULT ''");

$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;
$mine = isset($_GET['mine']);
$staffRoles = ['admin', 'manager', 'receptionist'];

$baseQuery = "SELECT b.*, u.name as guest_name, u.email as guest_email, u.phone as guest_phone,
              u.reason_for_stay, u.id_proof, u.id_number,
              r.room_number, r.type as room_type, r.price_per_night,
              COALESCE(pay.paid_amount, 0) as paid_amount,
              ROUND(GREATEST(0, b.total_amount - COALESCE(pay.paid_amount, 0)), 2) as balance_amount
              FROM bookings b
              JOIN users u ON b.customer_id = u.id
              JOIN rooms r ON b.room_id = r.id
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

        // Dues endpoint for staff workers
        if (isset($_GET['due_only']) || isset($_GET['dues'])) {
            if (!in_array($authUser['role'], $allStaffRoles, true)) {
                json_fail(403, 'Access denied');
            }
            $dueSql = "$baseQuery 
                       WHERE b.status NOT IN ('cancelled', 'checked_out')
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
            $stmt = $conn->prepare("$baseQuery WHERE b.customer_id=? ORDER BY b.created_at DESC");
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
        if ($id) {
            $stmt = $conn->prepare("$baseQuery WHERE b.id=?");
            $stmt->bind_param('i', $id);
            $stmt->execute();
            json_ok($stmt->get_result()->fetch_assoc());
        } else {
            $status = $_GET['status'] ?? null;
            if ($status) {
                $stmt = $conn->prepare("$baseQuery WHERE b.status=? ORDER BY b.created_at DESC");
                $stmt->bind_param('s', $status);
                $stmt->execute();
                json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
            } else {
                json_ok($conn->query("$baseQuery ORDER BY b.created_at DESC")->fetch_all(MYSQLI_ASSOC));
            }
        }
        break;

    case 'POST':
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $customer_id = isset($d['customer_id']) ? (int) $d['customer_id'] : (isset($d['guest_id']) ? (int) $d['guest_id'] : 0);

        if ($authUser['role'] === 'customer') {
            $customer_id = (int) $authUser['id'];
        } elseif (!in_array($authUser['role'], $staffRoles, true)) {
            json_fail(403, 'Access denied');
        }

        // Automatic Guest Registration based on Hotel Registration Format Rule
        if (!$customer_id) {
            $guestName = trim($d['name'] ?? ($d['guest_name'] ?? ''));
            $guestEmail = trim($d['email'] ?? ($d['guest_email'] ?? ''));
            $guestPhone = trim($d['phone'] ?? ($d['guest_phone'] ?? ''));
            $reasonForStay = trim($d['reason_for_stay'] ?? 'Tourism / Leisure');
            $idProof = trim($d['id_proof'] ?? 'National ID');
            $idNumber = trim($d['id_number'] ?? '');
            $address = trim($d['address'] ?? '');

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

            // Check if guest with this email already exists
            $findStmt = $conn->prepare("SELECT id FROM users WHERE email = ?");
            $findStmt->bind_param('s', $guestEmail);
            $findStmt->execute();
            $existingGuest = $findStmt->get_result()->fetch_assoc();

            if ($existingGuest) {
                $customer_id = (int) $existingGuest['id'];
                $updGuest = $conn->prepare("UPDATE users SET name=?, phone=?, reason_for_stay=?, id_proof=?, id_number=?, address=? WHERE id=?");
                $updGuest->bind_param('ssssssi', $guestName, $guestPhone, $reasonForStay, $idProof, $idNumber, $address, $customer_id);
                $updGuest->execute();
            } else {
                $pwdHash = password_hash(DEMO_PASSWORD, PASSWORD_DEFAULT);
                $insGuest = $conn->prepare("INSERT INTO users (name, email, password, role, phone, address, reason_for_stay, id_proof, id_number) VALUES (?, ?, ?, 'customer', ?, ?, ?, ?, ?)");
                $insGuest->bind_param('ssssssss', $guestName, $guestEmail, $pwdHash, $guestPhone, $address, $reasonForStay, $idProof, $idNumber);
                executeOrFail($insGuest, $conn);
                $customer_id = $conn->insert_id;
            }
        } else {
            // Update existing guest's registration details if provided during booking
            $reasonForStay = trim($d['reason_for_stay'] ?? '');
            $idProof = trim($d['id_proof'] ?? '');
            $idNumber = trim($d['id_number'] ?? '');
            $guestPhone = trim($d['phone'] ?? ($d['guest_phone'] ?? ''));
            $guestName = trim($d['name'] ?? ($d['guest_name'] ?? ''));

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
                $uStmt->bind_param($types, ...$params);
                $uStmt->execute();
            }
        }

        $room_id = (int) ($d['room_id'] ?? 0);
        $check_in = $d['check_in'] ?? '';
        $check_out = $d['check_out'] ?? '';
        if (!$room_id || !$check_in || !$check_out || strtotime($check_out) <= strtotime($check_in)) {
            json_fail(400, 'Valid room, check-in and check-out dates are required');
        }

        $stmt = $conn->prepare("SELECT room_number, price_per_night, status FROM rooms WHERE id=?");
        $stmt->bind_param('i', $room_id);
        $stmt->execute();
        $room = $stmt->get_result()->fetch_assoc();
        if (!$room) {
            json_fail(400, 'Room not found');
        }
        if ($room['status'] === 'maintenance') {
            json_fail(400, 'Selected room is under maintenance');
        }
        if (roomHasOverlap($conn, $room_id, $check_in, $check_out)) {
            json_fail(409, 'Room is already booked for those dates. Please select an available room.');
        }

        $nights = max(1, (strtotime($check_out) - strtotime($check_in)) / 86400);
        $roomTotal = (float) $room['price_per_night'] * $nights;

        // Process Pre-Ordered Dining & Bar Items
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
                $mStmt->bind_param('i', $itemId);
                $mStmt->execute();
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

        $total = $roomTotal + $diningTotal;
        $recep = $authUser['role'] !== 'customer' ? $authUser['id'] : null;
        $special = trim($d['special_requests'] ?? '');
        if ($diningTotal > 0 && !empty($cleanDiningItems)) {
            $deliveryPref = $d['dining_delivery_time'] ?? 'On arrival / Check-in';
            $diningNote = "[Pre-ordered Dining & Bar: ETB " . number_format($diningTotal, 2) . " (" . count($cleanDiningItems) . " items) - Preference: " . $deliveryPref . "]";
            $special = $special ? ($special . "\n" . $diningNote) : $diningNote;
        }

        // Payment Processing & Requirement Check
        $deposit = isset($d['payment_amount']) ? (float)$d['payment_amount'] : (isset($d['deposit_amount']) ? (float)$d['deposit_amount'] : 0);
        $payMethod = trim($d['payment_method'] ?? ($d['method'] ?? ''));
        $txn = trim($d['transaction_id'] ?? ($d['tx_ref'] ?? ''));
        $notes = trim($d['notes'] ?? ($d['payment_notes'] ?? 'Direct Payment to Admin Account (0932338138 - Mulugeta Fisiha)'));

        // Customer booking strictly requires payment before saving registration
        if ($authUser['role'] === 'customer') {
            if ($deposit <= 0) {
                $deposit = $total;
            }
            if (empty($payMethod)) {
                json_fail(400, 'Payment is required before booking registration can be saved. Please select a payment method.');
            }
        }

        $status = ($deposit > 0) ? 'confirmed' : 'pending';
        if (in_array($authUser['role'], $staffRoles, true) && !empty($d['status'])) {
            $allowed = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'];
            if (in_array($d['status'], $allowed, true)) {
                $status = $d['status'];
            }
        }
        $adults = (int) ($d['adults'] ?? 1);
        $children = (int) ($d['children'] ?? 0);

        $stmt = $conn->prepare("INSERT INTO bookings (customer_id,room_id,receptionist_id,check_in,check_out,adults,children,special_requests,total_amount,status) VALUES (?,?,?,?,?,?,?,?,?,?)");
        $stmt->bind_param('iiissiisds', $customer_id, $room_id, $recep, $check_in, $check_out, $adults, $children, $special, $total, $status);
        executeOrFail($stmt, $conn);
        $newId = $conn->insert_id;

        // If dining items were pre-ordered, automatically create an order in dining_orders
        if ($diningTotal > 0 && !empty($cleanDiningItems)) {
            $order_num = 'ORD-' . date('Y') . '-' . strtoupper(substr(uniqid(), -6));
            $itemsJson = json_encode($cleanDiningItems);
            $deliveryType = 'room_service';
            $orderStatus = 'pending';
            $paymentStatus = ($deposit >= $total) ? 'paid' : ($deposit > 0 ? 'partially_paid' : 'charged_to_room');
            $diningNotes = 'Pre-ordered with Booking #' . $newId . ' (Time: ' . ($d['dining_delivery_time'] ?? 'On arrival') . '). ' . ($d['dining_notes'] ?? '');
            
            $dStmt = $conn->prepare("INSERT INTO dining_orders (order_number, customer_id, room_number, items, total_amount, delivery_type, status, payment_status, special_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $dStmt->bind_param('sisdsssss', $order_num, $customer_id, $room['room_number'], $itemsJson, $diningTotal, $deliveryType, $orderStatus, $paymentStatus, $diningNotes);
            $dStmt->execute();
        }

        // If payment was provided, record payment, mark invoice paid, set room to OCCUPIED, and notify ALL workers!
        if ($deposit > 0) {
            if (!$txn) {
                $txn = strtoupper($payMethod) . '-' . time() . '-' . rand(100, 999);
            }
            $pStmt = $conn->prepare("INSERT INTO payments (booking_id, amount, method, status, transaction_id, notes, paid_at) VALUES (?, ?, ?, 'completed', ?, ?, NOW())");
            $pStmt->bind_param('idsss', $newId, $deposit, $payMethod, $txn, $notes);
            $pStmt->execute();

            $balanceDue = max(0, $total - $deposit);
            $invStatus = ($balanceDue <= 0.01) ? 'paid' : 'sent';

            // Create invoice record
            $invNumber = 'INV-' . date('Y') . '-' . strtoupper(substr(uniqid(), -6));
            $invSub = $total;
            $invStmt = $conn->prepare("INSERT INTO invoices (booking_id, invoice_number, subtotal, tax, discount, total, status, due_date) VALUES (?, ?, ?, 0, 0, ?, ?, CURDATE())");
            $invStmt->bind_param('isdds', $newId, $invNumber, $invSub, $total, $invStatus);
            $invStmt->execute();

            // Mark room status to OCCUPIED!
            $rUpd = $conn->prepare("UPDATE rooms SET status='occupied' WHERE id=?");
            $rUpd->bind_param('i', $room_id);
            $rUpd->execute();

            // Look up guest details for broadcast
            $gStmt = $conn->prepare("SELECT name, phone, email FROM users WHERE id = ?");
            $gStmt->bind_param('i', $customer_id);
            $gStmt->execute();
            $gUser = $gStmt->get_result()->fetch_assoc();
            $actualGuestName = $gUser['name'] ?? 'Valued Guest';

            // Broadcast room occupied alert to ALL hotel workers (admin, manager, receptionist, housekeeping, maintenance)
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

            // Multi-channel payment confirmation notification (SMS to 0932338138, customer, email, telegram)
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
        } else {
            $balanceDue = $total;
            if ($status === 'checked_in') {
                $rUpd = $conn->prepare("UPDATE rooms SET status='occupied' WHERE id=?");
                $rUpd->bind_param('i', $room_id);
                $rUpd->execute();
            } else {
                syncRoomStatus($conn, $room_id);
            }
        }

        $msg = "Your booking for Room " . $room['room_number'] . " has been created successfully.";
        $notif = $conn->prepare("INSERT INTO notifications (user_id,title,message,type) VALUES (?,'Booking Confirmed',?,'info')");
        $notif->bind_param('is', $customer_id, $msg);
        $notif->execute();

        json_ok([
            'id' => $newId,
            'total_amount' => $total,
            'paid_amount' => $deposit,
            'balance_due' => round($balanceDue, 2),
            'customer_id' => $customer_id,
            'payment_status' => ($deposit >= $total ? 'paid' : ($deposit > 0 ? 'partially_paid' : 'pending')),
            'room_status' => ($deposit > 0 ? 'occupied' : 'available'),
            'message' => 'Booking registered successfully. Payment recorded, room set to OCCUPIED, and staff notified of due balance.'
        ]);
        break;

    case 'PUT':
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
            if (($d['status'] ?? '') !== 'cancelled' || !in_array($existing['status'], ['pending', 'confirmed'], true)) {
                json_fail(403, 'You can only cancel your own pending or confirmed bookings');
            }
            $stmt = $conn->prepare("UPDATE bookings SET status='cancelled' WHERE id=?");
            $stmt->bind_param('i', $id);
            executeOrFail($stmt, $conn);
            syncRoomStatus($conn, (int) $existing['room_id']);
            json_ok(['message' => 'Booking cancelled']);
            break;
        }

        if (!in_array($authUser['role'], $staffRoles, true)) {
            json_fail(403, 'Access denied');
        }

        $oldRoom = (int) $existing['room_id'];
        $action = $d['action'] ?? '';
        $newStatus = $d['status'] ?? '';

        // Dedicated Check-In Action
        if ($action === 'check_in' || $newStatus === 'checked_in') {
            $stmt = $conn->prepare("UPDATE bookings SET status='checked_in' WHERE id=?");
            $stmt->bind_param('i', $id);
            executeOrFail($stmt, $conn);

            // Update room status to occupied
            $roomUpd = $conn->prepare("UPDATE rooms SET status='occupied' WHERE id=?");
            $roomUpd->bind_param('i', $oldRoom);
            $roomUpd->execute();

            // Record check-in deposit or payment if provided
            $payAmount = isset($d['payment_amount']) ? (float)$d['payment_amount'] : (isset($d['deposit_amount']) ? (float)$d['deposit_amount'] : 0);
            if ($payAmount > 0) {
                $payMethod = trim($d['payment_method'] ?? ($d['method'] ?? 'cash'));
                $txn = trim($d['transaction_id'] ?? '');
                $notes = trim($d['notes'] ?? 'Check-in payment / deposit');
                $statusPay = 'completed';
                $pStmt = $conn->prepare("INSERT INTO payments (booking_id, amount, method, status, transaction_id, notes) VALUES (?, ?, ?, ?, ?, ?)");
                $pStmt->bind_param('idssss', $id, $payAmount, $payMethod, $statusPay, $txn, $notes);
                $pStmt->execute();
            }

            // Send notification to guest
            $roomStmt = $conn->prepare("SELECT room_number FROM rooms WHERE id=?");
            $roomStmt->bind_param('i', $oldRoom);
            $roomStmt->execute();
            $roomNum = $roomStmt->get_result()->fetch_assoc()['room_number'] ?? '';
            $msg = "Welcome! You have checked in to Room " . $roomNum . ". Enjoy your stay!";
            $cId = (int) $existing['customer_id'];
            $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Checked In Successfully', ?, 'success')");
            $notif->bind_param('is', $cId, $msg);
            $notif->execute();

            json_ok(['message' => 'Guest successfully checked in. Room marked as occupied.']);
            break;
        }

        // Dedicated Check-Out Action
        if ($action === 'check_out' || $newStatus === 'checked_out') {
            $stmt = $conn->prepare("UPDATE bookings SET status='checked_out' WHERE id=?");
            $stmt->bind_param('i', $id);
            executeOrFail($stmt, $conn);

            // Update room status to cleaning
            $roomUpd = $conn->prepare("UPDATE rooms SET status='cleaning' WHERE id=?");
            $roomUpd->bind_param('i', $oldRoom);
            $roomUpd->execute();

            // Record settlement payment if provided
            $payAmount = isset($d['payment_amount']) ? (float)$d['payment_amount'] : 0;
            if ($payAmount > 0) {
                $payMethod = trim($d['payment_method'] ?? ($d['method'] ?? 'cash'));
                $txn = trim($d['transaction_id'] ?? '');
                $notes = trim($d['notes'] ?? 'Check-out settlement payment');
                $statusPay = 'completed';
                $pStmt = $conn->prepare("INSERT INTO payments (booking_id, amount, method, status, transaction_id, notes) VALUES (?, ?, ?, ?, ?, ?)");
                $pStmt->bind_param('idssss', $id, $payAmount, $payMethod, $statusPay, $txn, $notes);
                $pStmt->execute();
            }

            // Sync or create invoice marked as paid
            $invCheck = $conn->prepare("SELECT id FROM invoices WHERE booking_id = ?");
            $invCheck->bind_param('i', $id);
            $invCheck->execute();
            $existingInv = $invCheck->get_result()->fetch_assoc();
            if ($existingInv) {
                $updInv = $conn->prepare("UPDATE invoices SET status='paid' WHERE id=?");
                $updInv->bind_param('i', $existingInv['id']);
                $updInv->execute();
            } else {
                $subtotal = (float) $existing['total_amount'];
                $tax = round($subtotal * 0.10, 2);
                $totalInv = $subtotal + $tax;
                $invNum = 'INV-' . date('Y') . '-' . strtoupper(uniqid());
                $dueDate = date('Y-m-d');
                $invStatus = 'paid';
                $insInv = $conn->prepare("INSERT INTO invoices (booking_id, invoice_number, subtotal, tax, discount, total, status, due_date) VALUES (?, ?, ?, ?, 0.00, ?, ?, ?)");
                $insInv->bind_param('isdddss', $id, $invNum, $subtotal, $tax, $totalInv, $invStatus, $dueDate);
                $insInv->execute();
            }

            // Send notification to guest
            $roomStmt = $conn->prepare("SELECT room_number FROM rooms WHERE id=?");
            $roomStmt->bind_param('i', $oldRoom);
            $roomStmt->execute();
            $roomNum = $roomStmt->get_result()->fetch_assoc()['room_number'] ?? '';
            $msg = "You have checked out of Room " . $roomNum . ". Thank you for staying with us!";
            $cId = (int) $existing['customer_id'];
            $notif = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Checked Out', ?, 'info')");
            $notif->bind_param('is', $cId, $msg);
            $notif->execute();

            json_ok(['message' => 'Guest checked out successfully. Room sent to housekeeping (Cleaning).']);
            break;
        }

        // Full Booking Edit or dates change
        if (isset($d['check_in']) && isset($d['check_out'])) {
            $new_room_id = (int) ($d['room_id'] ?? $oldRoom);
            $customer_id = isset($d['guest_id']) ? (int) $d['guest_id'] : (isset($d['customer_id']) ? (int) $d['customer_id'] : (int) $existing['customer_id']);
            $check_in = $d['check_in'];
            $check_out = $d['check_out'];
            if (strtotime($check_out) <= strtotime($check_in)) {
                json_fail(400, 'Check-out must be after check-in');
            }
            $stmt2 = $conn->prepare("SELECT price_per_night, status FROM rooms WHERE id=?");
            $stmt2->bind_param('i', $new_room_id);
            $stmt2->execute();
            $roomData = $stmt2->get_result()->fetch_assoc();
            if (!$roomData) {
                json_fail(400, 'Room not found');
            }
            if (roomHasOverlap($conn, $new_room_id, $check_in, $check_out, $id)) {
                json_fail(409, 'Room is already booked for those dates');
            }
            $nights = max(1, (strtotime($check_out) - strtotime($check_in)) / 86400);
            $total = $roomData['price_per_night'] * $nights;
            $special = $d['special_requests'] ?? $existing['special_requests'];
            $adults = (int) ($d['adults'] ?? $existing['adults']);
            $children = (int) ($d['children'] ?? $existing['children']);
            $status = $d['status'] ?? $existing['status'];
            $stmt = $conn->prepare("UPDATE bookings SET customer_id=?,room_id=?,check_in=?,check_out=?,adults=?,children=?,special_requests=?,total_amount=?,status=? WHERE id=?");
            $stmt->bind_param('iissiisdsi', $customer_id, $new_room_id, $check_in, $check_out, $adults, $children, $special, $total, $status, $id);
            executeOrFail($stmt, $conn);
            if ($new_room_id !== $oldRoom) {
                syncRoomStatus($conn, $oldRoom);
            }
            syncRoomStatus($conn, $new_room_id);
        } else {
            $status = $d['status'] ?? $existing['status'];
            $stmt = $conn->prepare("UPDATE bookings SET status=? WHERE id=?");
            $stmt->bind_param('si', $status, $id);
            executeOrFail($stmt, $conn);
            syncRoomStatus($conn, $oldRoom);
        }
        json_ok(['message' => 'Booking updated']);
        break;

    case 'DELETE':
        authenticate(['admin', 'manager']);
        if (!$id) {
            json_fail(400, 'Booking ID is required');
        }
        $existing = fetchBooking($conn, $id);
        $stmt = $conn->prepare("DELETE FROM bookings WHERE id=?");
        $stmt->bind_param('i', $id);
        executeOrFail($stmt, $conn);
        if ($stmt->affected_rows < 1) {
            json_fail(400, 'Booking could not be deleted');
        }
        if ($existing) {
            syncRoomStatus($conn, (int) $existing['room_id']);
        }
        json_ok(['message' => 'Booking deleted']);
        break;

    default:
        json_fail(405, 'Method not allowed');
}
$conn->close();

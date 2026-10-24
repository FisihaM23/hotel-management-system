<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;

$authUser = null;
if ($method !== 'GET' || in_array($action, ['orders', 'create_order', 'update_order_status'], true)) {
    $authUser = authenticate();
} else {
    $auth = getAuthorizationHeader();
    if ($auth && str_starts_with($auth, 'Bearer ')) {
        try {
            $authUser = authenticate();
        } catch (\Throwable $e) {
            $authUser = null;
        }
    }
}
$conn = getConnection();

// Self-healing schema: Ensure menu_items & dining_orders tables exist
$conn->query("CREATE TABLE IF NOT EXISTS menu_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category ENUM('food', 'alcoholic_drink', 'soft_drink') NOT NULL DEFAULT 'food',
  sub_category VARCHAR(100) DEFAULT 'General',
  price DECIMAL(10,2) NOT NULL,
  description TEXT,
  image_url VARCHAR(255),
  alcohol_by_volume VARCHAR(20),
  preparation_time VARCHAR(50) DEFAULT '15 mins',
  is_available TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)");

$conn->query("CREATE TABLE IF NOT EXISTS dining_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id INT NOT NULL,
  room_number VARCHAR(20),
  items LONGTEXT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  delivery_type ENUM('room_service','restaurant_dine_in','takeaway') DEFAULT 'room_service',
  status ENUM('pending','preparing','delivered','cancelled') DEFAULT 'pending',
  payment_status ENUM('unpaid','paid','charged_to_room','partially_paid') DEFAULT 'unpaid',
  special_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id)
)");

// If menu_items has no records, auto-seed initial selection
$chkCount = $conn->query("SELECT COUNT(*) as c FROM menu_items");
if ($chkCount && (int)$chkCount->fetch_assoc()['c'] === 0) {
    $conn->query("INSERT INTO menu_items (name, category, sub_category, price, description, image_url, alcohol_by_volume, preparation_time, is_available) VALUES
        ('Doro Wat (ዶሮ ወጥ)', 'food', 'Ethiopian Traditional', 28.00, 'Slow-cooked chicken stew with berbere spice, served with hard-boiled eggs and fresh injera', 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop', NULL, '25-30 mins', 1),
        ('Special Kitfo (ክትፎ)', 'food', 'Ethiopian Traditional', 26.00, 'Finely minced prime lean beef seasoned with mitmita and niter kibbeh spiced clarified butter, served with ayib and gomen', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&auto=format&fit=crop', NULL, '15-20 mins', 1),
        ('Shiro Tegabino (ሽሮ)', 'food', 'Ethiopian Traditional', 16.00, 'Sizzling clay pot roasted chickpea flour stew enriched with onions, garlic, and Ethiopian herbs', 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&auto=format&fit=crop', NULL, '15 mins', 1),
        ('Beef Tibs Firfir (የስጋ ጥብስ ፍርፍር)', 'food', 'Ethiopian Traditional', 22.00, 'Tender sautéed beef cubes with torn injera tossed in rich awaze berbere gravy', 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&auto=format&fit=crop', NULL, '20 mins', 1),
        ('Prime Grilled Ribeye Steak', 'food', 'Main Course', 34.00, '300g seasoned prime beef ribeye steak with rosemary herb butter, roasted vegetables, and mashed potatoes', 'https://images.unsplash.com/photo-1558030006-450675393462?w=400&auto=format&fit=crop', NULL, '25 mins', 1),
        ('Gourmet Club Sandwich', 'food', 'Snacks & Light Meals', 15.00, 'Triple-decker toasted bread with roasted turkey, smoked bacon, cheddar, lettuce, tomatoes, and golden french fries', 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&auto=format&fit=crop', NULL, '15 mins', 1),
        ('Habesha Cold Draft Beer', 'alcoholic_drink', 'Ethiopian Beers', 5.50, 'Refreshing premium Ethiopian lager brewed with barley and pure mountain spring water', 'https://images.unsplash.com/photo-1608270119280-92a061d497c2?w=400&auto=format&fit=crop', '5.0%', 'Instant', 1),
        ('St. George Lager Beer', 'alcoholic_drink', 'Ethiopian Beers', 5.00, 'The iconic Ethiopian lager with crisp malt character and smooth balanced finish', 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=400&auto=format&fit=crop', '4.7%', 'Instant', 1),
        ('Royal Tej (Pure Honey Wine)', 'alcoholic_drink', 'Traditional Drinks', 12.00, 'Artisanal Ethiopian fermented honey wine delicately flavored with gesho leaves', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400&auto=format&fit=crop', '11.0%', 'Instant', 1),
        ('Signature Ethiopian Spiced Coffee', 'soft_drink', 'Hot Beverages', 4.50, 'Traditional freshly roasted single-origin highland Arabica coffee brewed with cardamom, clove, and rue', 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop', NULL, '10 mins', 1),
        ('Fresh Mango-Avocado layered Juice (እስፕሪስ)', 'soft_drink', 'Fresh Juices', 6.00, 'Freshly pureed local mango and Hass avocado served layered with fresh lime garnish', 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=400&auto=format&fit=crop', NULL, '10 mins', 1)");
}

$frontDesk = ['admin', 'manager', 'receptionist'];
$menuManagers = ['admin', 'manager'];

if ($action === 'orders' && $method === 'GET') {
    if ($authUser['role'] === 'customer') {
        $stmt = $conn->prepare("SELECT o.*, u.name as customer_name, u.phone as customer_phone, u.email as customer_email
                                FROM dining_orders o
                                JOIN users u ON o.customer_id = u.id
                                WHERE o.customer_id = ?
                                ORDER BY o.created_at DESC");
        $stmt->bind_param('i', $authUser['id']);
        $stmt->execute();
        json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } elseif (in_array($authUser['role'], $frontDesk, true)) {
        $result = $conn->query("SELECT o.*, u.name as customer_name, u.phone as customer_phone, u.email as customer_email
                                FROM dining_orders o
                                JOIN users u ON o.customer_id = u.id
                                ORDER BY o.created_at DESC");
        json_ok($result ? $result->fetch_all(MYSQLI_ASSOC) : []);
    } else {
        json_fail(403, 'Access denied');
    }
    $conn->close();
    exit;
}

if ($action === 'create_order' && $method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $rawItems = $data['items'] ?? [];
    if (is_string($rawItems)) {
        $rawItems = json_decode($rawItems, true) ?: [];
    }
    if (empty($rawItems) || !is_array($rawItems)) {
        json_fail(400, 'Order items are required');
    }

    $customerId = (int) $authUser['id'];
    if (in_array($authUser['role'], $frontDesk, true) && !empty($data['customer_id'])) {
        $customerId = (int) $data['customer_id'];
    }

    $cleanItems = [];
    $total = 0.0;
    foreach ($rawItems as $row) {
        $itemId = (int) ($row['id'] ?? 0);
        $qty = max(1, (int) ($row['qty'] ?? 1));
        if (!$itemId) {
            continue;
        }
        $stmt = $conn->prepare("SELECT id, name, price, is_available FROM menu_items WHERE id = ?");
        $stmt->bind_param('i', $itemId);
        $stmt->execute();
        $menu = $stmt->get_result()->fetch_assoc();
        if (!$menu || !(int) $menu['is_available']) {
            json_fail(400, 'One or more menu items are unavailable');
        }
        $subtotal = (float) $menu['price'] * $qty;
        $total += $subtotal;
        $cleanItems[] = [
            'id' => (int) $menu['id'],
            'name' => $menu['name'],
            'price' => (float) $menu['price'],
            'qty' => $qty,
            'subtotal' => $subtotal,
        ];
    }
    if (empty($cleanItems) || $total <= 0) {
        json_fail(400, 'Order items and total amount are required');
    }

    $order_num = 'ORD-' . date('Y') . '-' . strtoupper(substr(uniqid(), -6));
    $room_num = $data['room_number'] ?? null;
    $itemsJson = json_encode($cleanItems);
    $delivery = in_array($data['delivery_type'] ?? '', ['room_service', 'restaurant_dine_in', 'takeaway'], true)
        ? $data['delivery_type'] : 'room_service';
    $status = 'pending';
    $payment = 'unpaid';
    if (in_array($authUser['role'], $frontDesk, true)
        && in_array($data['payment_status'] ?? '', ['unpaid', 'paid', 'charged_to_room'], true)) {
        $payment = $data['payment_status'];
    }
    $notes = $data['special_notes'] ?? '';

    $stmt = $conn->prepare("INSERT INTO dining_orders (order_number, customer_id, room_number, items, total_amount, delivery_type, status, payment_status, special_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('sisdsssss', $order_num, $customerId, $room_num, $itemsJson, $total, $delivery, $status, $payment, $notes);

    if ($stmt->execute()) {
        $newId = $conn->insert_id;
        $notifMsg = "Your order #$order_num has been received. Our kitchen is reviewing it!";
        $nStmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Order Placed', ?, 'info')");
        $nStmt->bind_param('is', $customerId, $notifMsg);
        $nStmt->execute();
        json_ok([
            'id' => $newId,
            'order_number' => $order_num,
            'total_amount' => $total,
            'message' => 'Order submitted successfully',
        ]);
    } else {
        json_fail(500, 'Failed to place order. Dining tables may not be installed — run setup_db.php');
    }
    $conn->close();
    exit;
}

if ($action === 'update_order_status' && $method === 'PUT') {
    if (!in_array($authUser['role'], $frontDesk, true)) {
        json_fail(403, 'Access denied');
    }
    if (!$id) {
        json_fail(400, 'Order ID is required');
    }

    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $status = $data['status'] ?? null;
    $payment = $data['payment_status'] ?? null;
    $allowedStatus = ['pending', 'preparing', 'delivered', 'cancelled'];
    $allowedPay = ['unpaid', 'paid', 'charged_to_room'];

    $updates = [];
    $types = '';
    $params = [];

    if ($status) {
        if (!in_array($status, $allowedStatus, true)) {
            json_fail(400, 'Invalid order status');
        }
        $updates[] = 'status = ?';
        $types .= 's';
        $params[] = $status;
    }
    if ($payment) {
        if (!in_array($payment, $allowedPay, true)) {
            json_fail(400, 'Invalid payment status');
        }
        $updates[] = 'payment_status = ?';
        $types .= 's';
        $params[] = $payment;
    }
    if (empty($updates)) {
        json_fail(400, 'No fields to update');
    }

    $types .= 'i';
    $params[] = $id;
    $sql = 'UPDATE dining_orders SET ' . implode(', ', $updates) . ' WHERE id = ?';
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);

    if ($stmt->execute()) {
        $oStmt = $conn->prepare('SELECT customer_id, order_number FROM dining_orders WHERE id = ?');
        $oStmt->bind_param('i', $id);
        $oStmt->execute();
        $oRes = $oStmt->get_result()->fetch_assoc();
        if ($oRes && $status) {
            $msg = "Order #{$oRes['order_number']} is now " . ucfirst(str_replace('_', ' ', $status));
            $nStmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Order Status Updated', ?, 'info')");
            $nStmt->bind_param('is', $oRes['customer_id'], $msg);
            $nStmt->execute();
        }
        json_ok(['message' => 'Order updated successfully']);
    } else {
        json_fail(500, 'Failed to update order');
    }
    $conn->close();
    exit;
}

if ($method !== 'GET') {
    if (!$authUser || !in_array($authUser['role'], ['admin', 'manager', 'receptionist', 'customer'], true)) {
        json_fail(403, 'Access denied');
    }
}

switch ($method) {
    case 'GET':
        if ($id) {
            $stmt = $conn->prepare('SELECT * FROM menu_items WHERE id = ?');
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $item = $stmt->get_result()->fetch_assoc();
            if (!$item) {
                json_fail(404, 'Item not found');
            }
            json_ok($item);
        } else {
            $category = $_GET['category'] ?? '';
            $subCategory = $_GET['sub_category'] ?? '';
            $search = $_GET['search'] ?? '';
            $where = [];
            $types = '';
            $params = [];
            if ($category !== '') {
                $where[] = 'category = ?';
                $types .= 's';
                $params[] = $category;
            }
            if ($subCategory !== '') {
                $where[] = 'sub_category = ?';
                $types .= 's';
                $params[] = $subCategory;
            }
            if ($search !== '') {
                $where[] = '(name LIKE ? OR description LIKE ? OR sub_category LIKE ?)';
                $types .= 'sss';
                $sWild = "%$search%";
                $params[] = $sWild;
                $params[] = $sWild;
                $params[] = $sWild;
            }
            $sql = 'SELECT * FROM menu_items';
            if (!empty($where)) {
                $sql .= ' WHERE ' . implode(' AND ', $where);
            }
            $sql .= ' ORDER BY category ASC, sub_category ASC, name ASC';
            if (!empty($params)) {
                $stmt = $conn->prepare($sql);
                $stmt->bind_param($types, ...$params);
                $stmt->execute();
                json_ok($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
            } else {
                $res = $conn->query($sql);
                json_ok($res ? $res->fetch_all(MYSQLI_ASSOC) : []);
            }
        }
        break;

    case 'POST':
        if (!in_array($authUser['role'], $menuManagers, true)) {
            json_fail(403, 'Access denied: staff only');
        }
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        if (empty($d['name']) || empty($d['category']) || !isset($d['price'])) {
            json_fail(400, 'Name, category, and price are required');
        }
        $name = trim($d['name']);
        $cat = $d['category'];
        $sub = $d['sub_category'] ?? 'General';
        $price = (float) $d['price'];
        $desc = $d['description'] ?? '';
        $img = $d['image_url'] ?? '';
        $abv = !empty($d['alcohol_by_volume']) ? $d['alcohol_by_volume'] : null;
        $prep = $d['preparation_time'] ?? '15 mins';
        $avail = isset($d['is_available']) ? (int) $d['is_available'] : 1;
        $stmt = $conn->prepare("INSERT INTO menu_items (name, category, sub_category, price, description, image_url, alcohol_by_volume, preparation_time, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('sssdssssi', $name, $cat, $sub, $price, $desc, $img, $abv, $prep, $avail);
        executeOrFail($stmt, $conn);
        json_ok(['id' => $conn->insert_id, 'message' => 'Menu item created successfully']);
        break;

    case 'PUT':
        if (!in_array($authUser['role'], $menuManagers, true)) {
            json_fail(403, 'Access denied: staff only');
        }
        if (!$id) {
            json_fail(400, 'Item ID is required');
        }
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $name = trim($d['name'] ?? '');
        $cat = $d['category'] ?? 'food';
        $sub = $d['sub_category'] ?? 'General';
        $price = (float) ($d['price'] ?? 0);
        $desc = $d['description'] ?? '';
        $img = $d['image_url'] ?? '';
        $abv = !empty($d['alcohol_by_volume']) ? $d['alcohol_by_volume'] : null;
        $prep = $d['preparation_time'] ?? '15 mins';
        $avail = isset($d['is_available']) ? (int) $d['is_available'] : 1;
        $stmt = $conn->prepare("UPDATE menu_items SET name=?, category=?, sub_category=?, price=?, description=?, image_url=?, alcohol_by_volume=?, preparation_time=?, is_available=? WHERE id=?");
        $stmt->bind_param('sssdssssii', $name, $cat, $sub, $price, $desc, $img, $abv, $prep, $avail, $id);
        executeOrFail($stmt, $conn);
        json_ok(['message' => 'Menu item updated successfully']);
        break;

    case 'DELETE':
        if (!in_array($authUser['role'], $menuManagers, true)) {
            json_fail(403, 'Access denied: staff only');
        }
        if (!$id) {
            json_fail(400, 'Item ID is required');
        }
        $stmt = $conn->prepare('DELETE FROM menu_items WHERE id = ?');
        $stmt->bind_param('i', $id);
        executeOrFail($stmt, $conn);
        json_ok(['message' => 'Menu item deleted successfully']);
        break;

    default:
        json_fail(405, 'Method not allowed');
}

$conn->close();

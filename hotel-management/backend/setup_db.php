<?php
// Run: http://localhost/hotel-management/api/setup_db.php
// This creates the database, all tables, and seeds demo users with correct passwords

$host = 'localhost';
$user = 'root';
$pass = '';

$conn = new mysqli($host, $user, $pass);
if ($conn->connect_error) {
    die(json_encode(['error' => 'Cannot connect to MySQL: ' . $conn->connect_error]));
}

$steps = [];

// 1. Create database
$conn->query("CREATE DATABASE IF NOT EXISTS hotel_management CHARACTER SET utf8 COLLATE utf8_general_ci");
$steps[] = 'Database created';

$conn->select_db('hotel_management');

// 2. Create tables
$tables = [
"CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin','manager','receptionist','customer','housekeeping','maintenance') NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)",
"CREATE TABLE IF NOT EXISTS rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_number VARCHAR(10) NOT NULL UNIQUE,
  type ENUM('single','double','suite','deluxe','penthouse') NOT NULL,
  floor INT DEFAULT 1,
  price_per_night DECIMAL(10,2) NOT NULL,
  status ENUM('available','occupied','cleaning','maintenance') DEFAULT 'available',
  description TEXT,
  amenities TEXT,
  max_guests INT DEFAULT 2,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)",
"CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  room_id INT NOT NULL,
  receptionist_id INT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  adults INT DEFAULT 1,
  children INT DEFAULT 0,
  special_requests TEXT,
  total_amount DECIMAL(10,2),
  status ENUM('pending','confirmed','checked_in','checked_out','cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (room_id) REFERENCES rooms(id),
  FOREIGN KEY (receptionist_id) REFERENCES users(id)
)",
"CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  method ENUM('cash','card','online','bank_transfer') NOT NULL,
  status ENUM('pending','completed','refunded','failed') DEFAULT 'pending',
  transaction_id VARCHAR(100),
  notes TEXT,
  paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
)",
"CREATE TABLE IF NOT EXISTS housekeeping_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  assigned_to INT,
  task_type ENUM('cleaning','linen_change','inspection','deep_clean') DEFAULT 'cleaning',
  priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
  status ENUM('pending','in_progress','completed','skipped') DEFAULT 'pending',
  notes TEXT,
  scheduled_date DATE,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
)",
"CREATE TABLE IF NOT EXISTS maintenance_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT,
  reported_by INT NOT NULL,
  assigned_to INT,
  category ENUM('electrical','plumbing','furniture','hvac','general') DEFAULT 'general',
  title VARCHAR(200) NOT NULL,
  description TEXT,
  priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
  status ENUM('open','assigned','in_progress','resolved','closed') DEFAULT 'open',
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reported_by) REFERENCES users(id)
)",
"CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  type ENUM('info','success','warning','error') DEFAULT 'info',
  is_read TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
)",
"CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  subtotal DECIMAL(10,2),
  tax DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2),
  status ENUM('draft','sent','paid','overdue') DEFAULT 'draft',
  due_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
)"
];

foreach ($tables as $sql) {
    if ($conn->query($sql)) {
        $steps[] = 'Table created OK';
    } else {
        $steps[] = 'Table error: ' . $conn->error;
    }
}

// 3. Seed users with correct password hash
$hash = password_hash('password123', PASSWORD_BCRYPT);
$verify = password_verify('password123', $hash);
$steps[] = 'Hash verify test: ' . ($verify ? 'PASS' : 'FAIL');

$users = [
    ['System Admin',       'admin@hotel.com',        'admin'],
    ['Hotel Manager',      'manager@hotel.com',      'manager'],
    ['John Receptionist',  'receptionist@hotel.com', 'receptionist'],
    ['Jane Customer',      'customer@hotel.com',     'customer'],
    ['Mary Housekeeping',  'housekeeping@hotel.com', 'housekeeping'],
    ['Bob Maintenance',    'maintenance@hotel.com',  'maintenance'],
];

foreach ($users as [$name, $email, $role]) {
    // Check if exists
    $check = $conn->prepare("SELECT id FROM users WHERE email = ?");
    $check->bind_param("s", $email);
    $check->execute();
    $exists = $check->get_result()->fetch_assoc();

    if ($exists) {
        // Update password
        $stmt = $conn->prepare("UPDATE users SET password = ?, status = 'active' WHERE email = ?");
        $stmt->bind_param("ss", $hash, $email);
        $stmt->execute();
        $steps[] = "Updated password: $email";
    } else {
        // Insert
        $stmt = $conn->prepare("INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, 'active')");
        $stmt->bind_param("ssss", $name, $email, $hash, $role);
        $stmt->execute();
        $steps[] = "Inserted user: $email";
    }
}

// 4. Seed rooms
$roomCount = $conn->query("SELECT COUNT(*) as c FROM rooms")->fetch_assoc()['c'];
if ($roomCount == 0) {
    $rooms = [
        ['101','single',1,80.00,'available','Cozy single room','WiFi,TV,AC',1],
        ['102','double',1,120.00,'available','Spacious double room','WiFi,TV,AC,Bathtub',2],
        ['201','suite',2,250.00,'available','Luxury suite','WiFi,TV,AC,Jacuzzi,Balcony',3],
        ['202','deluxe',2,180.00,'available','Deluxe with balcony','WiFi,TV,AC,Mini-bar',2],
        ['301','penthouse',3,500.00,'available','Top floor penthouse','WiFi,TV,AC,Kitchen,Balcony',4],
    ];
    foreach ($rooms as [$num,$type,$floor,$price,$status,$desc,$amen,$max]) {
        $stmt = $conn->prepare("INSERT INTO rooms (room_number,type,floor,price_per_night,status,description,amenities,max_guests) VALUES (?,?,?,?,?,?,?,?)");
        $stmt->bind_param("ssidsssi", $num,$type,$floor,$price,$status,$desc,$amen,$max);
        $stmt->execute();
    }
    $steps[] = 'Rooms seeded';
}

// 5. Final verification
$stmt = $conn->prepare("SELECT email, password FROM users WHERE email = 'admin@hotel.com'");
$stmt->execute();
$admin = $stmt->get_result()->fetch_assoc();
$loginTest = $admin && password_verify('password123', $admin['password']);

echo json_encode([
    'status'        => 'SUCCESS',
    'login_test'    => $loginTest ? 'admin@hotel.com / password123 WORKS' : 'LOGIN TEST FAILED',
    'steps'         => $steps,
    'next'          => 'Go to http://localhost:5174 and login!'
], JSON_PRETTY_PRINT);

$conn->close();

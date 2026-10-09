-- ============================================
-- Hotel Management System - Full Database
-- ============================================
CREATE DATABASE IF NOT EXISTS hotel_management;
USE hotel_management;

-- Users (all actors)
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin','manager','receptionist','customer','housekeeping','maintenance') NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms
CREATE TABLE rooms (
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
);

-- Bookings
CREATE TABLE bookings (
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
);

-- Payments
CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  method ENUM('cash','card','online','bank_transfer') NOT NULL,
  status ENUM('pending','completed','refunded','failed') DEFAULT 'pending',
  transaction_id VARCHAR(100),
  notes TEXT,
  paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

-- Housekeeping Tasks
CREATE TABLE housekeeping_tasks (
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
  FOREIGN KEY (room_id) REFERENCES rooms(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);

-- Maintenance Requests
CREATE TABLE maintenance_requests (
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
  FOREIGN KEY (room_id) REFERENCES rooms(id),
  FOREIGN KEY (reported_by) REFERENCES users(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);

-- Invoices
CREATE TABLE invoices (
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
);

-- Notifications
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  type ENUM('info','success','warning','error') DEFAULT 'info',
  is_read TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Password Reset Tokens
CREATE TABLE IF NOT EXISTS password_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(100) NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Users (password for all: password123)
-- Hash generated via: password_hash('password123', PASSWORD_BCRYPT)
INSERT INTO users (name, email, password, role, phone) VALUES
('MULUGETA', 'befather7@gmail.com', '$2y$10$U9.6NrbtayruBUyiePu3ouGgl.zf6DLTMrpkyweIADtRPxL6Aakgy', 'admin', '555-0001'),
('Hotel Manager', 'manager@hotel.com', '$2y$10$U9.6NrbtayruBUyiePu3ouGgl.zf6DLTMrpkyweIADtRPxL6Aakgy', 'manager', '555-0002'),
('John Receptionist', 'receptionist@hotel.com', '$2y$10$U9.6NrbtayruBUyiePu3ouGgl.zf6DLTMrpkyweIADtRPxL6Aakgy', 'receptionist', '555-0003'),
('Jane Customer', 'customer@hotel.com', '$2y$10$U9.6NrbtayruBUyiePu3ouGgl.zf6DLTMrpkyweIADtRPxL6Aakgy', 'customer', '555-0004'),
('Mary Housekeeping', 'housekeeping@hotel.com', '$2y$10$U9.6NrbtayruBUyiePu3ouGgl.zf6DLTMrpkyweIADtRPxL6Aakgy', 'housekeeping', '555-0005'),
('Bob Maintenance', 'maintenance@hotel.com', '$2y$10$U9.6NrbtayruBUyiePu3ouGgl.zf6DLTMrpkyweIADtRPxL6Aakgy', 'maintenance', '555-0006');

-- Rooms
INSERT INTO rooms (room_number, type, floor, price_per_night, status, description, amenities, max_guests) VALUES
('101', 'single', 1, 80.00, 'available', 'Cozy single room with city view', 'WiFi,TV,AC,Mini-bar', 1),
('102', 'double', 1, 120.00, 'available', 'Spacious double room', 'WiFi,TV,AC,Mini-bar,Bathtub', 2),
('103', 'double', 1, 120.00, 'cleaning', 'Double room with garden view', 'WiFi,TV,AC', 2),
('201', 'suite', 2, 250.00, 'available', 'Luxury suite with living area', 'WiFi,TV,AC,Jacuzzi,Mini-bar,Balcony', 3),
('202', 'deluxe', 2, 180.00, 'occupied', 'Deluxe room with balcony', 'WiFi,TV,AC,Mini-bar,Balcony', 2),
('203', 'deluxe', 2, 180.00, 'available', 'Deluxe corner room', 'WiFi,TV,AC,Mini-bar', 2),
('301', 'penthouse', 3, 500.00, 'available', 'Top floor penthouse with panoramic view', 'WiFi,TV,AC,Jacuzzi,Kitchen,Balcony,Butler', 4),
('302', 'single', 3, 80.00, 'maintenance', 'Single room under maintenance', 'WiFi,TV,AC', 1);

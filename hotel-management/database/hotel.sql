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
  id_proof VARCHAR(50) DEFAULT 'National ID',
  id_number VARCHAR(100) DEFAULT '',
  reason_for_stay VARCHAR(100) DEFAULT 'Tourism / Leisure',
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
  method VARCHAR(50) NOT NULL DEFAULT 'cash',
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
  resolution_notes TEXT NULL,
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

-- Dining & Bar Menu Items
CREATE TABLE IF NOT EXISTS menu_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'food',
  sub_category VARCHAR(100) DEFAULT 'General',
  price DECIMAL(10,2) NOT NULL,
  description TEXT,
  image_url VARCHAR(255),
  alcohol_by_volume VARCHAR(20),
  preparation_time VARCHAR(50) DEFAULT '15 mins',
  is_available TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dining & Room Service Orders
CREATE TABLE IF NOT EXISTS dining_orders (
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
);


-- Users (password for all: password123)
-- Hash generated via: password_hash('password123', PASSWORD_BCRYPT)
INSERT INTO users (name, email, password, role, phone) VALUES
('Mulugeta Fisiha', 'befather7@gmail.com', '$2y$10$U9.6NrbtayruBUyiePu3ouGgl.zf6DLTMrpkyweIADtRPxL6Aakgy', 'admin', '0932338138'),
('Hotel Manager', 'manager@hotel.com', '$2y$10$U9.6NrbtayruBUyiePu3ouGgl.zf6DLTMrpkyweIADtRPxL6Aakgy', 'manager', '555-0002'),
('John Receptionist', 'receptionist@hotel.com', '$2y$10$U9.6NrbtayruBUyiePu3ouGgl.zf6DLTMrpkyweIADtRPxL6Aakgy', 'receptionist', '555-0003'),
('Jane Customer', 'customer@hotel.com', '$2y$10$U9.6NrbtayruBUyiePu3ouGgl.zf6DLTMrpkyweIADtRPxL6Aakgy', 'customer', '555-0004'),
('Mary Housekeeping', 'housekeeping@hotel.com', '$2y$10$U9.6NrbtayruBUyiePu3ouGgl.zf6DLTMrpkyweIADtRPxL6Aakgy', 'housekeeping', '555-0005'),
('Bob Maintenance', 'maintenance@hotel.com', '$2y$10$U9.6NrbtayruBUyiePu3ouGgl.zf6DLTMrpkyweIADtRPxL6Aakgy', 'maintenance', '555-0006');

-- Rooms (6-Floor Grand Hospitality Building)
INSERT INTO rooms (room_number, type, floor, price_per_night, status, description, amenities, max_guests) VALUES
('101', 'single', 1, 80.00, 'available', 'Cozy single room with city view and park garden access', 'WiFi,TV,AC,Mini-bar', 1),
('102', 'double', 1, 120.00, 'available', 'Spacious double room near ground lobby & park fountain', 'WiFi,TV,AC,Mini-bar,Bathtub', 2),
('103', 'double', 1, 120.00, 'available', 'Double room with resort garden & park promenade view', 'WiFi,TV,AC', 2),
('104', 'double', 1, 130.00, 'available', 'Ground floor garden terrace double room with direct park access', 'WiFi,Smart TV,AC,Mini-bar,Park Access', 2),
('201', 'suite', 2, 250.00, 'available', 'Luxury suite with living area and international dining view', 'WiFi,TV,AC,Jacuzzi,Mini-bar,Balcony', 3),
('202', 'deluxe', 2, 180.00, 'available', 'Deluxe room with balcony overlooking the dining terrace', 'WiFi,TV,AC,Mini-bar,Balcony', 2),
('203', 'deluxe', 2, 180.00, 'available', 'Deluxe corner room on the dining level', 'WiFi,TV,AC,Mini-bar', 2),
('204', 'suite', 2, 260.00, 'available', 'Second floor dining hospitality suite with private dining area', 'WiFi,Smart TV,AC,Jacuzzi,Mini-bar,Balcony', 3),
('301', 'deluxe', 3, 190.00, 'available', 'Third floor refreshment terrace deluxe room near cocktail lounge', 'WiFi,TV,AC,Mini-bar,Balcony,Park View', 2),
('302', 'double', 3, 150.00, 'available', 'Third floor double room overlooking the central resort park', 'WiFi,Smart TV,AC,Mini-bar,Balcony,Park View', 2),
('401', 'deluxe', 4, 210.00, 'available', 'Executive 4th floor deluxe room overlooking the resort park', 'WiFi,Smart TV,AC,Mini-bar,Balcony,Park View', 2),
('402', 'suite', 4, 280.00, 'available', 'Diplomatic 4th floor corner suite with private lounge', 'WiFi,Smart TV,AC,Jacuzzi,Mini-bar,Balcony,Park View', 3),
('501', 'deluxe', 5, 240.00, 'available', 'Ambassador 5th floor deluxe suite next to Spa & Wellness center', 'WiFi,Smart TV,AC,Mini-bar,Balcony,Spa Access', 2),
('502', 'suite', 5, 320.00, 'available', 'Grand VIP 5th floor luxury suite with panoramic park & city views', 'WiFi,Smart TV,AC,Jacuzzi,Balcony,Butler,Spa Access', 4),
('601', 'penthouse', 6, 550.00, 'available', 'Top 6th-floor Royal Sky Penthouse with private rooftop park terrace', 'WiFi,Smart TV,AC,Jacuzzi,Kitchen,Balcony,Butler,Rooftop Park Access', 5),
('602', 'suite', 6, 360.00, 'available', '6th-floor Sky Garden Suite directly facing the rooftop lounge', 'WiFi,Smart TV,AC,Jacuzzi,Mini-bar,Balcony,Skyline View', 3);


-- Menu Items
INSERT INTO menu_items (name, category, sub_category, price, description, image_url, alcohol_by_volume, preparation_time, is_available) VALUES
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
('Fresh Mango-Avocado layered Juice (እስፕሪስ)', 'soft_drink', 'Fresh Juices', 6.00, 'Freshly pureed local mango and Hass avocado served layered with fresh lime garnish', 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=400&auto=format&fit=crop', NULL, '10 mins', 1);

<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/auth_middleware.php';

$authUser = authenticate(); // no role restriction - any authenticated user
$conn = getConnection();
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $stmt = $conn->prepare("SELECT id, name, email, phone, role FROM users WHERE id = ?");
        $stmt->bind_param("i", $authUser['id']);
        $stmt->execute();
        $user = $stmt->get_result()->fetch_assoc();
        if ($user) {
            echo json_encode($user);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'User not found']);
        }
        break;

    case 'PUT':
        $d = json_decode(file_get_contents('php://input'), true);
        $updates = [];
        $types = '';
        $values = [];

        if (!empty($d['name'])) {
            $updates[] = 'name = ?';
            $types .= 's';
            $values[] = $d['name'];
        }
        if (isset($d['phone'])) {
            $updates[] = 'phone = ?';
            $types .= 's';
            $values[] = $d['phone'];
        }
        if (!empty($d['password'])) {
            $pw = $d['password'];
            // Validate: min 8 chars, uppercase, lowercase, number, special char
            if (strlen($pw) < 8) {
                http_response_code(400);
                echo json_encode(['error' => 'Password must be at least 8 characters']);
                exit;
            }
            if (!preg_match('/[A-Z]/', $pw)) {
                http_response_code(400);
                echo json_encode(['error' => 'Password must contain at least one uppercase letter']);
                exit;
            }
            if (!preg_match('/[a-z]/', $pw)) {
                http_response_code(400);
                echo json_encode(['error' => 'Password must contain at least one lowercase letter']);
                exit;
            }
            if (!preg_match('/[0-9]/', $pw)) {
                http_response_code(400);
                echo json_encode(['error' => 'Password must contain at least one number']);
                exit;
            }
            if (!preg_match('/[\W_]/', $pw)) {
                http_response_code(400);
                echo json_encode(['error' => 'Password must contain at least one special character']);
                exit;
            }
            $hashed = password_hash($pw, PASSWORD_BCRYPT);
            $updates[] = 'password = ?';
            $types .= 's';
            $values[] = $hashed;
        }

        if (empty($updates)) {
            http_response_code(400);
            echo json_encode(['error' => 'No valid fields to update']);
            exit;
        }

        $types .= 'i';
        $values[] = $authUser['id'];

        $sql = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param($types, ...$values);
        if ($stmt->execute()) {
            echo json_encode(['message' => 'Profile updated successfully']);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to update profile']);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        break;
}
$conn->close();

<?php
require_once '../config/cors.php';
require_once '../config/database.php';
require_once '../config/helpers.php';
require_once '../config/auth_middleware.php';

// Optional Authentication
$authUser = null;
$auth = getAuthorizationHeader();
if ($auth && str_starts_with($auth, 'Bearer ')) {
    try {
        $authUser = authenticate();
    } catch (\Throwable $e) {
        $authUser = null;
    }
}

$conn = getConnection();

// Auto-heal: Ensure rooms marked 'occupied' return to 'available' if all bookings were completed or cancelled
$conn->query("UPDATE rooms r 
    SET r.status = 'available' 
    WHERE r.status = 'occupied' 
    AND NOT EXISTS (
        SELECT 1 FROM bookings b 
        WHERE b.room_id = r.id 
        AND b.status IN ('checked_in', 'confirmed') 
        AND b.check_out >= CURDATE()
    )");

// Auto-create chat history table
$conn->query("CREATE TABLE IF NOT EXISTS hotel_ai_chats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    session_id VARCHAR(64) NOT NULL,
    sender ENUM('customer', 'hotel_ai') NOT NULL,
    message TEXT NOT NULL,
    metadata LONGTEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (user_id),
    INDEX (session_id)
)");

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'chat';

/**
 * Predict free rooms based on dates, guests, type, floor, and budget
 * Real-time database lookup with live booking conflict resolution
 */
function predictFreeRooms($conn, $checkIn = null, $checkOut = null, $guests = 1, $preferredType = null, $maxBudget = null, $preferredFloor = null, $targetRoomNumber = null) {
    $now = date('Y-m-d');
    if (!$checkIn || strtotime($checkIn) < strtotime($now)) {
        $checkIn = $now;
    }
    if (!$checkOut || strtotime($checkOut) <= strtotime($checkIn)) {
        $checkOut = date('Y-m-d', strtotime($checkIn . ' + 1 day'));
    }

    $nights = max(1, (int)round((strtotime($checkOut) - strtotime($checkIn)) / 86400));

    // Fetch all active rooms (excluding maintenance)
    $query = "SELECT r.* FROM rooms r WHERE r.status != 'maintenance' ORDER BY r.floor ASC, r.room_number ASC";
    $result = $conn->query($query);
    $allRooms = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];

    $availableRooms = [];
    $occupiedRooms = [];

    // Room type translation mapping for Amharic & English
    $typeLabels = [
        'single' => ['en' => 'Single Room', 'am' => 'ነጠላ ክፍል'],
        'double' => ['en' => 'Double Room', 'am' => 'ድርብ ክፍል'],
        'deluxe' => ['en' => 'Deluxe Room', 'am' => 'ዴሉክስ ክፍል'],
        'suite' => ['en' => 'Luxury Suite', 'am' => 'የቅንጦት ሱዊት'],
        'penthouse' => ['en' => 'Royal Sky Penthouse', 'am' => 'የሰማይ ፔንትሀውስ']
    ];

    foreach ($allRooms as $room) {
        $isOverlapped = roomHasOverlap($conn, $room['id'], $checkIn, $checkOut);
        
        // Accurate real-time check: if check-in is today, occupied/cleaning rooms are not free right now
        if ($checkIn === $now && in_array(strtolower($room['status']), ['occupied', 'cleaning'])) {
            $isOverlapped = true;
        }

        $totalStayPrice = round((float)$room['price_per_night'] * $nights, 2);
        $rType = strtolower($room['type']);

        $roomData = [
            'id' => (int)$room['id'],
            'room_number' => (string)$room['room_number'],
            'type' => $room['type'],
            'type_label_am' => $typeLabels[$rType]['am'] ?? $room['type'],
            'type_label_en' => $typeLabels[$rType]['en'] ?? ucfirst($room['type']),
            'floor' => (int)$room['floor'],
            'price_per_night' => (float)$room['price_per_night'],
            'nights' => $nights,
            'total_stay_price' => $totalStayPrice,
            'status' => $room['status'],
            'description' => $room['description'],
            'amenities' => array_values(array_filter(array_map('trim', explode(',', $room['amenities'] ?: '')))),
            'max_guests' => (int)$room['max_guests'],
            'check_in' => $checkIn,
            'check_out' => $checkOut,
            'prediction' => [
                'is_free' => !$isOverlapped,
                'confidence' => !$isOverlapped ? 100 : 0,
                'status_label' => !$isOverlapped ? 'Guaranteed Available' : 'Reserved for selected dates',
                'status_label_am' => !$isOverlapped ? 'በእርግጠኝነት ክፍት ነው' : 'በተመረጡት ቀናት ተይዟል'
            ]
        ];

        // Capacity and preference matching score
        $score = 100;

        // Specific room number exact match
        if ($targetRoomNumber && (string)$room['room_number'] === (string)$targetRoomNumber) {
            $score += 200;
        }

        // Specific floor match
        if ($preferredFloor !== null && (int)$room['floor'] === (int)$preferredFloor) {
            $score += 80;
        }

        // Specific room type match
        if ($preferredType && strtolower($room['type']) === strtolower($preferredType)) {
            $score += 60;
        }

        // Capacity suitability
        if ($room['max_guests'] < $guests) {
            $score -= 50;
        } elseif ($room['max_guests'] >= $guests) {
            $score += 20;
        }

        // Budget match
        if ($maxBudget && (float)$room['price_per_night'] <= (float)$maxBudget) {
            $score += 30;
        } elseif ($maxBudget && (float)$room['price_per_night'] > (float)$maxBudget) {
            $score -= 30;
        }

        $roomData['suitability_score'] = $score;

        if (!$isOverlapped) {
            $availableRooms[] = $roomData;
        } else {
            $occupiedRooms[] = $roomData;
        }
    }

    // Sort available rooms by suitability score descending, then by price ascending
    usort($availableRooms, function ($a, $b) {
        if ($b['suitability_score'] === $a['suitability_score']) {
            return $a['price_per_night'] <=> $b['price_per_night'];
        }
        return $b['suitability_score'] <=> $a['suitability_score'];
    });

    return [
        'check_in' => $checkIn,
        'check_out' => $checkOut,
        'nights' => $nights,
        'requested_guests' => (int)$guests,
        'total_rooms' => count($allRooms),
        'free_count' => count($availableRooms),
        'occupied_count' => count($occupiedRooms),
        'available_rooms' => $availableRooms,
        'occupied_rooms' => $occupiedRooms
    ];
}

/**
 * Fetch available dining items directly from live database
 */
function fetchHotelDining($conn, $category = null, $searchTerm = null) {
    $sql = "SELECT * FROM menu_items WHERE is_available = 1";
    $params = [];
    $types = '';

    if ($category) {
        $sql .= " AND category = ?";
        $params[] = $category;
        $types .= 's';
    }

    if ($searchTerm) {
        $sql .= " AND (name LIKE ? OR description LIKE ? OR sub_category LIKE ?)";
        $like = "%$searchTerm%";
        $params[] = $like;
        $params[] = $like;
        $params[] = $like;
        $types .= 'sss';
    }

    $sql .= " ORDER BY category ASC, price ASC";

    if (!empty($params)) {
        $stmt = $conn->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $items = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    } else {
        $res = $conn->query($sql);
        $items = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
    }

    $grouped = [
        'food' => [],
        'alcoholic_drink' => [],
        'soft_drink' => []
    ];

    foreach ($items as $item) {
        $cat = $item['category'] ?? 'food';
        if (!isset($grouped[$cat])) {
            $grouped[$cat] = [];
        }
        $grouped[$cat][] = [
            'id' => (int)$item['id'],
            'name' => $item['name'],
            'category' => $item['category'],
            'sub_category' => $item['sub_category'],
            'price' => (float)$item['price'],
            'description' => $item['description'],
            'image_url' => $item['image_url'],
            'alcohol_by_volume' => $item['alcohol_by_volume'],
            'preparation_time' => $item['preparation_time'] ?: '15 mins',
            'is_available' => (bool)$item['is_available']
        ];
    }

    return [
        'total_available' => count($items),
        'items' => array_values($items),
        'categories' => $grouped
    ];
}

/**
 * Hotel AI Bilingual Natural Language & Predictive Engine (Amharic & English)
 * Efficiently trained on live hotel database, real availability & policies
 */
function processHotelAIConversation($conn, $userMessage, $context = [], $history = []) {
    $rawMsg = trim($userMessage);
    $msg = mb_strtolower($rawMsg, 'UTF-8');

    // Language Detection: Check for Ethiopic Unicode characters (range U+1200 to U+137F)
    $hasEthiopic = (bool) preg_match('/[\x{1200}-\x{137F}]/u', $rawMsg);
    $lang = $context['lang'] ?? ($hasEthiopic ? 'am' : 'en');
    if ($hasEthiopic) {
        $lang = 'am';
    }

    // Default dates and context
    $today = date('Y-m-d');
    $checkIn = $context['check_in'] ?? null;
    $checkOut = $context['check_out'] ?? null;
    $guests = isset($context['guests']) ? max(1, (int)$context['guests']) : 1;
    $preferredType = $context['room_type'] ?? null;
    $preferredFloor = null;
    $targetRoomNumber = null;
    $maxBudget = null;

    // Detect standard dates (YYYY-MM-DD)
    if (preg_match('/(\d{4}-\d{2}-\d{2})/', $msg, $matches)) {
        if (!$checkIn) {
            $checkIn = $matches[1];
        } elseif (!$checkOut && $matches[1] !== $checkIn) {
            $checkOut = $matches[1];
        }
    }

    // Relative dates in English and Amharic
    if (str_contains($msg, 'tomorrow') || str_contains($msg, 'ነገ')) {
        $checkIn = date('Y-m-d', strtotime('+1 day'));
        $checkOut = date('Y-m-d', strtotime('+2 days'));
    } elseif (str_contains($msg, 'this weekend') || str_contains($msg, 'weekend') || str_contains($msg, 'ቅዳሜ') || str_contains($msg, 'እሁድ') || str_contains($msg, 'ሳምንት')) {
        $checkIn = date('Y-m-d', strtotime('this friday'));
        $checkOut = date('Y-m-d', strtotime('this sunday'));
    } elseif (str_contains($msg, 'tonight') || str_contains($msg, 'today') || str_contains($msg, 'ዛሬ')) {
        $checkIn = $today;
        $checkOut = date('Y-m-d', strtotime('+1 day'));
    }

    // Detect stay length (e.g., "for 2 nights", "for 3 days", "ለ 2 ሌሊት", "ለ 3 ቀን")
    if (preg_match('/(?:for|ለ)\s*(\d+)\s*(?:nights?|days?|ሌሊት|ቀን)/u', $msg, $stayMatches)) {
        $stayNights = max(1, (int)$stayMatches[1]);
        $baseDate = $checkIn ?: $today;
        $checkIn = $baseDate;
        $checkOut = date('Y-m-d', strtotime("$baseDate + $stayNights days"));
    }

    // Extract guests count in English & Amharic
    if (preg_match('/(\d+)\s*(?:people|persons?|guests?|adults?|ሰው|እንግዳ|አዋቂ)/u', $msg, $gMatches)) {
        $guests = max(1, (int)$gMatches[1]);
    }

    // Detect exact room number (e.g., "room 101", "room 601", "ክፍል 201", "#102")
    if (preg_match('/(?:room|ክፍል|#)\s*([1-6]0[1-4])/iu', $rawMsg, $rnMatches)) {
        $targetRoomNumber = $rnMatches[1];
    } elseif (preg_match('/\b([1-6]0[1-4])\b/', $rawMsg, $rnMatches)) {
        $targetRoomNumber = $rnMatches[1];
    }

    // Detect specific floor (Floor 1 to Floor 6) in English & Amharic
    if (preg_match('/(?:floor|ፎቅ)\s*([1-6])\b/iu', $rawMsg, $flMatches)) {
        $preferredFloor = (int)$flMatches[1];
    } elseif (preg_match('/\b(1st|first|ground|ምድር|አንደኛ)\s*(?:floor|ፎቅ)?\b/iu', $rawMsg)) {
        $preferredFloor = 1;
    } elseif (preg_match('/\b(2nd|second|ሁለተኛ)\s*(?:floor|ፎቅ)?\b/iu', $rawMsg)) {
        $preferredFloor = 2;
    } elseif (preg_match('/\b(3rd|third|ሶስተኛ)\s*(?:floor|ፎቅ)?\b/iu', $rawMsg)) {
        $preferredFloor = 3;
    } elseif (preg_match('/\b(4th|fourth|አራተኛ)\s*(?:floor|ፎቅ)?\b/iu', $rawMsg)) {
        $preferredFloor = 4;
    } elseif (preg_match('/\b(5th|fifth|አምስተኛ)\s*(?:floor|ፎቅ)?\b/iu', $rawMsg)) {
        $preferredFloor = 5;
    } elseif (preg_match('/\b(6th|sixth|top|rooftop|ስድስተኛ|ጣሪያ)\s*(?:floor|ፎቅ)?\b/iu', $rawMsg)) {
        $preferredFloor = 6;
    }

    // Extract room type preference (English & Amharic)
    if (str_contains($msg, 'penthouse') || str_contains($msg, 'rooftop') || str_contains($msg, 'royal') || str_contains($msg, 'ፔንትሀውስ') || str_contains($msg, 'ሮያል')) {
        $preferredType = 'penthouse';
    } elseif (str_contains($msg, 'suite') || str_contains($msg, 'luxury') || str_contains($msg, 'ሱዊት') || str_contains($msg, 'የቅንጦት')) {
        $preferredType = 'suite';
    } elseif (str_contains($msg, 'deluxe') || str_contains($msg, 'balcony') || str_contains($msg, 'ዴሉክስ') || str_contains($msg, 'በረንዳ')) {
        $preferredType = 'deluxe';
    } elseif (str_contains($msg, 'single') || str_contains($msg, 'solo') || str_contains($msg, 'ነጠላ')) {
        $preferredType = 'single';
    } elseif (str_contains($msg, 'double') || str_contains($msg, 'couple') || str_contains($msg, 'twin') || str_contains($msg, 'ድርብ') || str_contains($msg, 'ባለትዳር')) {
        $preferredType = 'double';
    }

    // Detect budget constraints (e.g., "under $150", "below 200", "ከ 200 በታች")
    if (preg_match('/(?:under|below|max|budget|less than|በታች)\s*\$?(\d+)/iu', $msg, $bMatches)) {
        $maxBudget = (float)$bMatches[1];
    }

    // Intent detections
    $isWifi = str_contains($msg, 'wifi') || str_contains($msg, 'wi-fi') || str_contains($msg, 'internet') || str_contains($msg, 'ዋይፋይ') || str_contains($msg, 'ኢንተርኔት');
    $isParking = str_contains($msg, 'parking') || str_contains($msg, 'car') || str_contains($msg, 'valet') || str_contains($msg, 'ፓርኪንግ') || str_contains($msg, 'መኪና ማቆሚያ');
    $isPayment = str_contains($msg, 'payment') || str_contains($msg, 'pay') || str_contains($msg, 'telebirr') || str_contains($msg, 'chapa') || str_contains($msg, 'cbe') || str_contains($msg, 'card') || str_contains($msg, 'cash') || str_contains($msg, 'ክፍያ') || str_contains($msg, 'መክፈል') || str_contains($msg, 'ቴሌብር') || str_contains($msg, 'ቻፓ') || str_contains($msg, 'ካርድ');
    $isTime = str_contains($msg, 'check-in') || str_contains($msg, 'checkout') || str_contains($msg, 'check in') || str_contains($msg, 'check out') || str_contains($msg, 'time') || str_contains($msg, 'hours') || str_contains($msg, 'መግቢያ') || str_contains($msg, 'መውጫ') || str_contains($msg, 'ሰዓት');
    $isBreakfast = str_contains($msg, 'breakfast') || str_contains($msg, 'ቁርስ');
    $isRoomService = str_contains($msg, 'room service') || str_contains($msg, 'የክፍል አገልግሎት') || str_contains($msg, 'delivery') || str_contains($msg, 'order to room');

    $isSpaOrGym = str_contains($msg, 'spa') || str_contains($msg, 'sauna') || str_contains($msg, 'gym') || str_contains($msg, 'jacuzzi') || str_contains($msg, 'fitness') || str_contains($msg, 'ስፓ') || str_contains($msg, 'ሳውና') || str_contains($msg, 'ጂም') || str_contains($msg, 'ጃኩዚ');

    $isBuildingOrFloorInquiry = $preferredFloor !== null || str_contains($msg, 'floor') || str_contains($msg, 'floors') || str_contains($msg, 'building') 
        || str_contains($msg, 'park') || str_contains($msg, 'garden') || str_contains($msg, 'fountain') || str_contains($msg, 'rooftop') || str_contains($msg, 'six') || str_contains($msg, '6')
        || str_contains($msg, 'feed') || str_contains($msg, 'refresh')
        || str_contains($msg, 'ፎቅ') || str_contains($msg, 'ፎቆች') || str_contains($msg, 'ህንፃ') || str_contains($msg, 'ፓርክ') 
        || str_contains($msg, 'ስድስት') || str_contains($msg, 'መናፈሻ') || str_contains($msg, 'መዝናኛ') || str_contains($msg, 'ፏፏቴ');

    $isRoomInquiry = $targetRoomNumber !== null || $preferredType !== null || str_contains($msg, 'room') || str_contains($msg, 'reserve') || str_contains($msg, 'book') 
        || str_contains($msg, 'free') || str_contains($msg, 'vacan') || str_contains($msg, 'stay') 
        || str_contains($msg, 'predict') || str_contains($msg, 'night') || str_contains($msg, 'guest')
        || str_contains($msg, 'ክፍል') || str_contains($msg, 'ክፍሎች') || str_contains($msg, 'ነፃ') 
        || str_contains($msg, 'ክፍት') || str_contains($msg, 'መያዝ') || str_contains($msg, 'ማስያዝ') 
        || str_contains($msg, 'ቦታ') || str_contains($msg, 'አልጋ') || str_contains($msg, 'መኝታ') 
        || str_contains($msg, 'ትንበያ');

    // Specific food & drink searches
    $isBeerOrDrink = str_contains($msg, 'beer') || str_contains($msg, 'draft') || str_contains($msg, 'habesha') || str_contains($msg, 'st george') || str_contains($msg, 'wine') || str_contains($msg, 'tej') || str_contains($msg, 'drink') || str_contains($msg, 'alcohol')
        || str_contains($msg, 'ቢራ') || str_contains($msg, 'ድራፍት') || str_contains($msg, 'ጠጅ') || str_contains($msg, 'መጠጥ') || str_contains($msg, 'ወይን');

    $isCoffeeOrJuice = str_contains($msg, 'coffee') || str_contains($msg, 'juice') || str_contains($msg, 'spris') || str_contains($msg, 'tea') || str_contains($msg, 'mango') || str_contains($msg, 'avocado')
        || str_contains($msg, 'ቡና') || str_contains($msg, 'ጭማቂ') || str_contains($msg, 'እስፕሪስ') || str_contains($msg, 'ሻይ');

    $isFastingOrVeg = str_contains($msg, 'fasting') || str_contains($msg, 'vegetarian') || str_contains($msg, 'vegan') || str_contains($msg, 'የጾም') || str_contains($msg, 'ጾም');

    $isTraditional = str_contains($msg, 'doro') || str_contains($msg, 'kitfo') || str_contains($msg, 'shiro') || str_contains($msg, 'tibs') || str_contains($msg, 'firfir') || str_contains($msg, 'traditional')
        || str_contains($msg, 'ዶሮ') || str_contains($msg, 'ክትፎ') || str_contains($msg, 'ሽሮ') || str_contains($msg, 'ጥብስ') || str_contains($msg, 'ፍርፍር') || str_contains($msg, 'ባህላዊ');

    $isDiningInquiry = $isBeerOrDrink || $isCoffeeOrJuice || $isFastingOrVeg || $isTraditional 
        || str_contains($msg, 'dining') || str_contains($msg, 'food') || str_contains($msg, 'eat') 
        || str_contains($msg, 'dish') || str_contains($msg, 'menu') || str_contains($msg, 'lunch') || str_contains($msg, 'dinner') 
        || str_contains($msg, 'steak') || str_contains($msg, 'sandwich') || str_contains($msg, 'order')
        || str_contains($msg, 'ምግብ') || str_contains($msg, 'ምግቦች') || str_contains($msg, 'ማዘዝ') || str_contains($msg, 'ትዕዛዝ');

    $isPriceInquiry = str_contains($msg, 'price') || str_contains($msg, 'cost') || str_contains($msg, 'rate') 
        || str_contains($msg, 'how much') || str_contains($msg, 'cheap') || str_contains($msg, 'discount') || str_contains($msg, 'affordable') || str_contains($msg, 'expensive')
        || str_contains($msg, 'ዋጋ') || str_contains($msg, 'ስንት ነው') || str_contains($msg, 'ብር') || str_contains($msg, 'ዶላር') || str_contains($msg, 'ቅናሽ') || str_contains($msg, 'ዝቅተኛ');

    $isPolicyInquiry = str_contains($msg, 'policy') || str_contains($msg, 'cancel') || str_contains($msg, 'rules')
        || str_contains($msg, 'ፖሊሲ') || str_contains($msg, 'ደንብ') || str_contains($msg, 'ህግ');

    // Live Query: Predict rooms using full filters
    $roomsResult = predictFreeRooms($conn, $checkIn, $checkOut, $guests, $preferredType, $maxBudget, $preferredFloor, $targetRoomNumber);

    // Live Query: Fetch dining based on intent
    $diningCategory = null;
    $diningSearch = null;
    if ($isBeerOrDrink) {
        $diningCategory = 'alcoholic_drink';
    } elseif ($isCoffeeOrJuice) {
        $diningCategory = 'soft_drink';
    } elseif ($isTraditional) {
        $diningSearch = 'Ethiopian Traditional';
    } elseif ($isFastingOrVeg) {
        $diningSearch = 'ሽሮ';
    }
    $diningResult = fetchHotelDining($conn, $diningCategory, $diningSearch);
    if (empty($diningResult['items']) && ($diningCategory || $diningSearch)) {
        // Fallback to all dining if specific filter had 0 results
        $diningResult = fetchHotelDining($conn);
    }

    $reply = "";
    $predictedRoomsToReturn = [];
    $diningToReturn = [];
    $suggestedQuestions = [];
    $action = "info";

    // =========================================================================
    // AMHARIC (አማርኛ) RESPONSES — TRAINED ON LIVE HOTEL DATA & POLICIES
    // =========================================================================
    if ($lang === 'am') {
        if ($isWifi) {
            $action = "faq";
            $reply = "📶 **ዋይፋይ (High-Speed WiFi)**፡ በሁሉም 6 ፎቆች፣ ክፍሎች እና በመዝናኛ ፓርኩ ግቢ ውስጥ ያልተገደበ ፈጣን ዋይፋይ በነፃ ይገኛል። የይለፍ ቃሉ በእንግዳ መቀበያው ወዲያውኑ ይሰጥዎታል።";
            $suggestedQuestions = ["ክፍት ክፍሎችን አሳየኝ", "የመግቢያ ሰዓት ስንት ነው?", "የምግብ ዝርዝር አሳየኝ"];
        } elseif ($isParking) {
            $action = "faq";
            $reply = "🚗 **መኪና ማቆሚያ (Valet Parking)**፡ በሆቴላችን የሪዞርት ፓርክ ፕላዛ ውስጥ አስተማማኝ፣ በካሜራ የሚጠበቅ የ24 ሰዓት ነፃ የመኪና ማቆሚያ (Valet Parking) አለን።";
            $suggestedQuestions = ["ክፍት ክፍሎችን አሳየኝ", "የምግብ ዝርዝር አሳየኝ", "የሆቴሉ አድራሻ የት ነው?"];
        } elseif ($isPayment) {
            $action = "faq";
            $reply = "💳 **የክፍያ መንገዶች**፡ በ**ቴሌብር (Telebirr)**፣ **ቻፓ (Chapa)**፣ **CBE Birr**፣ በባንክ ካርዶች (Visa/Mastercard) ወይም በጥሬ ገንዘብ (ETB/USD) መክፈል ይችላሉ። በድረ-ገጻችን በቀጥታ በቻፓ ይፈጸማል።";
            $suggestedQuestions = ["ለ 2 ሰው ክፍት ክፍል አሳየኝ", "የምግብ ዝርዝር አሳየኝ", "የመግቢያ ሰዓት ስንት ነው?"];
        } elseif ($isTime) {
            $action = "faq";
            $reply = "⏰ **የመግቢያና የመውጫ ሰዓት**፡\n• የመግቢያ ሰዓት (Check-in)፡ **ከቀኑ 8:00 (2:00 PM)** ጀምሮ\n• የመውጫ ሰዓት (Check-out)፡ **እስከ ቀኑ 6:00 (12:00 PM)**\n*(አስቀድሞ መግባት ወይም ማራዘም ሲፈልጉ ለሪሴፕሽን ማሳወቅ ይችላሉ)*";
            $suggestedQuestions = ["ክፍት ክፍሎችን አሳየኝ", "የክፍል ዋጋ ስንት ነው?", "በቴሌብር መክፈል ይቻላል?"];
        } elseif ($isSpaOrGym) {
            $action = "building_floors";
            $reply = "🧖 **የስፓ፣ ሳውና እና ጂም ማዕከል (ፎቅ 5)**፦\n"
                   . "• **የፊንላንድ ሳውና እና የእንፋሎት ገላ** (Finnish Sauna & Steam Bath)\n"
                   . "• **የማሳጅ ሕክምና እና የጃኩዚ ዘና ማድረጊያ**\n"
                   . "• **ዘመናዊ የሰውነት ማጎልመሻ ጂም** (Modern Fitness Gym)\n"
                   . "👉 የፎቅ 5 እና 6 እንግዶች በነፃ መገልገል ይችላሉ።";
            $predictedRoomsToReturn = array_values(array_filter($roomsResult['available_rooms'], fn($r) => $r['floor'] >= 5));
            if (empty($predictedRoomsToReturn)) {
                $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 2);
            }
            $suggestedQuestions = ["በፎቅ 5 ያለውን ሱዊት አሳየኝ", "በፎቅ 6 ያለውን ፔንትሀውስ አሳየኝ", "ክፍት ክፍሎችን አሳየኝ"];
        } elseif ($isBreakfast) {
            $action = "dining";
            $bItems = array_slice($diningResult['items'], 0, 3);
            $diningToReturn = $bItems;
            $reply = "🍳 **የቁርስ አገልግሎት**፡ በየቀኑ ከጠዋቱ 12:30 እስከ 4:30 በፎቅ 2 የምግብ አዳራሽ በቡፌ እና በባህላዊ ምርጫ ይቀርባል። ለ 24 ሰዓት ወደ ክፍልዎም ማዘዝ ይችላሉ።";
            $suggestedQuestions = ["ምግብ ወደ ክፍል ማዘዝ እፈልጋለሁ", "ክፍት ክፍሎችን አሳየኝ", "ባህላዊ ቡና አለ?"];
        } elseif ($isRoomService) {
            $action = "dining";
            $diningToReturn = array_slice($diningResult['items'], 0, 3);
            $reply = "🛎️ **የክፍል አገልግሎት (24/7 Room Service)**፡ ምግቦች፣ መክሰሶች እና መጠጦች በስልክ ወይም በሆቴል አይ በኩል በቀጥታ ወደ ክፍልዎ በፍጥነት ይደርሳሉ።";
            $suggestedQuestions = ["ዶሮ ወጥ ወደ ክፍሌ አዝዝ", "ቀዝቃዛ ቢራ አዝዝ", "የክፍል ዋጋ ስንት ነው?"];
        } 
        // Targeted Specific Room Number inquiry
        elseif ($targetRoomNumber !== null) {
            $action = "reserve";
            $matchedRoom = null;
            foreach (array_merge($roomsResult['available_rooms'], $roomsResult['occupied_rooms']) as $r) {
                if ((string)$r['room_number'] === (string)$targetRoomNumber) {
                    $matchedRoom = $r;
                    break;
                }
            }
            if ($matchedRoom) {
                $isFree = $matchedRoom['prediction']['is_free'];
                $predictedRoomsToReturn = $isFree ? [$matchedRoom] : [];
                $reply = "🏨 **ክፍል #" . $matchedRoom['room_number'] . " መረጃ**፦\n"
                       . "• **ዓይነት**፡ " . $matchedRoom['type_label_am'] . " (ፎቅ " . $matchedRoom['floor'] . ")\n"
                       . "• **የአንድ ሌሊት ዋጋ**፡ **$" . $matchedRoom['price_per_night'] . "**\n"
                       . "• **አቅም**፡ እስከ " . $matchedRoom['max_guests'] . " ሰው\n"
                       . "• **ምቾቶች**፡ " . implode(', ', $matchedRoom['amenities']) . "\n"
                       . "• **ሁኔታ**፡ " . ($isFree ? "✅ **ክፍት ነው!** ወዲያውኑ ማስያዝ ይችላሉ።" : "⚠️ **ለተመረጡት ቀናት ተይዟል።**");
                if ($isFree) {
                    $suggestedQuestions = ["ክፍል #" . $matchedRoom['room_number'] . "ን አሲዝልኝ", "ሌሎች ክፍት ክፍሎችን አሳየኝ", "የምግብ ዝርዝር አሳየኝ"];
                } else {
                    $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 2);
                    $suggestedQuestions = ["ሌሎች ክፍት ክፍሎችን አሳየኝ", "የመግቢያ ሰዓት ስንት ነው?", "የምግብ ዝርዝር አሳየኝ"];
                }
            } else {
                $reply = "⚠️ ክፍል #" . $targetRoomNumber . " በሆቴላችን አልተገኘም። በሆቴላችን ከፎቅ 1 እስከ 6 ድረስ 16 ምርጥ ክፍሎች አሉን።";
                $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 3);
                $suggestedQuestions = ["ክፍት ክፍሎችን አሳየኝ", "የሆቴሉን 6 ፎቆች አሳየኝ", "የክፍል ዋጋዎችን አሳየኝ"];
            }
        }
        // Specific Floor inquiry (Floor 1 to 6)
        elseif ($preferredFloor !== null) {
            $action = "building_floors";
            $floorNamesAm = [
                1 => 'ፎቅ 1፡ ዋና እንግዳ መቀበያ እና የሪዞርት ፓርክ ፕላዛ',
                2 => 'ፎቅ 2፡ ዓለም አቀፍ እና ባህላዊ የምግብ አዳራሽ (Dining & Feeding)',
                3 => 'ፎቅ 3፡ የማደሻ ላውንጅ፣ የኮክቴል ባር እና ባህላዊ ካፌ (Refreshment)',
                4 => 'ፎቅ 4፡ ኤግዚክዩቲቭ ቢዝነስ እና የዴሉክስ እንግዳ ክፍሎች',
                5 => 'ፎቅ 5፡ የቪአይፒ አምባሳደር ሱዊት እና የስፓ ጤና ማዕከል',
                6 => 'ፎቅ 6፡ የንጉሳዊ ሰማይ ፔንትሀውስ እና ጣሪያ ላይ ያለ ፓርክ (Rooftop Park)'
            ];
            $floorDescsAm = [
                1 => 'የመጀመሪያው ፎቅ የእንግዳ መቀበያ፣ ረዳት ዴስክ እና ወደ ለምለም ውጫዊ መናፈሻ ፓርክ፣ ፏፏቴዎችና ጋዜቦዎች የሚወስዱ መተላለፊያዎችን ያካትታል።',
                2 => 'ዓለም አቀፍ ሬስቶራንት፣ የሸክላ ባህላዊ የኢትዮጵያ ምግቦች አዳራሽ፣ የቁርስ በረንዳ እና የቀጥታ ኩሽና ያለው የምግብ ፎቅ ነው።',
                3 => 'የፓርኩን እይታ የሚያሳይ አስደሳች የማረፊያ ፎቅ፤ የተመረጡ ኮክቴሎች፣ ቀዝቃዛ ቢራዎች፣ የተፈጥሮ ጭማቂዎች እና ባህላዊ ቡና ይቀርባሉ።',
                4 => 'ለዓለም አቀፍ ተጓዦች እና ለቢዝነስ ባለሙያዎች የተዘጋጀ ጸጥ ያለ ፎቅ፤ የፓርኩን እይታ የሚያሳዩ በረንዳ ያላቸው የዴሉክስ ክፍሎችን ያካትታል።',
                5 => 'የጤና እና የቅንጦት ፎቅ፤ የሳውና እና የእንፋሎት ገላ፣ ማሳጅ፣ ዘመናዊ ጂም እና የግል አገልጋይ ያላቸው ሱዊቶችን ይዟል።',
                6 => 'የከፍተኛ ደረጃ መስተንግዶ ማማ፤ የግል ጣሪያ ፓርክ፣ 360-ዲግሪ የከተማ እይታ፣ ውጫዊ ጃኩዚ እና የሰማይ ላውንጅ ባር አለው።'
            ];

            $floorRooms = array_values(array_filter($roomsResult['available_rooms'], fn($r) => $r['floor'] === $preferredFloor));
            $predictedRoomsToReturn = !empty($floorRooms) ? array_slice($floorRooms, 0, 3) : array_slice($roomsResult['available_rooms'], 0, 2);

            $reply = "🏨 **" . ($floorNamesAm[$preferredFloor] ?? "ፎቅ $preferredFloor") . "**፦\n"
                   . ($floorDescsAm[$preferredFloor] ?? "") . "\n\n"
                   . "🛏️ **በዚህ ፎቅ ላይ ያሉ ክፍት ክፍሎች**፦ " . count($floorRooms) . " ክፍሎች ዝግጁ ናቸው።";
            
            $suggestedQuestions = [
                "በፎቅ $preferredFloor ላይ ክፍል አሲዝ",
                "የሆቴሉን 6 ፎቆች በሙሉ አሳየኝ",
                "የምግብ ዝርዝር አሳየኝ"
            ];
        }
        // General Building & 6 Floors inquiry
        elseif ($isBuildingOrFloorInquiry) {
            $action = "building_floors";
            $reply = "🏨 **የ6 ፎቅ ዓለም አቀፍ ህንፃ እና የሪዞርት ፓርክ መዋቅር**፦\n"
                   . "• **ፎቅ 1**፡ ዋና እንግዳ መቀበያ፣ ፏፏቴ ያለው የመዝናኛ ፓርክ እና ጋዜቦ\n"
                   . "• **ፎቅ 2**፡ የምግብ አዳራሽ (ዶሮ ወጥ፣ ክትፎ፣ ስቴክ፣ ቡፌ)\n"
                   . "• **ፎቅ 3**፡ የማደሻ ላውንጅ፣ ቀዝቃዛ ቢራ፣ ኮክቴል ባር እና ባህላዊ ቡና\n"
                   . "• **ፎቅ 4**፡ የዴሉክስ እንግዳ ክፍሎች እና የቢዝነስ ማዕከል\n"
                   . "• **ፎቅ 5**፡ የቪአይፒ አምባሳደር ሱዊት፣ ስፓ፣ ሳውና እና ዘመናዊ ጂም\n"
                   . "• **ፎቅ 6**፡ የሰማይ ፔንትሀውስ እና ጣሪያ ላይ ያለ ፓርክ (Rooftop Park)\n\n"
                   . "👉 **በየትኛው ፎቅ ላይ ማረፍ ይመርጣሉ?**";
            $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 3);
            $suggestedQuestions = ["በፎቅ 6 ያለውን ፔንትሀውስ አሳየኝ", "በፎቅ 2 ያለውን ምግብ አሳየኝ", "በፎቅ 5 ያለውን ስፓ አሳየኝ"];
        }
        // Room and Dining combined inquiry
        elseif ($isRoomInquiry && $isDiningInquiry) {
            $action = "reserve_and_dine";
            $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 3);
            $diningToReturn = array_slice($diningResult['items'], 0, 3);

            $diningNames = [];
            foreach ($diningToReturn as $dItem) {
                $diningNames[] = $dItem['name'] . " ($" . $dItem['price'] . ")";
            }

            $reply = "🏨 **ክፍት ክፍሎች እና ምግቦች መረጃ**፦\n"
                   . "• **ክፍት ክፍሎች**፡ ከ " . $roomsResult['check_in'] . " እስከ " . $roomsResult['check_out'] . " ድረስ **" . $roomsResult['free_count'] . " ክፍሎች** ዝግጁ ናቸው።\n"
                   . "• **ዝግጁ ምግቦች**፡ " . implode(', ', $diningNames) . "\n\n"
                   . "👉 **ስንት እንግዳዎች ይሆናሉ? ክፍል እና ምግብ አስቀድሜ ላዘጋጅልዎ?**";
            $suggestedQuestions = ["ለ 2 ሰው ክፍል እና ምግብ አሲዝ", "የክፍል ዋጋዎችን በዝርዝር አሳየኝ", "የመግቢያ ሰዓት ስንት ነው?"];
        }
        // Room Inquiry or Price inquiry
        elseif ($isRoomInquiry || $isPriceInquiry) {
            $action = "reserve";
            $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 3);
            if ($roomsResult['free_count'] > 0) {
                $reply = "🛏️ **ለተመረጡት ቀናት (" . $roomsResult['check_in'] . " - " . $roomsResult['check_out'] . ") " . $roomsResult['free_count'] . " ክፍት ክፍሎች አሉ**፦\n";
                foreach ($predictedRoomsToReturn as $r) {
                    $reply .= "• **ክፍል #" . $r['room_number'] . "** (" . $r['type_label_am'] . " - ፎቅ " . $r['floor'] . ") ፦ **$" . $r['price_per_night'] . "/ሌሊት** (እስከ " . $r['max_guests'] . " ሰው)\n";
                }
                $reply .= "\n👉 **የትኛውን ክፍል ማስያዝ ይፈልጋሉ?**";
            } else {
                $reply = "⚠️ ለተመረጡት ቀናት ክፍሎች በሙሉ ተይዘዋል። ለሌላ አማራጭ ቀን እንድፈልግልዎ ይፈልጋሉ?";
            }
            $suggestedQuestions = [
                "ክፍል #" . (!empty($predictedRoomsToReturn) ? $predictedRoomsToReturn[0]['room_number'] : '101') . "ን አሲዝልኝ",
                "በሆቴሉ ምን ምግቦች አሉ?",
                "ክፍያ በቴሌብር ይቻላል?"
            ];
        }
        // Dining Inquiry
        elseif ($isDiningInquiry) {
            $action = "dining";
            $diningToReturn = array_slice($diningResult['items'], 0, 4);
            $reply = "🍽️ **ዝግጁ የሆኑ ምግቦችና መጠጦች (በቀጥታ ከኩሽና)**፦\n";
            foreach ($diningToReturn as $dItem) {
                $reply .= "• **" . $dItem['name'] . "** ፦ **$" . $dItem['price'] . "** (" . ($dItem['preparation_time'] ?: '15 ደቂቃ') . ")\n";
            }
            $reply .= "\n👉 **ወደ ክፍልዎ እንዲታዘዝ ወይም በሬስቶራንት እንዲዘጋጅ ይፈልጋሉ?**";
            $suggestedQuestions = ["ዶሮ ወጥ እና ሀበሻ ቢራ አዝዝ", "የጾም ምግብ ምን አለ?", "ክፍት ክፍሎችን አሳየኝ"];
        }
        // Policies Inquiry
        elseif ($isPolicyInquiry) {
            $action = "policy";
            $reply = "📋 **የሆቴላችን ደንቦች ባጭሩ**፦\n"
                   . "• **መግቢያ**፡ ከቀኑ 8:00 (2:00 PM) | **መውጫ**፡ እስከ ቀኑ 6:00 (12:00 PM)\n"
                   . "• **ዋይፋይና ፓርኪንግ**፡ በነፃ 24/7\n"
                   . "• **የክፍያ መንገዶች**፡ ቴሌብር፣ ቻፓ፣ CBE Birr፣ ካርድ ወይም ጥሬ ገንዘብ\n\n"
                   . "👉 **በምን ልርዳዎት?**";
            $suggestedQuestions = ["ክፍት ክፍሎችን አሳየኝ", "የምግብ ዝርዝር አሳየኝ", "በቴሌብር እንዴት መክፈል ይቻላል?"];
        } else {
            $action = "greeting";
            $reply = "ሰላም! እኔ **ሆቴል አይ (Hotel AI)** ነኝ። 🏨\n"
                   . "ክፍት ክፍሎችን ከነዋጋቸው መተንበይ፣ ዝግጁ ምግቦችን ማሳወቅ እና የ6ቱን ፎቆች አገልግሎት ማስረዳት እችላለሁ።\n\n"
                   . "👉 **ምን ማወቅ ይፈልጋሉ?**";
            $suggestedQuestions = [
                "ለ 2 ሰው ክፍት ክፍሎችን አሳየኝ",
                "በሆቴሉ ምን ምግቦች አሉ?",
                "የሆቴሉን 6 ፎቆች አሳየኝ"
            ];
        }
    }
    // =========================================================================
    // ENGLISH RESPONSES — TRAINED ON LIVE HOTEL DATA & POLICIES
    // =========================================================================
    else {
        if ($isWifi) {
            $action = "faq";
            $reply = "📶 **High-Speed Optical WiFi**: Complimentary across all 6 floors, guest suites, and the botanical resort park. Access credentials are provided at front desk check-in.";
            $suggestedQuestions = ["Show free rooms", "What is check-in time?", "Show available dining"];
        } elseif ($isParking) {
            $action = "faq";
            $reply = "🚗 **Valet Parking**: Complimentary and secure 24/7 valet parking with CCTV surveillance is located directly inside the hotel resort park plaza.";
            $suggestedQuestions = ["Show free rooms", "Show dining menu", "What payment methods do you accept?"];
        } elseif ($isPayment) {
            $action = "faq";
            $reply = "💳 **Payment Methods**: We accept **Chapa Online Payment**, **Telebirr**, **CBE Birr**, major Credit/Debit Cards (Visa/Mastercard), and Cash (ETB/USD).";
            $suggestedQuestions = ["Predict free rooms for 2 guests", "Show dining menu", "What are check-in hours?"];
        } elseif ($isTime) {
            $action = "faq";
            $reply = "⏰ **Check-in & Check-out Times**:\n• **Check-in**: From **2:00 PM**\n• **Check-out**: Until **12:00 PM (Noon)**\n*(Early check-in and late checkout can be arranged upon request.)*";
            $suggestedQuestions = ["Predict free rooms", "Which dining is available?", "Do you accept Telebirr?"];
        } elseif ($isSpaOrGym) {
            $action = "building_floors";
            $reply = "🧖 **Floor 5: VIP Ambassador Sanctuary & Wellness Spa**:\n"
                   . "• **Finnish Sauna & Herbal Steam Baths**\n"
                   . "• **Therapeutic Massage & In-Room Jacuzzi Suites**\n"
                   . "• **Modern Cardio & Strength Fitness Gym**\n"
                   . "👉 Complimentary access for Floor 5 & Floor 6 guests.";
            $predictedRoomsToReturn = array_values(array_filter($roomsResult['available_rooms'], fn($r) => $r['floor'] >= 5));
            if (empty($predictedRoomsToReturn)) {
                $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 2);
            }
            $suggestedQuestions = ["Show Floor 5 Suites", "Show Floor 6 Penthouse", "Show all free rooms"];
        } elseif ($isBreakfast) {
            $action = "dining";
            $diningToReturn = array_slice($diningResult['items'], 0, 3);
            $reply = "🍳 **Breakfast Service**: Served daily from **6:30 AM to 10:30 AM** at the Floor 2 International Dining Plaza (international buffet & Ethiopian breakfast specialties), or delivered 24/7 to your room.";
            $suggestedQuestions = ["Order breakfast to room", "Show free rooms", "Show drinks menu"];
        } elseif ($isRoomService) {
            $action = "dining";
            $diningToReturn = array_slice($diningResult['items'], 0, 3);
            $reply = "🛎️ **24/7 Room Service**: Available round the clock! You can order gourmet meals, snacks, cold beers, and artisan coffee directly to your room.";
            $suggestedQuestions = ["Order Doro Wat to room", "Order Habesha Cold Beer", "Show room rates"];
        }
        // Targeted Specific Room Number inquiry
        elseif ($targetRoomNumber !== null) {
            $action = "reserve";
            $matchedRoom = null;
            foreach (array_merge($roomsResult['available_rooms'], $roomsResult['occupied_rooms']) as $r) {
                if ((string)$r['room_number'] === (string)$targetRoomNumber) {
                    $matchedRoom = $r;
                    break;
                }
            }
            if ($matchedRoom) {
                $isFree = $matchedRoom['prediction']['is_free'];
                $predictedRoomsToReturn = $isFree ? [$matchedRoom] : [];
                $reply = "🏨 **Room #" . $matchedRoom['room_number'] . " Live Details**:\n"
                       . "• **Type**: " . $matchedRoom['type_label_en'] . " (Floor " . $matchedRoom['floor'] . ")\n"
                       . "• **Rate**: **$" . $matchedRoom['price_per_night'] . "/night**\n"
                       . "• **Max Capacity**: " . $matchedRoom['max_guests'] . " guests\n"
                       . "• **Amenities**: " . implode(', ', $matchedRoom['amenities']) . "\n"
                       . "• **Availability**: " . ($isFree ? "✅ **Guaranteed Free** for selected dates!" : "⚠️ **Reserved** for selected dates.");
                if ($isFree) {
                    $suggestedQuestions = ["Book Room #" . $matchedRoom['room_number'], "Show other free rooms", "Show available dining"];
                } else {
                    $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 2);
                    $suggestedQuestions = ["Show alternative free rooms", "What is check-in time?", "Show available dining"];
                }
            } else {
                $reply = "⚠️ Room #" . $targetRoomNumber . " was not found in our room catalog. We have 16 luxury rooms across 6 floors.";
                $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 3);
                $suggestedQuestions = ["Show all free rooms", "Show the 6 floors & park", "What are room rates?"];
            }
        }
        // Specific Floor inquiry (Floor 1 to 6)
        elseif ($preferredFloor !== null) {
            $action = "building_floors";
            $floorNamesEn = [
                1 => 'Floor 1: Grand Lobby & Resort Park Plaza',
                2 => 'Floor 2: International Feeding & Traditional Banquet Plaza',
                3 => 'Floor 3: Refreshment Lounge, Bar & Artisan Café',
                4 => 'Floor 4: Executive Business & Deluxe Hospitality Suites',
                5 => 'Floor 5: VIP Ambassador Sanctuary & Wellness Spa',
                6 => 'Floor 6: Royal Sky Penthouse & Panoramic Rooftop Park'
            ];
            $floorDescsEn = [
                1 => 'Grand marble reception, 24/7 concierge desk, coffee lounge, and direct walkways to the botanical resort park and illuminated fountains.',
                2 => 'International restaurant, authentic Ethiopian clay-pot banquet hall, live kitchen, breakfast terrace, and private dining rooms.',
                3 => 'Vibrant relaxation lounge overlooking the resort park, offering craft cocktails, cold draft beers, fresh smoothies, and traditional roasted coffee.',
                4 => 'Quiet executive floor for business professionals and diplomats with boardroom access, work desks, and park-view balconies.',
                5 => 'Finnish sauna, herbal steam baths, massage sanctuary, modern gym, and Ambassador Jacuzzi suites with butler service.',
                6 => 'The pinnacle of luxury: top-floor Royal Penthouse, private rooftop park gardens, skyline views, outdoor jacuzzi, and sky lounge bar.'
            ];

            $floorRooms = array_values(array_filter($roomsResult['available_rooms'], fn($r) => $r['floor'] === $preferredFloor));
            $predictedRoomsToReturn = !empty($floorRooms) ? array_slice($floorRooms, 0, 3) : array_slice($roomsResult['available_rooms'], 0, 2);

            $reply = "🏨 **" . ($floorNamesEn[$preferredFloor] ?? "Floor $preferredFloor") . "**:\n"
                   . ($floorDescsEn[$preferredFloor] ?? "") . "\n\n"
                   . "🛏️ **Live Available Rooms on this floor**: " . count($floorRooms) . " room(s) ready for booking.";
            
            $suggestedQuestions = [
                "Book a room on Floor $preferredFloor",
                "Explain the 6-floor hospitality building",
                "Show dining menu"
            ];
        }
        // General Building & 6 Floors inquiry
        elseif ($isBuildingOrFloorInquiry) {
            $action = "building_floors";
            $reply = "🏨 **Grand 6-Floor Hospitality Palace & Resort Park Layout**:\n"
                   . "• **Floor 1**: Reception, Concierge & Botanical Resort Park with Fountains\n"
                   . "• **Floor 2**: Feeding & Dining (Traditional Clay-Pot Banquet & Global Buffets)\n"
                   . "• **Floor 3**: Refreshment Lounge (Cocktail Bar, Cold Draft Beers & Coffee Ceremony)\n"
                   . "• **Floor 4**: Executive Business Hub & Deluxe Hospitality Suites\n"
                   . "• **Floor 5**: VIP Ambassador Suites, Spa, Sauna & Fitness Pavilion\n"
                   . "• **Floor 6**: Royal Sky Penthouse & Panoramic Rooftop Park\n\n"
                   . "👉 **Which floor would you prefer for your stay?**";
            $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 3);
            $suggestedQuestions = ["Show Floor 6 Penthouse", "Show Floor 2 Dining", "Show Floor 5 Spa"];
        }
        // Combined Rooms & Dining inquiry
        elseif ($isRoomInquiry && $isDiningInquiry) {
            $action = "reserve_and_dine";
            $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 3);
            $diningToReturn = array_slice($diningResult['items'], 0, 3);

            $diningNames = [];
            foreach ($diningToReturn as $dItem) {
                $diningNames[] = $dItem['name'] . " ($" . $dItem['price'] . ")";
            }

            $reply = "🏨 **Live Room Availability & Chef Recommendations**:\n"
                   . "• **Free Rooms**: **" . $roomsResult['free_count'] . " rooms available** for " . $roomsResult['check_in'] . " to " . $roomsResult['check_out'] . ".\n"
                   . "• **Fresh Dining**: " . implode(', ', $diningNames) . "\n\n"
                   . "👉 **How many guests are staying, and would you like to pre-order dinner?**";
            $suggestedQuestions = ["Reserve for 2 guests with dinner", "Show all free room rates", "What is check-in time?"];
        }
        // Room Inquiry or Price inquiry
        elseif ($isRoomInquiry || $isPriceInquiry) {
            $action = "reserve";
            $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 3);
            if ($roomsResult['free_count'] > 0) {
                $reply = "🛏️ **" . $roomsResult['free_count'] . " Free Rooms Available (" . $roomsResult['check_in'] . " to " . $roomsResult['check_out'] . ")**:\n";
                foreach ($predictedRoomsToReturn as $r) {
                    $reply .= "• **Room #" . $r['room_number'] . "** (" . $r['type_label_en'] . " - Floor " . $r['floor'] . "): **$" . $r['price_per_night'] . "/night** (Max " . $r['max_guests'] . " guests)\n";
                }
                $reply .= "\n👉 **Which room would you like to reserve?**";
            } else {
                $reply = "⚠️ Currently all rooms are booked for those exact dates. Would you like me to check alternative dates?";
            }
            $suggestedQuestions = [
                "Book Room #" . (!empty($predictedRoomsToReturn) ? $predictedRoomsToReturn[0]['room_number'] : '101'),
                "Which dining is available in this hotel?",
                "Do you accept Telebirr / Chapa?"
            ];
        }
        // Dining Inquiry
        elseif ($isDiningInquiry) {
            $action = "dining";
            $diningToReturn = array_slice($diningResult['items'], 0, 4);
            $reply = "🍽️ **Fresh Dining & Drinks Available From Our Kitchen**:\n";
            foreach ($diningToReturn as $dItem) {
                $reply .= "• **" . $dItem['name'] . "** ፦ **$" . $dItem['price'] . "** (" . ($dItem['preparation_time'] ?: '15 mins') . ")\n";
            }
            $reply .= "\n👉 **Would you like to pre-order any dish or beverage to your room?**";
            $suggestedQuestions = ["Add Doro Wat & Habesha Beer", "Show fasting / vegetarian dishes", "Predict free rooms"];
        }
        // Policy Inquiry
        elseif ($isPolicyInquiry) {
            $action = "policy";
            $reply = "📋 **Hotel Policies & Guest Services**:\n"
                   . "• **Check-in**: From 2:00 PM | **Check-out**: By 12:00 PM\n"
                   . "• **Amenities**: Free High-Speed WiFi, Valet Parking, 24/7 Room Service\n"
                   . "• **Payments**: Telebirr, Chapa, CBE Birr, Visa/Mastercard, Cash\n\n"
                   . "👉 **How may I assist your booking today?**";
            $suggestedQuestions = ["Predict free rooms", "Which dining is available?", "How to pay with Telebirr?"];
        } else {
            $action = "greeting";
            $reply = "Hello! I am **Hotel AI**. 🏨\n"
                   . "I provide real-time room availability, live menu recommendations, and 6-floor resort information.\n\n"
                   . "👉 **What would you like to explore?**";
            $suggestedQuestions = [
                "Predict free rooms for 2 guests",
                "Which dining is available in this hotel?",
                "Show the 6-floor building & park"
            ];
        }
    }

    return [
        'reply' => $reply,
        'ai_name' => 'Hotel AI',
        'language' => $lang,
        'action' => $action,
        'predicted_rooms' => $predictedRoomsToReturn,
        'available_dining' => $diningToReturn,
        'suggested_questions' => $suggestedQuestions,
        'reservation_params' => [
            'check_in' => $roomsResult['check_in'],
            'check_out' => $roomsResult['check_out'],
            'nights' => $roomsResult['nights'],
            'guests' => $guests,
            'preferred_type' => $preferredType
        ]
    ];
}

// Router for actions
switch ($action) {
    case 'chat':
        if ($method !== 'POST') {
            json_fail(405, 'POST method required for chat');
        }
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $userMessage = trim($data['message'] ?? '');
        $context = $data['context'] ?? [];
        $sessionId = trim($data['session_id'] ?? ($authUser ? 'user_' . $authUser['id'] : 'guest_' . session_id()));
        if (!$sessionId) {
            $sessionId = 'session_' . bin2hex(random_bytes(8));
        }

        if (!$userMessage) {
            json_fail(400, 'Message cannot be empty');
        }

        // Save customer message
        $stmt = $conn->prepare("INSERT INTO hotel_ai_chats (user_id, session_id, sender, message, metadata) VALUES (?, ?, 'customer', ?, ?)");
        $uId = $authUser ? $authUser['id'] : null;
        $metaJson = json_encode($context);
        $stmt->bind_param('isss', $uId, $sessionId, $userMessage, $metaJson);
        $stmt->execute();

        // Process message through Bilingual Hotel AI engine
        $response = processHotelAIConversation($conn, $userMessage, $context);
        $response['session_id'] = $sessionId;

        // Save AI reply to history
        $replyText = $response['reply'];
        $replyMeta = json_encode([
            'action' => $response['action'],
            'language' => $response['language'],
            'suggested_questions' => $response['suggested_questions'],
            'reservation_params' => $response['reservation_params']
        ]);
        $insAi = $conn->prepare("INSERT INTO hotel_ai_chats (user_id, session_id, sender, message, metadata) VALUES (?, ?, 'hotel_ai', ?, ?)");
        $insAi->bind_param('isss', $uId, $sessionId, $replyText, $replyMeta);
        $insAi->execute();

        json_ok($response);
        break;

    case 'predict_rooms':
        $checkIn = $_GET['check_in'] ?? null;
        $checkOut = $_GET['check_out'] ?? null;
        $guests = isset($_GET['guests']) ? (int)$_GET['guests'] : 1;
        $type = $_GET['type'] ?? null;
        $budget = isset($_GET['budget']) ? (float)$_GET['budget'] : null;
        $floor = isset($_GET['floor']) ? (int)$_GET['floor'] : null;
        $roomNum = $_GET['room_number'] ?? null;

        $prediction = predictFreeRooms($conn, $checkIn, $checkOut, $guests, $type, $budget, $floor, $roomNum);
        json_ok($prediction);
        break;

    case 'dining':
        $category = $_GET['category'] ?? null;
        $search = $_GET['search'] ?? null;
        $dining = fetchHotelDining($conn, $category, $search);
        json_ok($dining);
        break;

    case 'history':
        $sessionId = $_GET['session_id'] ?? ($authUser ? 'user_' . $authUser['id'] : '');
        if (!$sessionId && !$authUser) {
            json_ok([]);
            break;
        }

        if ($authUser) {
            $stmt = $conn->prepare("SELECT * FROM hotel_ai_chats WHERE user_id = ? OR session_id = ? ORDER BY created_at ASC LIMIT 50");
            $stmt->bind_param('is', $authUser['id'], $sessionId);
        } else {
            $stmt = $conn->prepare("SELECT * FROM hotel_ai_chats WHERE session_id = ? ORDER BY created_at ASC LIMIT 50");
            $stmt->bind_param('s', $sessionId);
        }
        $stmt->execute();
        $history = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

        // Decode metadata
        foreach ($history as &$h) {
            if ($h['metadata']) {
                $h['metadata'] = json_decode($h['metadata'], true);
            }
        }
        json_ok($history);
        break;

    case 'clear_history':
        if ($method !== 'POST') {
            json_fail(405, 'POST required');
        }
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $sessionId = $data['session_id'] ?? ($authUser ? 'user_' . $authUser['id'] : '');
        if ($authUser) {
            $stmt = $conn->prepare("DELETE FROM hotel_ai_chats WHERE user_id = ? OR session_id = ?");
            $stmt->bind_param('is', $authUser['id'], $sessionId);
        } else {
            $stmt = $conn->prepare("DELETE FROM hotel_ai_chats WHERE session_id = ?");
            $stmt->bind_param('s', $sessionId);
        }
        $stmt->execute();
        json_ok(['message' => 'Chat history cleared']);
        break;

    case 'building_floors':
        $roomsRes = $conn->query("SELECT r.*,
            CASE WHEN r.status = 'occupied' THEN 1
                 WHEN EXISTS (SELECT 1 FROM bookings b WHERE b.room_id = r.id AND b.status IN ('confirmed','checked_in') AND b.check_in <= CURDATE() AND b.check_out >= CURDATE()) THEN 1
                 ELSE 0 END AS is_booked
            FROM rooms r ORDER BY r.floor ASC, r.room_number ASC");
        $allRooms = $roomsRes ? $roomsRes->fetch_all(MYSQLI_ASSOC) : [];
        $roomsByFloor = [];
        foreach ($allRooms as $r) {
            $f = (int)$r['floor'];
            if (!isset($roomsByFloor[$f])) {
                $roomsByFloor[$f] = [];
            }
            $r['amenities'] = array_values(array_filter(array_map('trim', explode(',', $r['amenities'] ?: ''))));
            $roomsByFloor[$f][] = $r;
        }

        $floors = [
            [
                'floor' => 1,
                'name_en' => 'Floor 1: Grand Lobby & Resort Park Plaza',
                'name_am' => 'ፎቅ 1፡ ዋና የእንግዳ መቀበያ እና የሪዞርት ፓርክ',
                'purpose_en' => 'Hospitality, Valet Parking, Concierge & Resort Park Access',
                'purpose_am' => 'የእንግዳ አቀባበል፣ ቫሌት ፓርኪንግ እና የመዝናኛ ፓርክ መግቢያ',
                'description_en' => 'The ground floor houses our magnificent marble reception, 24/7 concierge desk, coffee lounge, and direct walkways to the lush outdoor resort park, fountains, and illuminated gazebos.',
                'description_am' => 'የመጀመሪያው ፎቅ የሆቴላችንን ግዙፍ የእንግዳ መቀበያ፣ የ24/7 ረዳት ዴስክ፣ የቡና ላውንጅ እና ወደ ለምለም ውጫዊ መዝናኛ ፓርክ፣ ፏፏቴዎችና ጋዜቦዎች የሚወስዱ መተላለፊያዎችን ያካትታል።',
                'image' => '/images/hotel_building_park.jpg',
                'highlights' => ['Resort Park Walkways', 'Illuminated Fountains', '24/7 Reception', 'Garden Terrace Rooms'],
                'rooms' => $roomsByFloor[1] ?? []
            ],
            [
                'floor' => 2,
                'name_en' => 'Floor 2: International Feeding & Traditional Banquet Plaza',
                'name_am' => 'ፎቅ 2፡ ዓለም አቀፍ እና ባህላዊ የምግብ አዳራሽ (Feeding & Dining)',
                'purpose_en' => 'International Dining, Ethiopian Banquet, Live Kitchen & Buffets',
                'purpose_am' => 'ዓለም አቀፍ ምግቦች፣ የኢትዮጵያ ባህላዊ ድግስ፣ ቡፌ እና የቀጥታ ኩሽና',
                'description_en' => 'Dedicated to world-class dining and culinary hospitality. Features our grand international restaurant, authentic Ethiopian clay-pot banquet hall, breakfast terrace, and private dining rooms.',
                'description_am' => 'የተሟላ የምግብና የመስተንግዶ ፎቅ። ዓለም አቀፍ ሬስቶራንት፣ የሸክላ ባህላዊ የኢትዮጵያ ምግቦች አዳራሽ፣ የቁርስ በረንዳ እና የቪአይፒ መመገቢያ ክፍሎችን ይዟል።',
                'image' => '/images/guests_dining_feeding.jpg',
                'highlights' => ['Authentic Doro Wat & Kitfo', 'Prime Ribeye Steaks', 'Live Cooking Stations', 'Outdoor Dining Terrace'],
                'rooms' => $roomsByFloor[2] ?? []
            ],
            [
                'floor' => 3,
                'name_en' => 'Floor 3: Refreshment Lounge, Bar & Artisan Café',
                'name_am' => 'ፎቅ 3፡ የማደሻ ላውንጅ፣ የኮክቴል ባር እና ካፌ (Refreshment & Drinking)',
                'purpose_en' => 'Refreshments, Craft Cocktails, Draft Beers, Layered Juices & Coffee Ceremony',
                'purpose_am' => 'ማደሻ መጠጦች፣ የእጅ ጥበብ ኮክቴሎች፣ ቀዝቃዛ ቢራ፣ የተፈጥሮ ጭማቂ እና የቡና ስርዓት',
                'description_en' => 'A vibrant relaxation floor with panoramic park views. Guests enjoy handcrafted cocktails, cold draft beers, fresh fruit smoothies, and traditional Ethiopian roasted coffee.',
                'description_am' => 'የፓርኩን እይታ የሚያሳይ አስደሳች የማረፊያ ፎቅ። እንግዶች የተመረጡ ኮክቴሎችን፣ ቀዝቃዛ ድራፍት ቢራዎችን፣ ትኩስ የተፈጥሮ ጭማቂዎችን እና ባህላዊ የቡና ስርዓትን ያገኛሉ።',
                'image' => '/images/guests_refreshment_drinking.jpg',
                'highlights' => ['Artisan Cocktail Bar', 'Cold Draft Beer Taps', 'Fresh Layered Spris Juices', 'Ethiopian Coffee Ceremony'],
                'rooms' => $roomsByFloor[3] ?? []
            ],
            [
                'floor' => 4,
                'name_en' => 'Floor 4: Executive Business & Deluxe Hospitality Suites',
                'name_am' => 'ፎቅ 4፡ ኤግዚክዩቲቭ ቢዝነስ እና የዴሉክስ እንግዳ ክፍሎች',
                'purpose_en' => 'High-Floor Deluxe Hospitality, Business Hub & Diplomatic Suites',
                'purpose_am' => 'ከፍተኛ ፎቅ የዴሉክስ መስተንግዶ፣ የቢዝነስ ማዕከል እና የዲፕሎማት ክፍሎች',
                'description_en' => 'Quiet, prestigious floor designed for international travelers and business executives, offering soundproof deluxe suites with balconies overlooking the resort park.',
                'description_am' => 'ለዓለም አቀፍ ተጓዦች እና ለቢዝነስ ባለሙያዎች የተዘጋጀ ጸጥ ያለ ፎቅ፤ የፓርኩን እይታ የሚያሳዩ በረንዳ ያላቸው የዴሉክስ ክፍሎችን ያካትታል።',
                'image' => '/images/hotel_building_park.jpg',
                'highlights' => ['High-Speed WiFi & Work Desks', 'Park View Balconies', 'Executive Boardroom', 'Express Room Service'],
                'rooms' => $roomsByFloor[4] ?? []
            ],
            [
                'floor' => 5,
                'name_en' => 'Floor 5: VIP Ambassador & Wellness Sanctuary',
                'name_am' => 'ፎቅ 5፡ የቪአይፒ አምባሳደር እና የስፓ ጤና ማዕከል',
                'purpose_en' => 'VIP Suites, Luxury Jacuzzi, Spa, Sauna & Fitness Pavilion',
                'purpose_am' => 'የቪአይፒ ሱዊቶች፣ የቅንጦት ጃኩዚ፣ ስፓ፣ ሳውና እና ዘመናዊ ጂም',
                'description_en' => 'The ultimate wellness floor featuring Finnish sauna, steam baths, massage therapy, modern fitness gym, and Ambassador Jacuzzi suites with butler service.',
                'description_am' => 'የጤና እና የቅንጦት ፎቅ፤ የሳውና እና የእንፋሎት ገላ፣ የማሳጅ አገልግሎት፣ ዘመናዊ ጂም እና የግል አገልጋይ ያላቸው የአምባሳደር ጃኩዚ ሱዊቶችን ያካተተ ነው።',
                'image' => '/images/hotel_building_park.jpg',
                'highlights' => ['Luxury In-Room Jacuzzi', 'Full Spa & Sauna', 'State-of-the-Art Gym', 'Dedicated Butler Service'],
                'rooms' => $roomsByFloor[5] ?? []
            ],
            [
                'floor' => 6,
                'name_en' => 'Floor 6: Royal Sky Penthouse & Panoramic Rooftop Park',
                'name_am' => 'ፎቅ 6፡ የንጉሳዊ ሰማይ ፔንትሀውስ እና ጣሪያ ላይ ያለ ፓርክ (Rooftop Park)',
                'purpose_en' => 'Presidential Sky Suites, Private Rooftop Park & Sunset Skyline Lounge',
                'purpose_am' => 'የፕሬዚዳንት ሰማይ ፔንትሀውስ፣ የጣሪያ ላይ መናፈሻ ፓርክ እና የፀሐይ መጥለቂያ ላውንጅ',
                'description_en' => 'The pinnacle of luxury hospitality. Features our top-floor Royal Penthouse with private rooftop park gardens, panoramic skyline views, outdoor jacuzzi, and sky lounge bar.',
                'description_am' => 'የከፍተኛ ደረጃ መስተንግዶ ማማ። የግል ጣሪያ ፓርክ፣ ፓኖራሚክ የከተማ እይታ፣ ውጫዊ ጃኩዚ እና የሰማይ ላውንጅ ባር ያላቸው የፕሬዚዳንት ፔንትሀውስ ክፍሎችን ይዟል።',
                'image' => '/images/hotel_building_park.jpg',
                'highlights' => ['360-Degree Skyline View', 'Private Rooftop Park Garden', 'Presidential Penthouse', 'Sunset Sky Bar'],
                'rooms' => $roomsByFloor[6] ?? []
            ]
        ];

        json_ok([
            'building_name' => 'Grand International Hospitality Palace & Resort Park',
            'building_name_am' => 'ታላቁ ዓለም አቀፍ የሆቴል ህንፃ እና የሪዞርት ፓርክ',
            'total_floors' => 6,
            'total_rooms' => count($allRooms),
            'featured_images' => [
                'building_park' => '/images/hotel_building_park.jpg',
                'dining_feeding' => '/images/guests_dining_feeding.jpg',
                'refreshment_drinking' => '/images/guests_refreshment_drinking.jpg'
            ],
            'floors' => $floors
        ]);
        break;

    case 'training_info':
        $roomStats = $conn->query("SELECT 
            COUNT(*) as total, 
            SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) as free,
            MIN(price_per_night) as min_price,
            MAX(price_per_night) as max_price
            FROM rooms")->fetch_assoc();

        $roomsByTypeRes = $conn->query("SELECT type, COUNT(*) as c, MIN(price_per_night) as min_p FROM rooms GROUP BY type");
        $roomsByType = $roomsByTypeRes ? $roomsByTypeRes->fetch_all(MYSQLI_ASSOC) : [];

        $diningStats = $conn->query("SELECT COUNT(*) as total FROM menu_items WHERE is_available=1")->fetch_assoc();

        $categoriesRes = $conn->query("SELECT category, COUNT(*) as c FROM menu_items WHERE is_available=1 GROUP BY category");
        $menuCategories = $categoriesRes ? $categoriesRes->fetch_all(MYSQLI_ASSOC) : [];

        json_ok([
            'ai_name' => 'Hotel AI',
            'role' => 'Bilingual Virtual Concierge & Reservation Specialist',
            'version' => '3.5 (Bilingual Amharic & English - Real-Time Trained)',
            'supported_languages' => [
                'am' => 'Amharic (አማርኛ)',
                'en' => 'English (US/UK)'
            ],
            'status' => 'Trained & Operational',
            'training_scope' => [
                'Bilingual Natural Language Understanding (አማርኛ & English)',
                'Real-Time Free Room Prediction & Booking Conflict Resolution',
                'Specific Room Number Lookups (#101 - #602)',
                '6-Floor Hospitality Palace & Botanical Resort Park Architecture',
                'Floor-Specific Facility & Availability Analysis (Floors 1 to 6)',
                'Live Dining Menu, Fasting/Vegetarian, Beers, Wines & Coffee Ceremony',
                '24/7 Room Service & Pre-Order Automation',
                'Accurate Stay Pricing Calculations by Nights & Guests',
                'Hotel Policies (Check-in 2 PM, Check-out 12 PM, Free WiFi, Valet Parking)',
                'Multi-Channel Payment Integration (Chapa, Telebirr, CBE Birr, Cards, Cash)'
            ],
            'live_knowledge_base' => [
                'total_rooms' => (int)($roomStats['total'] ?? 0),
                'currently_available_rooms' => (int)($roomStats['free'] ?? 0),
                'price_range' => [
                    'min' => (float)($roomStats['min_price'] ?? 80),
                    'max' => (float)($roomStats['max_price'] ?? 550)
                ],
                'rooms_by_category' => $roomsByType,
                'active_dining_menu_items' => (int)($diningStats['total'] ?? 0),
                'menu_categories' => $menuCategories,
                'total_building_floors' => 6,
                'hotel_name' => 'Grand Hotel Management & Luxury Suites'
            ]
        ]);
        break;

    default:
        json_fail(400, 'Invalid action');
}

$conn->close();

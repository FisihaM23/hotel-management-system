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
 * Predict free rooms based on dates, guests, and type
 */
function predictFreeRooms($conn, $checkIn = null, $checkOut = null, $guests = 1, $preferredType = null, $maxBudget = null) {
    $now = date('Y-m-d');
    if (!$checkIn || strtotime($checkIn) < strtotime($now)) {
        $checkIn = $now;
    }
    if (!$checkOut || strtotime($checkOut) <= strtotime($checkIn)) {
        $checkOut = date('Y-m-d', strtotime($checkIn . ' + 1 day'));
    }

    $nights = max(1, (strtotime($checkOut) - strtotime($checkIn)) / 86400);

    // Fetch all active rooms
    $query = "SELECT r.* FROM rooms r WHERE r.status != 'maintenance' ORDER BY r.price_per_night ASC";
    $result = $conn->query($query);
    $allRooms = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];

    $availableRooms = [];
    $occupiedRooms = [];

    // Room type translation mapping for Amharic
    $typeLabels = [
        'single' => ['en' => 'Single Room', 'am' => 'ነጠላ ክፍል'],
        'double' => ['en' => 'Double Room', 'am' => 'ድርብ ክፍል'],
        'deluxe' => ['en' => 'Deluxe Room', 'am' => 'ዴሉክስ ክፍል'],
        'suite' => ['en' => 'Luxury Suite', 'am' => 'የቅንጦት ሱዊት'],
        'penthouse' => ['en' => 'Penthouse Suite', 'am' => 'ፔንትሀውስ']
    ];

    foreach ($allRooms as $room) {
        $isOverlapped = roomHasOverlap($conn, $room['id'], $checkIn, $checkOut);
        $totalStayPrice = round((float)$room['price_per_night'] * $nights, 2);
        $rType = strtolower($room['type']);

        $roomData = [
            'id' => (int)$room['id'],
            'room_number' => $room['room_number'],
            'type' => $room['type'],
            'type_label_am' => $typeLabels[$rType]['am'] ?? $room['type'],
            'type_label_en' => $typeLabels[$rType]['en'] ?? ucfirst($room['type']),
            'floor' => (int)$room['floor'],
            'price_per_night' => (float)$room['price_per_night'],
            'nights' => $nights,
            'total_stay_price' => $totalStayPrice,
            'status' => $room['status'],
            'description' => $room['description'],
            'amenities' => array_map('trim', explode(',', $room['amenities'] ?: '')),
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
        if ($room['max_guests'] < $guests) {
            $score -= 40;
        }
        if ($preferredType && strtolower($room['type']) === strtolower($preferredType)) {
            $score += 30;
        }
        if ($maxBudget && (float)$room['price_per_night'] <= (float)$maxBudget) {
            $score += 20;
        }
        $roomData['suitability_score'] = $score;

        if (!$isOverlapped) {
            $availableRooms[] = $roomData;
        } else {
            $occupiedRooms[] = $roomData;
        }
    }

    // Sort available rooms by suitability score descending
    usort($availableRooms, function ($a, $b) {
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
 * Fetch available dining items from database
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

    // Extract potential check-in and check-out dates
    $today = date('Y-m-d');
    $checkIn = $context['check_in'] ?? null;
    $checkOut = $context['check_out'] ?? null;
    $guests = isset($context['guests']) ? max(1, (int)$context['guests']) : 1;
    $preferredType = $context['room_type'] ?? null;

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
        $friday = date('Y-m-d', strtotime('this friday'));
        $sunday = date('Y-m-d', strtotime('this sunday'));
        $checkIn = $friday;
        $checkOut = $sunday;
    } elseif (str_contains($msg, 'tonight') || str_contains($msg, 'today') || str_contains($msg, 'ዛሬ')) {
        $checkIn = $today;
        $checkOut = date('Y-m-d', strtotime('+1 day'));
    }

    // Extract guests count in English & Amharic
    if (preg_match('/(\d+)\s*(people|person|persons|guests|guest|adult|adults|ሰው|እንግዳ|አዋቂ)/u', $msg, $gMatches)) {
        $guests = max(1, (int)$gMatches[1]);
    }

    // Extract room type preference (English & Amharic)
    if (str_contains($msg, 'suite') || str_contains($msg, 'luxury') || str_contains($msg, 'ሱዊት')) {
        $preferredType = 'suite';
    } elseif (str_contains($msg, 'deluxe') || str_contains($msg, 'balcony') || str_contains($msg, 'ዴሉክስ') || str_contains($msg, 'በረንዳ')) {
        $preferredType = 'deluxe';
    } elseif (str_contains($msg, 'penthouse') || str_contains($msg, 'ፔንትሀውስ')) {
        $preferredType = 'penthouse';
    } elseif (str_contains($msg, 'single') || str_contains($msg, 'solo') || str_contains($msg, 'ነጠላ')) {
        $preferredType = 'single';
    } elseif (str_contains($msg, 'double') || str_contains($msg, 'couple') || str_contains($msg, 'ድርብ') || str_contains($msg, 'ባለትዳር')) {
        $preferredType = 'double';
    }

    // Specific question detection (English & Amharic)
    $isWifi = str_contains($msg, 'wifi') || str_contains($msg, 'wi-fi') || str_contains($msg, 'internet') || str_contains($msg, 'ዋይፋይ') || str_contains($msg, 'ኢንተርኔት');
    $isParking = str_contains($msg, 'parking') || str_contains($msg, 'car') || str_contains($msg, 'ፓርኪንግ') || str_contains($msg, 'መኪና ማቆሚያ');
    $isPayment = str_contains($msg, 'payment') || str_contains($msg, 'pay') || str_contains($msg, 'telebirr') || str_contains($msg, 'chapa') || str_contains($msg, 'cbe') || str_contains($msg, 'card') || str_contains($msg, 'ክፍያ') || str_contains($msg, 'መክፈል') || str_contains($msg, 'ቴሌብር') || str_contains($msg, 'ቻፓ') || str_contains($msg, 'ካርድ');
    $isTime = str_contains($msg, 'check-in') || str_contains($msg, 'checkout') || str_contains($msg, 'check in') || str_contains($msg, 'check out') || str_contains($msg, 'time') || str_contains($msg, 'hours') || str_contains($msg, 'መግቢያ') || str_contains($msg, 'መውጫ') || str_contains($msg, 'ሰዓት');
    $isBreakfast = str_contains($msg, 'breakfast') || str_contains($msg, 'ቁርስ');
    $isRoomService = str_contains($msg, 'room service') || str_contains($msg, 'የክፍል አገልግሎት');

    $isBuildingOrFloorInquiry = str_contains($msg, 'floor') || str_contains($msg, 'floors') || str_contains($msg, 'building') 
        || str_contains($msg, 'park') || str_contains($msg, 'garden') || str_contains($msg, 'rooftop') || str_contains($msg, 'six') || str_contains($msg, '6')
        || str_contains($msg, 'feed') || str_contains($msg, 'refresh')
        || str_contains($msg, 'ፎቅ') || str_contains($msg, 'ፎቆች') || str_contains($msg, 'ህንፃ') || str_contains($msg, 'ፓርክ') 
        || str_contains($msg, 'ስድስት') || str_contains($msg, 'መናፈሻ') || str_contains($msg, 'መዝናኛ');

    $isRoomInquiry = str_contains($msg, 'room') || str_contains($msg, 'reserve') || str_contains($msg, 'book') 
        || str_contains($msg, 'free') || str_contains($msg, 'vacan') || str_contains($msg, 'stay') 
        || str_contains($msg, 'predict') || str_contains($msg, 'suite') || str_contains($msg, 'night')
        || str_contains($msg, 'ክፍል') || str_contains($msg, 'ክፍሎች') || str_contains($msg, 'ነፃ') 
        || str_contains($msg, 'ክፍት') || str_contains($msg, 'መያዝ') || str_contains($msg, 'ማስያዝ') 
        || str_contains($msg, 'ቦታ') || str_contains($msg, 'አልጋ') || str_contains($msg, 'መኝታ') 
        || str_contains($msg, 'ትንበያ');

    $isDiningInquiry = str_contains($msg, 'dining') || str_contains($msg, 'food') || str_contains($msg, 'eat') 
        || str_contains($msg, 'drink') || str_contains($msg, 'dish') || str_contains($msg, 'menu') 
        || str_contains($msg, 'beer') || str_contains($msg, 'coffee') || str_contains($msg, 'wine') 
        || str_contains($msg, 'lunch') || str_contains($msg, 'dinner') 
        || str_contains($msg, 'doro') || str_contains($msg, 'kitfo') || str_contains($msg, 'shiro') 
        || str_contains($msg, 'tibs') || str_contains($msg, 'steak') || str_contains($msg, 'order')
        || str_contains($msg, 'ምግብ') || str_contains($msg, 'ምግቦች') || str_contains($msg, 'መጠጥ') 
        || str_contains($msg, 'መጠጦች') || str_contains($msg, 'ዶሮ') || str_contains($msg, 'ክትፎ') 
        || str_contains($msg, 'ሽሮ') || str_contains($msg, 'ጥብስ') || str_contains($msg, 'ፍርፍር') 
        || str_contains($msg, 'ቢራ') || str_contains($msg, 'ጠጅ') || str_contains($msg, 'ቡና') 
        || str_contains($msg, 'ጭማቂ') || str_contains($msg, 'ማዘዝ') || str_contains($msg, 'ትዕዛዝ');

    $isPriceInquiry = str_contains($msg, 'price') || str_contains($msg, 'cost') || str_contains($msg, 'rate') 
        || str_contains($msg, 'how much') || str_contains($msg, 'cheap') || str_contains($msg, 'discount')
        || str_contains($msg, 'ዋጋ') || str_contains($msg, 'ስንት ነው') || str_contains($msg, 'ብር') || str_contains($msg, 'ዶላር');

    $isPolicyInquiry = str_contains($msg, 'policy') || str_contains($msg, 'cancel') || str_contains($msg, 'rules')
        || str_contains($msg, 'ፖሊሲ') || str_contains($msg, 'ደንብ') || str_contains($msg, 'ህግ');

    // Predict rooms and dining data
    $roomsResult = predictFreeRooms($conn, $checkIn, $checkOut, $guests, $preferredType);
    $diningResult = fetchHotelDining($conn);

    $reply = "";
    $predictedRoomsToReturn = [];
    $diningToReturn = [];
    $suggestedQuestions = [];
    $action = "info";

    // =========================================================================
    // AMHARIC (አማርኛ) — SHORT & UNDERSTANDABLE ANSWERS
    // =========================================================================
    if ($lang === 'am') {
        if ($isWifi) {
            $action = "faq";
            $reply = "📶 **ዋይፋይ (WiFi)**፡ በሁሉም ክፍሎችና በሆቴሉ ግቢ ውስጥ ባለከፍተኛ ፍጥነት ዋይፋይ በነፃ ይገኛል። የይለፍ ቃሉ በእንግዳ መቀበያው ይሰጥዎታል።";
            $suggestedQuestions = ["ክፍት ክፍሎችን አሳየኝ", "የመግቢያ ሰዓት ስንት ነው?", "የምግብ ዝርዝር አሳየኝ"];
        } elseif ($isParking) {
            $action = "faq";
            $reply = "🚗 **መኪና ማቆሚያ (Parking)**፡ በመናፈሻ ግቢያችን ውስጥ ነፃ፣ ደህንነቱ የተጠበቀ የ24 ሰዓት የመኪና ማቆሚያ (Valet Parking) አለን።";
            $suggestedQuestions = ["ክፍት ክፍሎችን አሳየኝ", "የምግብ ዝርዝር አሳየኝ", "የሆቴሉ አድራሻ የት ነው?"];
        } elseif ($isPayment) {
            $action = "faq";
            $reply = "💳 **የክፍያ መንገዶች**፡ በ**ቴሌብር (Telebirr)**፣ **ቻፓ (Chapa)**፣ **CBE Birr**፣ በባንክ ካርድ (Visa/Mastercard) ወይም በጥሬ ገንዘብ መክፈል ይችላሉ።";
            $suggestedQuestions = ["ለ 2 ሰው ክፍት ክፍል አሳየኝ", "የምግብ ዝርዝር አሳየኝ", "የመግቢያ ሰዓት ስንት ነው?"];
        } elseif ($isTime) {
            $action = "faq";
            $reply = "⏰ **የመግቢያና የመውጫ ሰዓት**፡\n• የመግቢያ ሰዓት (Check-in)፡ **ከቀኑ 8:00 (2:00 PM)**\n• የመውጫ ሰዓት (Check-out)፡ **እስከ ቀኑ 6:00 (12:00 PM)**";
            $suggestedQuestions = ["ክፍት ክፍሎችን አሳየኝ", "የክፍል ዋጋ ስንት ነው?", "በቴሌብር መክፈል ይቻላል?"];
        } elseif ($isBreakfast) {
            $action = "dining";
            $reply = "🍳 **ቁርስ**፡ በየቀኑ ከጠዋቱ 12:30 እስከ 4:30 በፎቅ 2 የምግብ አዳራሽ በቡፌ እና በባህላዊ ምርጫ ይቀርባል። ወደ ክፍልዎም ማዘዝ ይችላሉ።";
            $diningToReturn = array_slice($diningResult['items'], 0, 3);
            $suggestedQuestions = ["ምግብ ወደ ክፍል ማዘዝ እፈልጋለሁ", "ክፍት ክፍሎችን አሳየኝ", "የመጠጥ ዝርዝር አሳየኝ"];
        } elseif ($isRoomService) {
            $action = "dining";
            $reply = "🛎️ **የክፍል አገልግሎት (Room Service)**፡ ለ 24 ሰዓት ክፍት ነው! ምግቦችና መጠጦች በስልክ ወይም በሆቴል አይ በኩል በቀጥታ ወደ ክፍልዎ ይደርሳሉ።";
            $diningToReturn = array_slice($diningResult['items'], 0, 3);
            $suggestedQuestions = ["ዶሮ ወጥ ወደ ክፍሌ አዝዝ", "ቀዝቃዛ ቢራ አዝዝ", "የክፍል ዋጋ ስንት ነው?"];
        } elseif ($isBuildingOrFloorInquiry) {
            $action = "building_floors";
            $reply = "🏨 **የ6 ፎቅ ህንፃ እና የሪዞርት ፓርክ መዋቅር**፦\n"
                   . "• **ፎቅ 1**፡ ዋና እንግዳ መቀበያ እና ፏፏቴ ያለው የመዝናኛ ፓርክ\n"
                   . "• **ፎቅ 2**፡ የምግብ አዳራሽ (ባህላዊ እና ዓለም አቀፍ ቡፌ)\n"
                   . "• **ፎቅ 3**፡ የማደሻ ላውንጅ፣ ኮክቴል ባር እና ባህላዊ ቡና\n"
                   . "• **ፎቅ 4**፡ የዴሉክስ እንግዳ ክፍሎች እና ቢዝነስ ማዕከል\n"
                   . "• **ፎቅ 5**፡ የቪአይፒ አምባሳደር ሱዊት እና የስፓ ጤና ማዕከል\n"
                   . "• **ፎቅ 6**፡ የሰማይ ፔንትሀውስ እና ጣሪያ ላይ ያለ ፓርክ (Rooftop Park)\n\n"
                   . "👉 **በየትኛው ፎቅ ላይ ማረፍ ይመርጣሉ?**";
            $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 3);
            $suggestedQuestions = ["በፎቅ 6 ያለውን ፔንትሀውስ አሳየኝ", "በፎቅ 2 ያለውን ምግብ አሳየኝ", "በፎቅ 3 ያለውን መጠጥ አሳየኝ"];
        } elseif ($isRoomInquiry && $isDiningInquiry) {
            $action = "reserve_and_dine";
            $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 3);
            $diningToReturn = array_slice($diningResult['items'], 0, 3);
            $reply = "🏨 **ክፍት ክፍሎች እና ምግቦች መረጃ**፦\n"
                   . "• **ክፍት ክፍሎች**፡ ከ " . $roomsResult['check_in'] . " እስከ " . $roomsResult['check_out'] . " ድረስ **" . $roomsResult['free_count'] . " ክፍሎች** ዝግጁ ናቸው።\n"
                   . "• **ምግብና መጠጥ**፡ ልዩ ዶሮ ወጥ ($28)፣ ክትፎ ($26)፣ ቀዝቃዛ ቢራ ($5) እና ጠጅ ($12) ይገኛሉ።\n\n"
                   . "👉 **ስንት እንግዳዎች ይሆናሉ? ክፍል እና ምግብ አስቀድሜ ላዘጋጅልዎ?**";
            $suggestedQuestions = ["ለ 2 ሰው ክፍል እና ዶሮ ወጥ አሲዝ", "የክፍል ዋጋዎችን በዝርዝር አሳየኝ", "የመግቢያ ሰዓት ስንት ነው?"];
        } elseif ($isRoomInquiry || $isPriceInquiry) {
            $action = "reserve";
            $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 3);
            if ($roomsResult['free_count'] > 0) {
                $reply = "🛏️ **ለተመረጡት ቀናት (" . $roomsResult['check_in'] . " - " . $roomsResult['check_out'] . ") " . $roomsResult['free_count'] . " ክፍት ክፍሎች አሉ**፦\n";
                foreach ($predictedRoomsToReturn as $r) {
                    $reply .= "• **ክፍል #" . $r['room_number'] . "** (" . $r['type_label_am'] . " - ፎቅ " . $r['floor'] . ") ፦ **$" . $r['price_per_night'] . "/ሌሊት** (እስከ " . $r['max_guests'] . " ሰው)\n";
                }
                $reply .= "\n👉 **የትኛውን ክፍል ማስያዝ ይፈልጋሉ?**";
            } else {
                $reply = "⚠️ ለተመረጡት ቀናት ክፍሎች ተይዘዋል። ለሌላ አማራጭ ቀን እንድፈልግልዎ ይፈልጋሉ?";
            }
            $suggestedQuestions = [
                "ክፍል #" . (!empty($predictedRoomsToReturn) ? $predictedRoomsToReturn[0]['room_number'] : '101') . "ን አሲዝልኝ",
                "በሆቴሉ ምን ምግቦች አሉ?",
                "ክፍያ በቴሌብር ይቻላል?"
            ];
        } elseif ($isDiningInquiry) {
            $action = "dining";
            $diningToReturn = array_slice($diningResult['items'], 0, 4);
            $reply = "🍽️ **ዝግጁ የሆኑ ምግቦችና መጠጦች**፦\n"
                   . "• **ባህላዊ ምግቦች**፡ ልዩ ዶሮ ወጥ ($28)፣ ልዩ ክትፎ ($26)፣ የሸክላ ሽሮ ($16)፣ የስጋ ጥብስ ($22)\n"
                   . "• **ዓለም አቀፍ**፡ ፕራይም ሪብአይ እስቴይክ ($34)፣ ክለብ ሳንድዊች ($15)\n"
                   . "• **መጠጦች**፡ ሀበሻ ድራፍት ቢራ ($5)፣ የማር ጠጅ ($12)፣ ባህላዊ ቡና ($4.50)\n\n"
                   . "👉 **ወደ ክፍልዎ እንዲታዘዝ የሚፈልጉት አለ?**";
            $suggestedQuestions = ["ዶሮ ወጥ እና ሀበሻ ቢራ አዝዝ", "የጾም ምግብ ምን አለ?", "ክፍት ክፍሎችን አሳየኝ"];
        } elseif ($isPolicyInquiry) {
            $action = "policy";
            $reply = "📋 **የሆቴላችን ደንቦች ባጭሩ**፦\n"
                   . "• መግቢያ፡ ከቀኑ 8:00 | መውጫ፡ እስከ ቀኑ 6:00\n"
                   . "• ዋይፋይና ፓርኪንግ፡ በነፃ\n"
                   . "• ክፍያ፡ ቴሌብር፣ ቻፓ፣ CBE Birr፣ ካርድ ወይም ጥሬ ገንዘብ\n\n"
                   . "👉 **በምን ልርዳዎት?**";
            $suggestedQuestions = ["ክፍት ክፍሎችን አሳየኝ", "የምግብ ዝርዝር አሳየኝ", "በቴሌብር እንዴት መክፈል ይቻላል?"];
        } else {
            $action = "greeting";
            $reply = "ሰላም! እኔ **ሆቴል አይ (Hotel AI)** ነኝ። 🏨\n"
                   . "ክፍት ክፍሎችን መተንበይ እና ዝግጁ ምግቦችን ማሳወቅ እችላለሁ።\n\n"
                   . "👉 **ምን ማወቅ ይፈልጋሉ?**";
            $suggestedQuestions = [
                "ለ 2 ሰው ክፍት ክፍሎችን አሳየኝ",
                "በሆቴሉ ምን ምግቦች አሉ?",
                "የሆቴሉን 6 ፎቆች አሳየኝ"
            ];
        }
    }
    // =========================================================================
    // ENGLISH — SHORT & UNDERSTANDABLE ANSWERS
    // =========================================================================
    else {
        if ($isWifi) {
            $action = "faq";
            $reply = "📶 **High-Speed WiFi**: Free across all guest rooms, suites, and public areas. Login details are provided at check-in.";
            $suggestedQuestions = ["Show free rooms", "What is check-in time?", "Show available dining"];
        } elseif ($isParking) {
            $action = "faq";
            $reply = "🚗 **Parking**: Complimentary, secure 24/7 valet parking is provided inside our hotel resort park plaza.";
            $suggestedQuestions = ["Show free rooms", "Show dining menu", "What payment methods do you accept?"];
        } elseif ($isPayment) {
            $action = "faq";
            $reply = "💳 **Payment Methods**: We accept **Telebirr**, **Chapa Online Payment**, **CBE Birr**, Debit/Credit Cards (Visa/Mastercard), and Cash.";
            $suggestedQuestions = ["Predict free rooms for 2 guests", "Show dining menu", "What are check-in hours?"];
        } elseif ($isTime) {
            $action = "faq";
            $reply = "⏰ **Check-in & Check-out**:\n• Check-in: **From 2:00 PM**\n• Check-out: **Until 12:00 PM**\n*(Early check-in and late checkout can be arranged upon request.)*";
            $suggestedQuestions = ["Predict free rooms", "Which dining is available?", "Do you accept Telebirr?"];
        } elseif ($isBreakfast) {
            $action = "dining";
            $reply = "🍳 **Breakfast**: Served daily from 6:30 AM to 10:30 AM on Floor 2 (buffet and Ethiopian specialties), or delivered to your room via room service.";
            $diningToReturn = array_slice($diningResult['items'], 0, 3);
            $suggestedQuestions = ["Pre-order breakfast to room", "Show free rooms", "Show drinks menu"];
        } elseif ($isRoomService) {
            $action = "dining";
            $reply = "🛎️ **Room Service**: Available 24/7! You can order meals, snacks, and drinks directly to your room through Hotel AI or phone.";
            $diningToReturn = array_slice($diningResult['items'], 0, 3);
            $suggestedQuestions = ["Order Doro Wat to my room", "Order cold beer", "Show room rates"];
        } elseif ($isBuildingOrFloorInquiry) {
            $action = "building_floors";
            $reply = "🏨 **Grand 6-Floor Hospitality Building & Resort Park**:\n"
                   . "• **Floor 1**: Reception & Botanical Resort Park with Fountains\n"
                   . "• **Floor 2**: Dining & Feeding Level (Traditional & International Banquet)\n"
                   . "• **Floor 3**: Refreshment & Drinking Level (Cocktail Lounge & Artisan Café)\n"
                   . "• **Floor 4**: Executive Business & Deluxe Rooms\n"
                   . "• **Floor 5**: VIP Ambassador Suites & Wellness Spa\n"
                   . "• **Floor 6**: Sky Penthouse & Panoramic Rooftop Park\n\n"
                   . "👉 **Which floor do you prefer for your stay?**";
            $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 3);
            $suggestedQuestions = ["Show Floor 6 Penthouse", "Show Floor 2 Dining", "Show Floor 3 Bar"];
        } elseif ($isRoomInquiry && $isDiningInquiry) {
            $action = "reserve_and_dine";
            $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 3);
            $diningToReturn = array_slice($diningResult['items'], 0, 3);
            $reply = "🏨 **Rooms & Dining Availability**:\n"
                   . "• **Free Rooms**: **" . $roomsResult['free_count'] . " rooms available** for " . $roomsResult['check_in'] . " to " . $roomsResult['check_out'] . ".\n"
                   . "• **Fresh Dining**: Doro Wat ($28), Kitfo ($26), Ribeye Steak ($34), Cold Beer ($5), Tej Wine ($12).\n\n"
                   . "👉 **How many guests are staying, and would you like to pre-order dinner?**";
            $suggestedQuestions = ["Reserve for 2 guests with Doro Wat", "Show all free room rates", "What is check-in time?"];
        } elseif ($isRoomInquiry || $isPriceInquiry) {
            $action = "reserve";
            $predictedRoomsToReturn = array_slice($roomsResult['available_rooms'], 0, 3);
            if ($roomsResult['free_count'] > 0) {
                $reply = "🛏️ **" . $roomsResult['free_count'] . " Free Rooms Available (" . $roomsResult['check_in'] . " to " . $roomsResult['check_out'] . ")**:\n";
                foreach ($predictedRoomsToReturn as $r) {
                    $reply .= "• **Room #" . $r['room_number'] . "** (" . ucfirst($r['type']) . " - Floor " . $r['floor'] . "): **$" . $r['price_per_night'] . "/night** (Max " . $r['max_guests'] . " guests)\n";
                }
                $reply .= "\n👉 **Which room would you like to reserve?**";
            } else {
                $reply = "⚠️ Currently all rooms are booked for those exact dates. Would you like me to check alternative dates?";
            }
            $suggestedQuestions = [
                "Reserve Room #" . (!empty($predictedRoomsToReturn) ? $predictedRoomsToReturn[0]['room_number'] : '101'),
                "Which dining is available in this hotel?",
                "Do you accept Telebirr / Chapa?"
            ];
        } elseif ($isDiningInquiry) {
            $action = "dining";
            $diningToReturn = array_slice($diningResult['items'], 0, 4);
            $reply = "🍽️ **Available Dining & Drinks**:\n"
                   . "• **Traditional**: Doro Wat ($28), Special Kitfo ($26), Shiro ($16), Beef Tibs ($22)\n"
                   . "• **Mains**: Grilled Ribeye Steak ($34), Club Sandwich ($15)\n"
                   . "• **Beverages**: Habesha Draft Beer ($5), Royal Tej ($12), Spiced Ethiopian Coffee ($4.50)\n\n"
                   . "👉 **Would you like to pre-order any item to your room?**";
            $suggestedQuestions = ["Add Doro Wat & Habesha Beer", "Show fasting / vegetarian dishes", "Predict free rooms"];
        } elseif ($isPolicyInquiry) {
            $action = "policy";
            $reply = "📋 **Hotel Policies Overview**:\n"
                   . "• Check-in: From 2:00 PM | Check-out: By 12:00 PM\n"
                   . "• Amenities: Free High-Speed WiFi, Valet Parking, 24/7 Room Service\n"
                   . "• Payment: Telebirr, Chapa, CBE Birr, Visa/Mastercard, Cash\n\n"
                   . "👉 **How may I assist your booking?**";
            $suggestedQuestions = ["Predict free rooms", "Which dining is available?", "How to pay with Telebirr?"];
        } else {
            $action = "greeting";
            $reply = "Hello! I am **Hotel AI**. 🏨\n"
                   . "I can predict free rooms and show available dining.\n\n"
                   . "👉 **What would you like to know?**";
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

        $prediction = predictFreeRooms($conn, $checkIn, $checkOut, $guests, $type, $budget);
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
            $r['amenities'] = array_map('trim', explode(',', $r['amenities'] ?: ''));
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
        $roomStats = $conn->query("SELECT COUNT(*) as total, SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) as free FROM rooms")->fetch_assoc();
        $diningStats = $conn->query("SELECT COUNT(*) as total FROM menu_items WHERE is_available=1")->fetch_assoc();

        json_ok([
            'ai_name' => 'Hotel AI',
            'role' => 'Bilingual Virtual Concierge & Reservation Specialist',
            'version' => '3.0 (Bilingual Amharic & English)',
            'supported_languages' => [
                'am' => 'Amharic (አማርኛ)',
                'en' => 'English (US/UK)'
            ],
            'status' => 'Trained & Operational',
            'training_scope' => [
                'Bilingual Natural Language Understanding (አማርኛ & English)',
                'Free Room Prediction & Booking Conflict Resolution',
                'Hotel Dining, Menu Items & Room Service Availability',
                'Interactive Question Generation for Customer Profiling',
                'Pricing, Check-in/Check-out Policies & Amenities',
                'Payment Method Support (Chapa, Telebirr, CBE Birr, Cards, Cash)'
            ],
            'live_knowledge_base' => [
                'total_rooms' => (int)($roomStats['total'] ?? 0),
                'currently_available_rooms' => (int)($roomStats['free'] ?? 0),
                'active_dining_menu_items' => (int)($diningStats['total'] ?? 0),
                'hotel_name' => 'Grand Hotel Management & Luxury Suites'
            ]
        ]);
        break;

    default:
        json_fail(400, 'Invalid action');
}

$conn->close();

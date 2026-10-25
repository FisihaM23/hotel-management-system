<?php
require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json; charset=utf-8');

$conn = getConnection();

// 1. Alter category to support 'ethiopian_food'
$conn->query("ALTER TABLE menu_items MODIFY COLUMN category VARCHAR(50) NOT NULL DEFAULT 'food'");

// 2. Remove duplicate low-price seed remnants
$conn->query("DELETE FROM menu_items WHERE id IN (2, 3, 9, 10, 11)");
$conn->query("DELETE FROM menu_items WHERE name = 'tibis'");

// 3. Update existing Ethiopian items to category 'ethiopian_food' and make sure prices >= 150
$ethiopianKeywords = ['ወጥ', 'ጥብስ', 'ክትፎ', 'ሽሮ', 'ፍርፍር', 'ዱለት', 'በየአይነቱ', 'ጉላሽ', 'ጨጨብሳ', 'ቂንጬ', 'ገንፎ', 'ጎረድ', 'Kinche', 'Enkulal', 'Fosolia', 'Kik Alicha', 'Misir Wat', 'Chechebsa', 'Genfo', 'Beyaynetu', 'Bozena', 'Gomen', 'Alicha', 'Kuanta', 'Dulet', 'Gored', 'Zilzil', 'Doro Wat', 'Shekla', 'Yebeg'];

$stmt = $conn->query("SELECT id, name, category, sub_category, price FROM menu_items");
$allRows = $stmt ? $stmt->fetch_all(MYSQLI_ASSOC) : [];

foreach ($allRows as $row) {
    $isEth = false;
    if (strpos(strtolower($row['sub_category']), 'ethiopian') !== false) {
        $isEth = true;
    }
    foreach ($ethiopianKeywords as $kw) {
        if (mb_strpos($row['name'], $kw) !== false) {
            $isEth = true;
            break;
        }
    }
    if ($isEth) {
        $newPrice = max(150.00, (float)$row['price']);
        $uStmt = $conn->prepare("UPDATE menu_items SET category = 'ethiopian_food', price = ? WHERE id = ?");
        $uStmt->bind_param('di', $newPrice, $row['id']);
        $uStmt->execute();
    }
}

// 4. Update existing International foods (all >= 150 ETB)
$intlUpdates = [
    [
        'name' => 'Prime Grilled Ribeye Steak',
        'category' => 'food',
        'sub_category' => 'Main Course - Steaks',
        'price' => 650.00,
        'description' => '300g seasoned prime beef ribeye steak with rosemary herb butter, roasted vegetables, and mashed potatoes',
        'image_url' => 'https://images.unsplash.com/photo-1558030006-450675393462?w=500&auto=format&fit=crop',
        'preparation_time' => '25 mins'
    ],
    [
        'name' => 'Gourmet Club Sandwich',
        'category' => 'food',
        'sub_category' => 'Snacks & Light Meals',
        'price' => 280.00,
        'description' => 'Triple-decker toasted bread with roasted turkey, smoked bacon, cheddar, lettuce, tomatoes, and golden french fries',
        'image_url' => 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=500&auto=format&fit=crop',
        'preparation_time' => '15 mins'
    ],
    [
        'name' => 'Wood-Fired Margherita Pizza',
        'category' => 'food',
        'sub_category' => 'Main Course - Italian',
        'price' => 380.00,
        'description' => 'Artisanal thin-crust pizza topped with San Marzano tomato sauce, fresh mozzarella cheese, and fragrant basil leaves',
        'image_url' => 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=500&auto=format&fit=crop',
        'preparation_time' => '20 mins'
    ],
    [
        'name' => 'Creamy Chicken Fettuccine Alfredo',
        'category' => 'food',
        'sub_category' => 'Main Course - Italian',
        'price' => 420.00,
        'description' => 'Al dente fettuccine pasta tossed in rich parmesan garlic cream sauce with pan-seared chicken breast slices',
        'image_url' => 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=500&auto=format&fit=crop',
        'preparation_time' => '20 mins'
    ],
    [
        'name' => 'Crispy Chicken Burger with French Fries',
        'category' => 'food',
        'sub_category' => 'Snacks & Light Meals',
        'price' => 340.00,
        'description' => 'Golden fried chicken breast fillet in a brioche bun with coleslaw, chipotle mayo, dill pickles, and crisp fries',
        'image_url' => 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop',
        'preparation_time' => '15-20 mins'
    ]
];

// 5. Update/Insert Drink items with realistic Ethiopian Hotel prices
$drinkUpdates = [
    [
        'name' => 'St. George Lager Beer',
        'category' => 'alcoholic_drink',
        'sub_category' => 'Ethiopian Beers',
        'price' => 140.00,
        'description' => 'The iconic Ethiopian lager with crisp malt character and smooth balanced finish',
        'image_url' => 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => '4.7%',
        'preparation_time' => 'Instant'
    ],
    [
        'name' => 'Habesha Cold Draft Beer',
        'category' => 'alcoholic_drink',
        'sub_category' => 'Ethiopian Beers',
        'price' => 150.00,
        'description' => 'Refreshing premium Ethiopian cold beer brewed with barley and pure mountain spring water',
        'image_url' => 'https://images.unsplash.com/photo-1608270119280-92a061d497c2?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => '5.0%',
        'preparation_time' => 'Instant'
    ],
    [
        'name' => 'Walia Premium Cold Beer (ዋልያ ቢራ)',
        'category' => 'alcoholic_drink',
        'sub_category' => 'Ethiopian Beers',
        'price' => 150.00,
        'description' => 'Smooth and rich Ethiopian golden lager with gentle hop aroma, served chilled with a frosted glass',
        'image_url' => 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => '5.2%',
        'preparation_time' => 'Instant'
    ],
    [
        'name' => 'Castel Premium Beer (ካስቴል ቢራ)',
        'category' => 'alcoholic_drink',
        'sub_category' => 'Ethiopian Beers',
        'price' => 150.00,
        'description' => 'Finely brewed crisp and aromatic lager with balanced bitterness and lingering clean finish',
        'image_url' => 'https://images.unsplash.com/photo-1608270119280-92a061d497c2?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => '5.5%',
        'preparation_time' => 'Instant'
    ],
    [
        'name' => 'Royal Tej - Pure Honey Wine (ልዩ ማር ጠጅ)',
        'category' => 'alcoholic_drink',
        'sub_category' => 'Traditional Drinks',
        'price' => 290.00,
        'description' => 'Artisanal Ethiopian fermented organic forest honey wine delicately balanced with gesho leaves, served in traditional berele flask',
        'image_url' => 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => '11.0%',
        'preparation_time' => 'Instant'
    ],
    [
        'name' => 'Traditional Tella Highland Brew (የቤት ጠላ)',
        'category' => 'alcoholic_drink',
        'sub_category' => 'Traditional Drinks',
        'price' => 120.00,
        'description' => 'Authentic home-style fermented Ethiopian beer made from roasted barley, teff, and gesho leaves',
        'image_url' => 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => '4.5%',
        'preparation_time' => 'Instant'
    ],
    [
        'name' => 'Awash Rift Valley Reserve Red Wine (ጠርሙስ)',
        'category' => 'alcoholic_drink',
        'sub_category' => 'Fine Wines',
        'price' => 650.00,
        'description' => 'Full-bodied Ethiopian dry red wine from the volcanic soils of the Rift Valley, displaying notes of blackberries and spices',
        'image_url' => 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => '13.0%',
        'preparation_time' => 'Instant'
    ],
    [
        'name' => 'Acacia Medium Sweet White Wine (ጠርሙስ)',
        'category' => 'alcoholic_drink',
        'sub_category' => 'Fine Wines',
        'price' => 650.00,
        'description' => 'Crisp and floral medium-sweet Ethiopian white wine with hints of peach, citrus, and acacia blossoms',
        'image_url' => 'https://images.unsplash.com/photo-1558001373-7b93ee48ffa0?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => '12.5%',
        'preparation_time' => 'Instant'
    ],
    [
        'name' => 'Signature Ethiopian Spiced Coffee (የሀበሻ ቡና)',
        'category' => 'soft_drink',
        'sub_category' => 'Hot Beverages',
        'price' => 90.00,
        'description' => 'Freshly roasted single-origin highland Arabica coffee brewed in a clay jebena with cardamom, cinnamon, and rue herbs',
        'image_url' => 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => null,
        'preparation_time' => '10 mins'
    ],
    [
        'name' => 'Traditional Bole Coffee Ceremony Set (የቡና ስነስርዓት)',
        'category' => 'soft_drink',
        'sub_category' => 'Hot Beverages',
        'price' => 260.00,
        'description' => 'Complete Ethiopian VIP coffee ritual: 3 rounds (Abol, Tona, Bereka) served with freshly popped popcorn and burning frankincense',
        'image_url' => 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => null,
        'preparation_time' => '15 mins'
    ],
    [
        'name' => 'Spiced Ethiopian Herbal Tea (የቅመም ሻይ)',
        'category' => 'soft_drink',
        'sub_category' => 'Hot Beverages',
        'price' => 80.00,
        'description' => 'Fragrant highland black tea steeped with cloves, cinnamon bark, cardamom pods, and fresh ginger',
        'image_url' => 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => null,
        'preparation_time' => '10 mins'
    ],
    [
        'name' => 'Fresh Mango-Avocado Layered Juice (እስፕሪስ - Espris)',
        'category' => 'soft_drink',
        'sub_category' => 'Fresh Juices',
        'price' => 160.00,
        'description' => 'Freshly pureed local mango and Hass avocado served in aesthetic layered glass with fresh lime wedge and vimto syrup',
        'image_url' => 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => null,
        'preparation_time' => '10 mins'
    ],
    [
        'name' => 'Fresh Papaya & Strawberry Smoothie',
        'category' => 'soft_drink',
        'sub_category' => 'Fresh Juices',
        'price' => 160.00,
        'description' => 'Rich tropical ripe papaya blended with highland strawberries and organic mountain honey',
        'image_url' => 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => null,
        'preparation_time' => '10 mins'
    ],
    [
        'name' => 'Ambo Sparkling Mineral Water (አምቦ ውሃ 500ml)',
        'category' => 'soft_drink',
        'sub_category' => 'Mineral Water',
        'price' => 70.00,
        'description' => 'Naturally effervescent thermal mineral spring water bottled at the source in Ambo, Ethiopia',
        'image_url' => 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => null,
        'preparation_time' => 'Instant'
    ],
    [
        'name' => 'Highland Pure Still Spring Water (1L)',
        'category' => 'soft_drink',
        'sub_category' => 'Mineral Water',
        'price' => 60.00,
        'description' => 'Crisp and purified premium natural still highland spring water',
        'image_url' => 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => null,
        'preparation_time' => 'Instant'
    ],
    [
        'name' => 'Chilled Sodas (Coca-Cola, Sprite, Fanta 330ml)',
        'category' => 'soft_drink',
        'sub_category' => 'Sodas',
        'price' => 70.00,
        'description' => 'Ice-cold carbonated refreshments served with sliced lemon and ice cubes',
        'image_url' => 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop',
        'alcohol_by_volume' => null,
        'preparation_time' => 'Instant'
    ]
];

$itemsToUpsert = array_merge($intlUpdates, $drinkUpdates);

$checkStmt = $conn->prepare("SELECT id FROM menu_items WHERE name = ?");
$updateStmt = $conn->prepare("UPDATE menu_items SET category = ?, sub_category = ?, price = ?, description = ?, image_url = ?, alcohol_by_volume = ?, preparation_time = ?, is_available = 1 WHERE id = ?");
$insertStmt = $conn->prepare("INSERT INTO menu_items (name, category, sub_category, price, description, image_url, alcohol_by_volume, preparation_time, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)");

$updatedCount = 0;
$insertedCount = 0;

foreach ($itemsToUpsert as $it) {
    $abv = $it['alcohol_by_volume'] ?? null;
    $checkStmt->bind_param('s', $it['name']);
    $checkStmt->execute();
    $res = $checkStmt->get_result();
    if ($row = $res->fetch_assoc()) {
        $updateStmt->bind_param('ssdssssi', $it['category'], $it['sub_category'], $it['price'], $it['description'], $it['image_url'], $abv, $it['preparation_time'], $row['id']);
        $updateStmt->execute();
        $updatedCount++;
    } else {
        $insertStmt->bind_param('sssdssss', $it['name'], $it['category'], $it['sub_category'], $it['price'], $it['description'], $it['image_url'], $abv, $it['preparation_time']);
        $insertStmt->execute();
        $insertedCount++;
    }
}

// Ensure ALL food and ethiopian_food items have price >= 150
$conn->query("UPDATE menu_items SET price = 150.00 WHERE category IN ('food', 'ethiopian_food') AND price < 150.00");

// Output counts
$stats = [
    'status' => 'success',
    'ethiopian_food_count' => (int)$conn->query("SELECT COUNT(*) as c FROM menu_items WHERE category = 'ethiopian_food'")->fetch_assoc()['c'],
    'international_food_count' => (int)$conn->query("SELECT COUNT(*) as c FROM menu_items WHERE category = 'food'")->fetch_assoc()['c'],
    'alcoholic_drinks_count' => (int)$conn->query("SELECT COUNT(*) as c FROM menu_items WHERE category = 'alcoholic_drink'")->fetch_assoc()['c'],
    'soft_drinks_count' => (int)$conn->query("SELECT COUNT(*) as c FROM menu_items WHERE category = 'soft_drink'")->fetch_assoc()['c'],
    'total_items' => (int)$conn->query("SELECT COUNT(*) as c FROM menu_items")->fetch_assoc()['c'],
    'min_food_price' => (float)$conn->query("SELECT MIN(price) as p FROM menu_items WHERE category IN ('food', 'ethiopian_food')")->fetch_assoc()['p'],
    'message' => "All dining prices modified and Ethiopian Food category configured successfully!"
];

echo json_encode($stats, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
$conn->close();

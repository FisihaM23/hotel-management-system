<?php
require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json; charset=utf-8');

$conn = getConnection();

$ethiopianMeals = [
    [
        'name' => 'Doro Wat (ዶሮ ወጥ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Stews',
        'price' => 450.00,
        'description' => 'The crown jewel of Ethiopian cuisine: slow-simmered chicken drumsticks in rich berbere spice sauce with caramelized red onions, spiced niter kibbeh butter, hard-boiled eggs, and fresh teff injera.',
        'image_url' => 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop',
        'preparation_time' => '25-30 mins'
    ],
    [
        'name' => 'Special Kitfo (ልዩ ክትፎ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Beef',
        'price' => 520.00,
        'description' => 'Finely minced prime tenderloin beef warmed in herbal niter kibbeh butter and piquant mitmita chili. Served leb-leb or raw with fresh homemade ayib cottage cheese, gomen, and warm kocho.',
        'image_url' => 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop',
        'preparation_time' => '15-20 mins'
    ],
    [
        'name' => 'Shekla Tibs (የሸክላ ጥብስ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Grills',
        'price' => 480.00,
        'description' => 'Sizzling prime beef cubes served in an authentic elevated clay brazier over glowing charcoal embers, garnished with fresh rosemary sprigs, sliced sweet onions, and whole jalapeños.',
        'image_url' => 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&auto=format&fit=crop',
        'preparation_time' => '20 mins'
    ],
    [
        'name' => 'Zilzil Tibs (ዝልዝል ጥብስ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Grills',
        'price' => 510.00,
        'description' => 'Char-grilled long strips of tender marinated beef ribeye seared on smoking cast iron with fresh garlic, rosemary herbs, red onions, and house-made awaze dipping sauce.',
        'image_url' => 'https://images.unsplash.com/photo-1558030006-450675393462?w=500&auto=format&fit=crop',
        'preparation_time' => '20-25 mins'
    ],
    [
        'name' => 'Yebeg Tibs (የበግ ጥብስ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Grills',
        'price' => 490.00,
        'description' => 'Tender cubes of young highland lamb pan-sautéed with spiced clarified butter, fresh rosemary, sweet caramelized onions, and fiery green peppers.',
        'image_url' => 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop',
        'preparation_time' => '20 mins'
    ],
    [
        'name' => 'Shiro Tegabino (ሽሮ ተጋቢኖ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Vegetarian',
        'price' => 280.00,
        'description' => 'Sizzling hot clay pot stew of sun-dried spiced chickpea and split-pea flour whipped with onions, garlic, ginger, and fresh green chili. Served bubbling hot with injera.',
        'image_url' => 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=500&auto=format&fit=crop',
        'preparation_time' => '15 mins'
    ],
    [
        'name' => 'Bozena Shiro (ቦዘና ሽሮ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Stews',
        'price' => 380.00,
        'description' => 'Rich stone-ground chickpea flour stew simmered with tender morsels of seasoned minced beef, garlic, ginger, and aromatic spiced herbal butter.',
        'image_url' => 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=500&auto=format&fit=crop',
        'preparation_time' => '20 mins'
    ],
    [
        'name' => 'Beyaynetu Fasting Platter (የጾም በየአይነቱ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Vegetarian',
        'price' => 360.00,
        'description' => 'The ultimate colorful vegan feast: spicy Misir Wat, savory Kik Alicha, steamed Gomen greens, Atakilt Wat cabbage and potato, spiced Fosolia green beans, Beetroot salad, and cold Azifa green lentils.',
        'image_url' => 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&auto=format&fit=crop',
        'preparation_time' => '15 mins'
    ],
    [
        'name' => 'Sega Wat / Kai Sega (የስጋ ወጥ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Stews',
        'price' => 420.00,
        'description' => 'Hearty beef stew slow-cooked for hours in spicy berbere paste, infused with korarima (Ethiopian cardamom), mekelesha spice blend, and pure herbal butter.',
        'image_url' => 'https://images.unsplash.com/photo-1547496502-affa22d38842?w=500&auto=format&fit=crop',
        'preparation_time' => '25 mins'
    ],
    [
        'name' => 'Alicha Sega Wat (አልጫ የስጋ ወጥ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Stews',
        'price' => 410.00,
        'description' => 'Gentle and savory golden mild beef stew flavored with turmeric, fresh garlic, ground ginger, sliced onions, and spiced butter, ideal for guests who prefer non-spicy dishes.',
        'image_url' => 'https://images.unsplash.com/photo-1547496502-affa22d38842?w=500&auto=format&fit=crop',
        'preparation_time' => '20 mins'
    ],
    [
        'name' => 'Gomen Kitfo be Sega (ጎመን በስጋ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Stews',
        'price' => 390.00,
        'description' => 'Fresh tender collard greens chopped fine and slow-cooked with juicy beef cubes, aromatic niter kibbeh butter, garlic, and Ethiopian highland herbs.',
        'image_url' => 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500&auto=format&fit=crop',
        'preparation_time' => '20 mins'
    ],
    [
        'name' => 'Derek Tibs (ደረቅ ጥብስ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Grills',
        'price' => 460.00,
        'description' => 'Crispy and crunchy pan-fried seasoned prime beef chunks, drained of excess grease and tossed with fresh rosemary, jalapeños, onions, and mitmita.',
        'image_url' => 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&auto=format&fit=crop',
        'preparation_time' => '20 mins'
    ],
    [
        'name' => 'Special Dulet (ልዩ ዱለት)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Specialties',
        'price' => 430.00,
        'description' => 'A celebrated delicacy of finely diced tender red meat, liver, and tripe seasoned with fiery mitmita chili, minced red onions, jalapeños, and warm spiced butter.',
        'image_url' => 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop',
        'preparation_time' => '15-20 mins'
    ],
    [
        'name' => 'Gored Gored (ጎረድ ጎረድ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Specialties',
        'price' => 500.00,
        'description' => 'Generous cubes of prime raw lean beef tenderloin rolled in hot awaze pepper paste and warm herbal spiced butter. Served with injera or crusty bread.',
        'image_url' => 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop',
        'preparation_time' => '10-15 mins'
    ],
    [
        'name' => 'Kuanta Firfir (የቋንጣ ፍርፍር)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Stews',
        'price' => 410.00,
        'description' => 'Artisanal sun-dried and smoked beef jerky shredded into a rich berbere onion gravy, generously tossed with shredded rolls of fresh injera.',
        'image_url' => 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&auto=format&fit=crop',
        'preparation_time' => '20 mins'
    ],
    [
        'name' => 'Beef Tibs Firfir (የስጋ ጥብስ ፍርፍር)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Stews',
        'price' => 420.00,
        'description' => 'Pan-fried beef tenderloin pieces simmered in spicy berbere sauce and thoroughly tossed with tender pieces of rolled teff injera and green peppers.',
        'image_url' => 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&auto=format&fit=crop',
        'preparation_time' => '20 mins'
    ],
    [
        'name' => 'Yebeg Alicha / Lamb Stew (የበግ አልጫ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Stews',
        'price' => 470.00,
        'description' => 'Fall-off-the-bone succulent pieces of young lamb simmered in a fragrant turmeric, ginger, garlic, and rosemary herbal butter broth.',
        'image_url' => 'https://images.unsplash.com/photo-1547496502-affa22d38842?w=500&auto=format&fit=crop',
        'preparation_time' => '25 mins'
    ],
    [
        'name' => 'Chechebsa with Honey & Yogurt (ጨጨብሳ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Breakfast',
        'price' => 260.00,
        'description' => 'Shredded pan-baked flatbread pan-fried in warm niter kibbeh and mild berbere spice, generously drizzled with pure Ethiopian organic forest honey and plain yogurt.',
        'image_url' => 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=500&auto=format&fit=crop',
        'preparation_time' => '15 mins'
    ],
    [
        'name' => 'Kinche Porridge (ቂንጬ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Breakfast',
        'price' => 200.00,
        'description' => 'Cracked durum wheat steamed to tender perfection and infused with golden spiced clarified herbal butter and a touch of black cardamom.',
        'image_url' => 'https://images.unsplash.com/photo-1517673132405-a56a62b18caf?w=500&auto=format&fit=crop',
        'preparation_time' => '15 mins'
    ],
    [
        'name' => 'Genfo with Spiced Butter & Ayib (የገንፎ ድስት)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Breakfast',
        'price' => 280.00,
        'description' => 'Traditional dense wheat and roasted barley pudding formed into a volcano mound, filled with a crater of melted spiced niter kibbeh, berbere, and fresh ayib cottage cheese.',
        'image_url' => 'https://images.unsplash.com/photo-1505253758473-96b3015f240a?w=500&auto=format&fit=crop',
        'preparation_time' => '20 mins'
    ],
    [
        'name' => 'Enkulal Firfir (ልዩ የእንቁላል ፍርፍር)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Breakfast',
        'price' => 220.00,
        'description' => 'Three farm-fresh eggs scrambled with ripe vine tomatoes, diced sweet red onions, hot green peppers, and niter kibbeh butter. Served with warm crusty bread or injera.',
        'image_url' => 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=500&auto=format&fit=crop',
        'preparation_time' => '12 mins'
    ],
    [
        'name' => 'Asa Tibs (የዓሳ ጥብስ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Fish & Seafood',
        'price' => 440.00,
        'description' => 'Lake Tana whole fresh tilapia scored and deep-fried to golden crispness, rubbed with garlic, cumin, and lemon pepper. Served with awaze dip and lime.',
        'image_url' => 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=500&auto=format&fit=crop',
        'preparation_time' => '20-25 mins'
    ],
    [
        'name' => 'Asa Gulash (የዓሳ ጉላሽ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Fish & Seafood',
        'price' => 420.00,
        'description' => 'Fresh fish fillet nuggets simmered in a spiced tomato, garlic, and berbere reduction with sweet bell peppers, red onions, and lemon.',
        'image_url' => 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=500&auto=format&fit=crop',
        'preparation_time' => '20 mins'
    ],
    [
        'name' => 'Misir Wat (የምስር ወጥ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Vegetarian',
        'price' => 240.00,
        'description' => 'Velvety organic red lentils slow-simmered in a rich berbere, garlic, and ginger sauce until thick and comforting. Served with fresh teff injera.',
        'image_url' => 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop',
        'preparation_time' => '15 mins'
    ],
    [
        'name' => 'Kik Alicha (የክክ አልጫ ወጥ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Vegetarian',
        'price' => 230.00,
        'description' => 'Creamy yellow split peas simmered with mild turmeric, minced garlic, ginger, and sweet caramelized onions. Nutritious, mild, and flavorful.',
        'image_url' => 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=500&auto=format&fit=crop',
        'preparation_time' => '15 mins'
    ],
    [
        'name' => 'Fosolia be Karot (የፎሶሊያና ካሮት ጥብስ)',
        'category' => 'ethiopian_food',
        'sub_category' => 'Ethiopian Traditional - Vegetarian',
        'price' => 220.00,
        'description' => 'Fresh green string beans and sweet sliced carrots sautéed with garlic, sweet red onions, and ripe tomatoes in olive oil.',
        'image_url' => 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500&auto=format&fit=crop',
        'preparation_time' => '15 mins'
    ]
];

$stmt = $conn->prepare("SELECT id FROM menu_items WHERE name = ?");
$updateStmt = $conn->prepare("UPDATE menu_items SET category = ?, sub_category = ?, price = ?, description = ?, image_url = ?, preparation_time = ?, is_available = 1 WHERE id = ?");
$insertStmt = $conn->prepare("INSERT INTO menu_items (name, category, sub_category, price, description, image_url, preparation_time, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, 1)");

$added = 0;
$updated = 0;

foreach ($ethiopianMeals as $m) {
    $stmt->bind_param('s', $m['name']);
    $stmt->execute();
    $res = $stmt->get_result();
    if ($row = $res->fetch_assoc()) {
        $updateStmt->bind_param('ssdsssi', $m['category'], $m['sub_category'], $m['price'], $m['description'], $m['image_url'], $m['preparation_time'], $row['id']);
        $updateStmt->execute();
        $updated++;
    } else {
        $insertStmt->bind_param('sssdsss', $m['name'], $m['category'], $m['sub_category'], $m['price'], $m['description'], $m['image_url'], $m['preparation_time']);
        $insertStmt->execute();
        $added++;
    }
}

// Clean up any incomplete test item like "tibis"
$conn->query("DELETE FROM menu_items WHERE name = 'tibis'");

$countRes = $conn->query("SELECT COUNT(*) as c FROM menu_items WHERE category IN ('food', 'ethiopian_food')");
$totalFood = $countRes ? (int)$countRes->fetch_assoc()['c'] : 0;

echo json_encode([
    'status' => 'success',
    'message' => "Ethiopian dining menu updated successfully! Added: $added, Updated: $updated.",
    'total_food_items' => $totalFood,
    'ethiopian_meal_count' => count($ethiopianMeals)
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

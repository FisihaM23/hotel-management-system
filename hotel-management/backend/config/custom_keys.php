<?php
// Active Chapa & Notification Configuration

// 1. Chapa Public Key (provided by user)
define('CHAPA_PUBLIC_KEY', 'CHAPA_TEST_PUB_FJxLS1GQRO2GQUq1ek4XIyoyBvYuIWE9r0QPJCjs');

// 2. Chapa Secret Key (optional for server-to-server verify; keep empty for test simulator)
define('CHAPA_SECRET_KEY', getenv('CHAPA_SECRET_KEY') ?: '');

// 3. Admin Notification Phone Number (receives SMS alert on every customer payment)
define('ADMIN_NOTIFICATION_PHONE', '+251932338138');

// 4. Admin Notification Email (receives push payment receipt on smartphone)
define('ADMIN_NOTIFICATION_EMAIL', 'befather7@gmail.com');

// 5. Currency
define('CHAPA_CURRENCY', 'ETB');

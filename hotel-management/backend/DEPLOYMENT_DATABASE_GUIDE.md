# Safe Deployment and Database Setup Guide

This guide details the procedure for safely provisioning, maintaining, and configuring the Hotel Management System database in development and production environments.

---

## 1. Environment Configuration

All infrastructure parameters are loaded through `backend/.env` (or environment variables provided by your container/hosting platform). Copy `backend/.env.example` to `backend/.env` and update:

```ini
# Dedicated Application Database Credentials (Non-Root)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=hotel_management
DB_USER=hms_app_user
DB_PASS=YourStrongSecurePasswordHere!

# Installer Protection Token (Required for web-based installer invocation)
INSTALLER_TOKEN=hms_sec_inst_9f8e7d6c5b4a3210

# Trusted Frontend Origins (CORS)
FRONTEND_URL=https://grandhotel.et
CORS_ALLOWED_ORIGINS=https://grandhotel.et,https://www.grandhotel.et,http://localhost:5173
```

---

## 2. Dedicated Least-Privilege MySQL User

Never run the application in production using the MySQL `root` superuser. Create a dedicated application user with only the necessary Data Manipulation Language (DML) and indexing privileges:

```sql
-- Connect to MySQL as root/admin:
CREATE USER 'hms_app_user'@'localhost' IDENTIFIED BY 'YourStrongSecurePasswordHere!';

-- Grant required table operations:
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER, REFERENCES 
ON hotel_management.* TO 'hms_app_user'@'localhost';

FLUSH PRIVILEGES;
```

---

## 3. Database Installation Procedure

### Option A: Direct CLI Execution (Recommended)
Run the setup script from the project root using PHP CLI:

```bash
php backend/scripts/setup_db.php
```

CLI execution has zero web exposure and automatically provisions tables, initial seeds, and self-healing schemas.

### Option B: Protected Web Setup (When CLI is unavailable)
If invoking `backend/setup_db.php` through a browser or CI/CD deployment webhook, pass the configured `INSTALLER_TOKEN`:

- **Via Header (Recommended):**
  ```bash
  curl -X POST https://yourdomain.com/hotel-management/backend/setup_db.php \
       -H "X-Installer-Token: hms_sec_inst_9f8e7d6c5b4a3210"
  ```
- **Via Query Parameter:**
  ```
  https://yourdomain.com/hotel-management/backend/setup_db.php?token=hms_sec_inst_9f8e7d6c5b4a3210
  ```
- **Via Authenticated Administrator Session:**
  Pass `Authorization: Bearer <ADMIN_JWT_TOKEN>` in request headers.

Requests without a valid token or administrator session are immediately rejected with **HTTP 403 Forbidden**.

---

## 4. Diagnostic & Health Check Endpoint

- **Endpoint:** `GET /api/test_connection.php`
- **Anonymous Visitors:** Receives a sanitized, non-disclosing health check (`{"status":"success","message":"Service healthy"}`) without database names, table lists, row counts, or server topology.
- **Authenticated Administrators (`role=admin`):** Receives full system diagnostics and table record counts.
- **Database Connection Errors:** All database failures return a sanitized HTTP 500 error (`{"error":"Database connection unavailable. Please contact the administrator."}`) while logging details strictly to server logs (`error_log`).

---

## 5. Password Reset & Maintenance Security

- Legacy unauthenticated password resets through `reset_passwords.php` are disabled. All requests must use the cryptographically verified email OTP workflow (`forgot_password.php`, `verify_otp.php`, `reset_password.php`).
- One-off seeding scripts (`seed_ethiopian_menu.php`, `update_menu_prices.php`) reside in `backend/scripts/` outside the public API folder.


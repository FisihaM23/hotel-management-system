<?php

/**
 * Centralized Financial Calculation, Tax/VAT & Audit Service
 *
 * Single source of truth for:
 *   - Configurable Ethiopian VAT / tax rates (default 15% VAT, configurable by Admin/Accountant)
 *   - Per-invoice tax exemption support (tax_exempt, tax_exemption_reason)
 *   - Room, dining, additional charges, discount, tax, and grand total math
 *   - Historical tax rate/amount persistence on finalized invoices
 *   - Payment totals, refunds, balance due, and invoice status synchronization
 *   - Immutable financial_audit_log entries for adjustments, exemptions, refunds, and tax config changes
 */
class FinancialService
{
    public const DEFAULT_VAT_RATE = 0.15;
    public const DEFAULT_CHECKOUT_TAX_RATE = 0.15;

    /**
     * Idempotently ensure Phase 7 financial schema extensions exist.
     * Uses read-only information_schema checks first so normal API requests execute zero DDL.
     */
    public static function ensureSchema(mysqli $conn): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }

        $invCols = $conn->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'invoices'
               AND COLUMN_NAME IN ('room_charges', 'dining_charges', 'additional_charges', 'tax_rate', 'tax_exempt', 'tax_exemption_reason')"
        );
        $invColCnt = $invCols ? (int) ($invCols->fetch_assoc()['cnt'] ?? 0) : 0;

        $doCol = $conn->query(
            "SELECT 1 FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'dining_orders'
               AND COLUMN_NAME = 'booking_id'
             LIMIT 1"
        );
        $hasDiningBookingId = $doCol && (bool) $doCol->fetch_row();

        $tbls = $conn->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN ('financial_settings', 'financial_audit_log')"
        );
        $tblCnt = $tbls ? (int) ($tbls->fetch_assoc()['cnt'] ?? 0) : 0;

        if ($invColCnt === 6 && $hasDiningBookingId && $tblCnt === 2) {
            $ensured = true;
            return;
        }

        $conn->query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS room_charges DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER invoice_number");
        $conn->query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dining_charges DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER room_charges");
        $conn->query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS additional_charges DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER dining_charges");
        $conn->query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(6,4) NOT NULL DEFAULT 0.1500 AFTER subtotal");
        $conn->query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_exempt TINYINT(1) NOT NULL DEFAULT 0 AFTER tax");
        $conn->query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_exemption_reason VARCHAR(255) NULL DEFAULT NULL AFTER tax_exempt");

        $conn->query("ALTER TABLE dining_orders ADD COLUMN IF NOT EXISTS booking_id INT NULL DEFAULT NULL AFTER customer_id");

        $conn->query("CREATE TABLE IF NOT EXISTS financial_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            setting_key VARCHAR(64) NOT NULL UNIQUE,
            setting_value VARCHAR(255) NOT NULL,
            description VARCHAR(255) NULL,
            updated_by INT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $conn->query("CREATE TABLE IF NOT EXISTS financial_audit_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            entity_type ENUM('invoice','payment','booking','tax_setting') NOT NULL,
            entity_id INT NOT NULL DEFAULT 0,
            action VARCHAR(64) NOT NULL,
            old_values TEXT NULL,
            new_values TEXT NULL,
            reason VARCHAR(255) NULL,
            performed_by INT NULL,
            performed_by_role VARCHAR(32) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_fal_entity (entity_type, entity_id),
            INDEX idx_fal_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // Seed default Ethiopian VAT settings if missing (idempotent)
        $defaults = [
            ['room_vat_rate', '0.15', 'Standard VAT rate for room accommodation (15% in Ethiopia; confirm applicability with hotel accountant)'],
            ['dining_vat_rate', '0.15', 'Standard VAT rate for food & beverage / dining (15% in Ethiopia; confirm applicability with hotel accountant)'],
            ['vat_enabled', '1', 'Global VAT toggle (1 = enabled, 0 = disabled/exempt)'],
            ['currency', 'ETB', 'Primary hotel accounting currency'],
        ];
        $ins = $conn->prepare("INSERT IGNORE INTO financial_settings (setting_key, setting_value, description) VALUES (?, ?, ?)");
        if ($ins) {
            foreach ($defaults as [$k, $v, $desc]) {
                $ins->bind_param('sss', $k, $v, $desc);
                $ins->execute();
            }
            $ins->close();
        }

        $ensured = true;
    }

    /**
     * Load active tax configuration from financial_settings.
     */
    public static function getTaxConfig(mysqli $conn): array
    {
        self::ensureSchema($conn);

        $config = [
            'room_vat_rate' => self::DEFAULT_VAT_RATE,
            'dining_vat_rate' => self::DEFAULT_VAT_RATE,
            'vat_enabled' => true,
            'currency' => 'ETB',
        ];

        $res = $conn->query("SELECT setting_key, setting_value FROM financial_settings");
        if ($res) {
            while ($row = $res->fetch_assoc()) {
                $k = $row['setting_key'];
                $v = $row['setting_value'];
                if ($k === 'room_vat_rate') {
                    $config['room_vat_rate'] = max(0.0, min(1.0, (float) $v));
                } elseif ($k === 'dining_vat_rate') {
                    $config['dining_vat_rate'] = max(0.0, min(1.0, (float) $v));
                } elseif ($k === 'vat_enabled') {
                    $config['vat_enabled'] = ($v === '1' || strtolower($v) === 'true');
                } elseif ($k === 'currency' && $v !== '') {
                    $config['currency'] = $v;
                }
            }
        }

        return $config;
    }

    /**
     * Update tax configuration (Admin / Accountant controlled) with audit logging.
     */
    public static function updateTaxConfig(
        mysqli $conn,
        array $updates,
        int $actorId,
        string $actorRole,
        string $reason = 'Tax configuration updated'
    ): array {
        self::ensureSchema($conn);
        $old = self::getTaxConfig($conn);

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("INSERT INTO financial_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)");
            if (!$stmt) {
                throw new RuntimeException($conn->error);
            }

            if (isset($updates['room_vat_rate'])) {
                $r = (float) $updates['room_vat_rate'];
                if ($r < 0.0 || $r > 1.0) {
                    $conn->rollback();
                    return ['ok' => false, 'code' => 400, 'error' => 'room_vat_rate must be between 0 and 1 (e.g. 0.15 for 15%)'];
                }
                $k = 'room_vat_rate';
                $val = number_format($r, 4, '.', '');
                $stmt->bind_param('ssi', $k, $val, $actorId);
                $stmt->execute();
            }

            if (isset($updates['dining_vat_rate'])) {
                $r = (float) $updates['dining_vat_rate'];
                if ($r < 0.0 || $r > 1.0) {
                    $conn->rollback();
                    return ['ok' => false, 'code' => 400, 'error' => 'dining_vat_rate must be between 0 and 1 (e.g. 0.15 for 15%)'];
                }
                $k = 'dining_vat_rate';
                $val = number_format($r, 4, '.', '');
                $stmt->bind_param('ssi', $k, $val, $actorId);
                $stmt->execute();
            }

            if (isset($updates['vat_enabled'])) {
                $k = 'vat_enabled';
                $val = $updates['vat_enabled'] ? '1' : '0';
                $stmt->bind_param('ssi', $k, $val, $actorId);
                $stmt->execute();
            }

            $stmt->close();
            $new = self::getTaxConfig($conn);
            self::recordAudit($conn, 'tax_setting', 0, 'update_tax_config', $old, $new, $reason, $actorId, $actorRole);
            $conn->commit();
            return ['ok' => true, 'code' => 200, 'config' => $new];
        } catch (\Throwable $e) {
            $conn->rollback();
            return ['ok' => false, 'code' => 500, 'error' => 'Failed to update tax configuration: ' . $e->getMessage()];
        }
    }

    /**
     * Backward-compatible pure calculation helper.
     */
    public static function calculateTotals(
        float $subtotal,
        float $taxRate = 0.0,
        float $discount = 0.0
    ): array {
        $subtotal = round(max(0.0, $subtotal), 2);
        $discount = round(min($subtotal, max(0.0, $discount)), 2);
        $taxableBase = round(max(0.0, $subtotal - $discount), 2);
        $taxRate = max(0.0, $taxRate);
        $tax = round($taxableBase * $taxRate, 2);
        $total = round(max(0.0, $taxableBase + $tax), 2);

        return [
            'subtotal' => $subtotal,
            'tax_rate' => round($taxRate, 4),
            'tax' => $tax,
            'discount' => $discount,
            'total' => $total,
        ];
    }

    /**
     * Calculate itemized room + dining + additional charges with configurable VAT & exemption support.
     */
    public static function calculateItemizedTotals(
        mysqli $conn,
        float $roomCharges,
        float $diningCharges = 0.0,
        float $additionalCharges = 0.0,
        float $discount = 0.0,
        bool $taxExempt = false,
        ?float $overrideRoomVatRate = null,
        ?float $overrideDiningVatRate = null
    ): array {
        $roomCharges = round(max(0.0, $roomCharges), 2);
        $diningCharges = round(max(0.0, $diningCharges), 2);
        $additionalCharges = round(max(0.0, $additionalCharges), 2);
        $subtotal = round($roomCharges + $diningCharges + $additionalCharges, 2);
        $discount = round(min($subtotal, max(0.0, $discount)), 2);

        $cfg = self::getTaxConfig($conn);
        if ($taxExempt || !$cfg['vat_enabled']) {
            return [
                'room_charges' => $roomCharges,
                'dining_charges' => $diningCharges,
                'additional_charges' => $additionalCharges,
                'subtotal' => $subtotal,
                'discount' => $discount,
                'tax_rate' => 0.0,
                'tax' => 0.0,
                'tax_exempt' => true,
                'total' => round(max(0.0, $subtotal - $discount), 2),
            ];
        }

        $roomVatRate = $overrideRoomVatRate !== null ? max(0.0, $overrideRoomVatRate) : $cfg['room_vat_rate'];
        $diningVatRate = $overrideDiningVatRate !== null ? max(0.0, $overrideDiningVatRate) : $cfg['dining_vat_rate'];

        $taxableBase = round(max(0.0, $subtotal - $discount), 2);
        if ($taxableBase <= 0.0) {
            $tax = 0.0;
            $effectiveRate = $roomVatRate;
        } elseif (abs($roomVatRate - $diningVatRate) < 0.00001) {
            $tax = round($taxableBase * $roomVatRate, 2);
            $effectiveRate = $roomVatRate;
        } else {
            // Allocate discount proportionally between room+additional and dining
            $ratio = $taxableBase / $subtotal;
            $roomBase = ($roomCharges + $additionalCharges) * $ratio;
            $diningBase = $diningCharges * $ratio;
            $tax = round(($roomBase * $roomVatRate) + ($diningBase * $diningVatRate), 2);
            $effectiveRate = round($tax / $taxableBase, 4);
        }

        $total = round(max(0.0, $taxableBase + $tax), 2);

        return [
            'room_charges' => $roomCharges,
            'dining_charges' => $diningCharges,
            'additional_charges' => $additionalCharges,
            'subtotal' => $subtotal,
            'discount' => $discount,
            'tax_rate' => round($effectiveRate, 4),
            'tax' => $tax,
            'tax_exempt' => false,
            'total' => $total,
        ];
    }

    /**
     * Sum non-cancelled dining orders linked to a booking (without double-counting).
     */
    public static function getBookingDiningCharges(mysqli $conn, int $bookingId): float
    {
        self::ensureSchema($conn);
        $prefix = 'Pre-ordered with Booking #' . $bookingId . '.%';
        $stmt = $conn->prepare(
            "SELECT COALESCE(SUM(total_amount), 0) AS dining_total
             FROM dining_orders
             WHERE status != 'cancelled'
               AND (booking_id = ? OR (booking_id IS NULL AND special_notes LIKE ?))"
        );
        if (!$stmt) {
            throw new RuntimeException($conn->error ?: 'Failed to query booking dining charges');
        }
        $stmt->bind_param('is', $bookingId, $prefix);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return round((float) ($row['dining_total'] ?? 0), 2);
    }

    /**
     * Recalculate booking total (preserving room, dining, tax, discount, and additional charges)
     * and synchronize any linked invoice & outstanding balance inside an active transaction.
     */
    public static function recalculateBookingAndInvoice(
        mysqli $conn,
        int $bookingId,
        float $roomCharges
    ): array {
        self::ensureSchema($conn);
        $diningCharges = self::getBookingDiningCharges($conn, $bookingId);

        $invChk = $conn->prepare("SELECT id, additional_charges, discount, tax_rate, tax_exempt, status, total FROM invoices WHERE booking_id = ? FOR UPDATE");
        if (!$invChk) {
            throw new RuntimeException($conn->error ?: 'Failed to lock invoice');
        }
        $invChk->bind_param('i', $bookingId);
        $invChk->execute();
        $invRow = $invChk->get_result()->fetch_assoc();
        $invChk->close();

        if ($invRow) {
            $rate = (float) $invRow['tax_rate'];
            $overrideRate = (!$invRow['tax_exempt'] && $rate > 0) ? $rate : null;
            $calc = self::calculateItemizedTotals(
                $conn,
                $roomCharges,
                $diningCharges,
                (float) $invRow['additional_charges'],
                (float) $invRow['discount'],
                (bool) $invRow['tax_exempt'],
                $overrideRate,
                $overrideRate
            );
        } else {
            $calc = self::calculateItemizedTotals($conn, $roomCharges, $diningCharges);
        }

        $paidAmount = self::getCompletedPaidAmount($conn, $bookingId);
        $balanceDue = round(max(0.0, $calc['total'] - $paidAmount), 2);

        if ($invRow) {
            $newInvStatus = $balanceDue <= 0.01 ? 'paid' : ($invRow['status'] === 'draft' ? 'draft' : 'sent');
            $updInv = $conn->prepare("UPDATE invoices SET room_charges=?, dining_charges=?, subtotal=?, tax=?, total=?, status=? WHERE id=?");
            if (!$updInv) {
                throw new RuntimeException($conn->error ?: 'Failed to update linked invoice');
            }
            $updInv->bind_param(
                'dddddsi',
                $calc['room_charges'],
                $calc['dining_charges'],
                $calc['subtotal'],
                $calc['tax'],
                $calc['total'],
                $newInvStatus,
                $invRow['id']
            );
            if (!$updInv->execute()) {
                throw new RuntimeException($updInv->error ?: 'Failed to sync linked invoice');
            }
            $updInv->close();
        }

        $calc['paid_amount'] = $paidAmount;
        $calc['balance_due'] = $balanceDue;
        return $calc;
    }

    /**
     * Query total completed payments for a booking inside the active transaction.
     * Excludes pending, failed, and refunded payments.
     */
    public static function getCompletedPaidAmount(mysqli $conn, int $bookingId): float
    {
        $stmt = $conn->prepare("SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE booking_id = ? AND status = 'completed'");
        if (!$stmt) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare completed payment sum');
        }
        $stmt->bind_param('i', $bookingId);
        if (!$stmt->execute()) {
            throw new RuntimeException($stmt->error ?: 'Failed to calculate completed payments');
        }
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return round((float) ($row['total_paid'] ?? 0), 2);
    }

    /**
     * Record a financial audit entry inside the active connection/transaction.
     */
    public static function recordAudit(
        mysqli $conn,
        string $entityType,
        int $entityId,
        string $action,
        $oldValues,
        $newValues,
        string $reason,
        ?int $actorId,
        string $actorRole
    ): void {
        self::ensureSchema($conn);
        $oldJson = $oldValues !== null ? json_encode($oldValues) : null;
        $newJson = $newValues !== null ? json_encode($newValues) : null;
        $stmt = $conn->prepare("INSERT INTO financial_audit_log (entity_type, entity_id, action, old_values, new_values, reason, performed_by, performed_by_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        if (!$stmt) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare financial audit log');
        }
        $stmt->bind_param('sissssis', $entityType, $entityId, $action, $oldJson, $newJson, $reason, $actorId, $actorRole);
        if (!$stmt->execute()) {
            throw new RuntimeException($stmt->error ?: 'Failed to insert financial audit log');
        }
        $stmt->close();
    }

    /**
     * Compute authoritative financial summary for a booking (including invoice if present).
     */
    public static function getBookingSummary(mysqli $conn, int $bookingId, float $bookingTotal): array
    {
        self::ensureSchema($conn);
        $paidAmount = self::getCompletedPaidAmount($conn, $bookingId);

        $invStmt = $conn->prepare("SELECT id, invoice_number, room_charges, dining_charges, additional_charges, subtotal, tax_rate, tax, tax_exempt, tax_exemption_reason, discount, total, status FROM invoices WHERE booking_id = ? LIMIT 1");
        if (!$invStmt) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare invoice lookup');
        }
        $invStmt->bind_param('i', $bookingId);
        if (!$invStmt->execute()) {
            throw new RuntimeException($invStmt->error ?: 'Failed to lookup invoice');
        }
        $existingInv = $invStmt->get_result()->fetch_assoc();
        $invStmt->close();

        $finalTotal = $existingInv ? round((float) $existingInv['total'], 2) : round($bookingTotal, 2);
        $balanceDue = round(max(0.0, $finalTotal - $paidAmount), 2);
        $paymentStatus = $balanceDue <= 0.01 ? 'paid' : ($paidAmount > 0 ? 'partially_paid' : 'pending');

        return [
            'booking_total' => round($bookingTotal, 2),
            'final_total' => $finalTotal,
            'paid_amount' => $paidAmount,
            'balance_due' => $balanceDue,
            'payment_status' => $paymentStatus,
            'existing_invoice' => $existingInv,
        ];
    }

    /**
     * Create an invoice for a booking using authoritative FinancialService math.
     */
    public static function createInvoiceForBooking(
        mysqli $conn,
        int $bookingId,
        float $roomCharges,
        float $diningCharges,
        float $additionalCharges,
        float $discount,
        bool $taxExempt,
        ?string $taxExemptionReason,
        float $paidAmount,
        ?string $dueDate = null,
        ?int $actorId = null,
        string $actorRole = 'system'
    ): array {
        self::ensureSchema($conn);
        $calc = self::calculateItemizedTotals(
            $conn,
            $roomCharges,
            $diningCharges,
            $additionalCharges,
            $discount,
            $taxExempt
        );

        $balanceDue = round(max(0.0, $calc['total'] - $paidAmount), 2);
        $invStatus = $balanceDue <= 0.01 ? 'paid' : 'sent';
        $invNum = 'INV-' . date('Y') . '-' . strtoupper(substr(uniqid('', true), -6));
        $due = $dueDate ?: date('Y-m-d');
        $exemptInt = $calc['tax_exempt'] ? 1 : 0;

        $insInv = $conn->prepare(
            "INSERT INTO invoices (booking_id, invoice_number, room_charges, dining_charges, additional_charges, subtotal, tax_rate, tax, tax_exempt, tax_exemption_reason, discount, total, status, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        if (!$insInv) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare invoice insert');
        }
        $insInv->bind_param(
            'isddddddisddss',
            $bookingId,
            $invNum,
            $calc['room_charges'],
            $calc['dining_charges'],
            $calc['additional_charges'],
            $calc['subtotal'],
            $calc['tax_rate'],
            $calc['tax'],
            $exemptInt,
            $taxExemptionReason,
            $calc['discount'],
            $calc['total'],
            $invStatus,
            $due
        );
        if (!$insInv->execute()) {
            throw new RuntimeException($insInv->error ?: 'Failed to create invoice');
        }
        $invoiceId = (int) $conn->insert_id;
        $insInv->close();

        self::recordAudit($conn, 'invoice', $invoiceId, 'create_invoice', null, $calc, 'Invoice created via FinancialService', $actorId, $actorRole);

        return [
            'invoice_id' => $invoiceId,
            'invoice_number' => $invNum,
            'room_charges' => $calc['room_charges'],
            'dining_charges' => $calc['dining_charges'],
            'additional_charges' => $calc['additional_charges'],
            'subtotal' => $calc['subtotal'],
            'tax_rate' => $calc['tax_rate'],
            'tax' => $calc['tax'],
            'discount' => $calc['discount'],
            'final_total' => $calc['total'],
            'paid_amount' => round($paidAmount, 2),
            'balance_due' => $balanceDue,
            'invoice_status' => $invStatus,
        ];
    }

    /**
     * Synchronize invoice paid/sent status after a payment or refund.
     */
    public static function syncInvoiceStatusFromPayments(mysqli $conn, int $bookingId): ?array
    {
        self::ensureSchema($conn);
        $invStmt = $conn->prepare("SELECT id, invoice_number, total, status FROM invoices WHERE booking_id = ? FOR UPDATE");
        if (!$invStmt) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare invoice lock');
        }
        $invStmt->bind_param('i', $bookingId);
        $invStmt->execute();
        $inv = $invStmt->get_result()->fetch_assoc();
        $invStmt->close();

        if (!$inv) {
            return null;
        }

        $paidAmount = self::getCompletedPaidAmount($conn, $bookingId);
        $total = round((float) $inv['total'], 2);
        $balanceDue = round(max(0.0, $total - $paidAmount), 2);
        $newStatus = $balanceDue <= 0.01 ? 'paid' : 'sent';

        if ($inv['status'] !== $newStatus) {
            $upd = $conn->prepare("UPDATE invoices SET status = ? WHERE id = ?");
            if (!$upd) {
                throw new RuntimeException($conn->error);
            }
            $upd->bind_param('si', $newStatus, $inv['id']);
            $upd->execute();
            $upd->close();
        }

        return [
            'invoice_id' => (int) $inv['id'],
            'invoice_number' => $inv['invoice_number'],
            'final_total' => $total,
            'paid_amount' => $paidAmount,
            'balance_due' => $balanceDue,
            'invoice_status' => $newStatus,
        ];
    }

    /**
     * Create or finalize the invoice during atomic checkout.
     * Preserves historical tax_rate/discount/additional_charges on existing invoices,
     * while incorporating any new room-service dining charges if not yet finalized.
     */
    public static function finalizeCheckoutInvoice(
        mysqli $conn,
        int $bookingId,
        float $bookingTotal,
        float $paidAmount
    ): array {
        self::ensureSchema($conn);

        $invStmt = $conn->prepare("SELECT id, invoice_number, room_charges, dining_charges, additional_charges, subtotal, tax_rate, tax, tax_exempt, tax_exemption_reason, discount, total, status FROM invoices WHERE booking_id = ? FOR UPDATE");
        if (!$invStmt) {
            throw new RuntimeException($conn->error ?: 'Failed to prepare invoice lock');
        }
        $invStmt->bind_param('i', $bookingId);
        if (!$invStmt->execute()) {
            throw new RuntimeException($invStmt->error ?: 'Failed to lock invoice');
        }
        $existingInv = $invStmt->get_result()->fetch_assoc();
        $invStmt->close();

        if ($existingInv) {
            // Check if additional room-service dining charges were added after initial booking invoice
            $currentDining = self::getBookingDiningCharges($conn, $bookingId);
            $storedDining = round((float) ($existingInv['dining_charges'] ?? 0), 2);

            if ($currentDining > $storedDining + 0.01) {
                $roomCharges = (float) $existingInv['room_charges'];
                if ($roomCharges <= 0.0 && $existingInv['subtotal'] > 0) {
                    $roomCharges = max(0.0, (float) $existingInv['subtotal'] - $storedDining - (float) $existingInv['additional_charges']);
                }
                $storedRate = (float) $existingInv['tax_rate'];
                $calc = self::calculateItemizedTotals(
                    $conn,
                    $roomCharges,
                    $currentDining,
                    (float) $existingInv['additional_charges'],
                    (float) $existingInv['discount'],
                    (bool) $existingInv['tax_exempt'],
                    $storedRate,
                    $storedRate
                );
                $finalTotal = $calc['total'];
                $balanceDue = round(max(0.0, $finalTotal - $paidAmount), 2);
                $invStatus = $balanceDue <= 0.01 ? 'paid' : 'sent';

                $updInv = $conn->prepare("UPDATE invoices SET room_charges = ?, dining_charges = ?, subtotal = ?, tax = ?, total = ?, status = ? WHERE id = ?");
                if (!$updInv) {
                    throw new RuntimeException($conn->error);
                }
                $updInv->bind_param('dddddsi', $calc['room_charges'], $calc['dining_charges'], $calc['subtotal'], $calc['tax'], $finalTotal, $invStatus, $existingInv['id']);
                $updInv->execute();
                $updInv->close();
            } else {
                $finalTotal = round((float) $existingInv['total'], 2);
                $balanceDue = round(max(0.0, $finalTotal - $paidAmount), 2);
                $invStatus = $balanceDue <= 0.01 ? 'paid' : 'sent';

                $updInv = $conn->prepare("UPDATE invoices SET status = ? WHERE id = ?");
                if (!$updInv) {
                    throw new RuntimeException($conn->error ?: 'Failed to prepare invoice finalization');
                }
                $updInv->bind_param('si', $invStatus, $existingInv['id']);
                if (!$updInv->execute()) {
                    throw new RuntimeException($updInv->error ?: 'Failed to finalize invoice');
                }
                $updInv->close();
            }

            return [
                'invoice_id' => (int) $existingInv['id'],
                'invoice_number' => $existingInv['invoice_number'],
                'final_total' => $finalTotal,
                'paid_amount' => round($paidAmount, 2),
                'balance_due' => $balanceDue,
                'invoice_status' => $invStatus,
            ];
        }

        // No invoice existed yet: compute room + dining charges from authoritative booking & dining_orders
        $bStmt = $conn->prepare("SELECT b.room_id, b.check_in, b.check_out, r.price_per_night FROM bookings b LEFT JOIN rooms r ON b.room_id = r.id WHERE b.id = ? LIMIT 1");
        $bStmt->bind_param('i', $bookingId);
        $bStmt->execute();
        $bRow = $bStmt->get_result()->fetch_assoc();
        $bStmt->close();

        $diningCharges = self::getBookingDiningCharges($conn, $bookingId);
        if ($bRow && !empty($bRow['room_id']) && !empty($bRow['price_per_night'])) {
            $nights = max(1, (strtotime($bRow['check_out']) - strtotime($bRow['check_in'])) / 86400);
            $roomCharges = round((float) $bRow['price_per_night'] * $nights, 2);
        } else {
            $roomCharges = max(0.0, round($bookingTotal - $diningCharges, 2));
        }

        return self::createInvoiceForBooking(
            $conn,
            $bookingId,
            $roomCharges,
            $diningCharges,
            0.0,
            0.0,
            false,
            null,
            $paidAmount,
            date('Y-m-d'),
            null,
            'system'
        );
    }
}

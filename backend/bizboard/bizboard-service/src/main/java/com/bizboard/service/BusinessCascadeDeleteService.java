package com.bizboard.service;

import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * İşletme KALICI silme için scope'lu cascade motoru.
 *
 * <p><b>Neden ayrı servis / native SQL?</b> İşletmeye bağlı ~50 entity'nin
 * her birine repository bulk-delete metodu eklemek yerine, tüm cascade'i tek
 * yerde, denetlenebilir ve sırası garanti edilmiş şekilde tutuyoruz. Her DELETE
 * <b>SADECE</b> {@code business_id = :bid} kapsamına bağlıdır (doğrudan ya da
 * ebeveyn tablo üzerinden alt-sorgu ile) — başka işletmenin/DGR'nin verisine
 * ASLA dokunmaz.</p>
 *
 * <p><b>Sıra (çocuk → ebeveyn):</b> FK reddini önlemek için en-çocuk satırlar
 * önce silinir (postings, *_lines, *_account_counts, fund_link, debt_payments,
 * pos_deals...), sonra orta katman (transactions, journal_entries, debts,
 * instruments, bank_accounts, counterparts, categories...), en son işletmeye
 * bağlı bağımsız tablolar. {@code businesses} satırının kendisi BusinessService
 * tarafından (cascade ALL members/modules ile) silinir — burada DEĞİL.</p>
 *
 * <p><b>İşletmesiz (grandchild) tablolar</b> (postings, invoice_lines,
 * bank_import_lines, day_close_account_counts, day_open_account_openings,
 * phone_device_bank, fuel_logs, maintenance_logs) ebeveyn tablo üzerinden
 * {@code parent_fk IN (SELECT id FROM parent WHERE business_id = :bid)} ile
 * silinir. Yine cross-business sızıntısı yoktur.</p>
 *
 * <p><b>NOT NULL (no-business) tablolar HARİÇ:</b> currency_rates,
 * system_setting, notification_preferences — bunlarda business_id yoktur,
 * silinmez (global/per-user). audit_logs da KORUNUR (forensik iz).</p>
 *
 * @see BusinessService#purgeBusiness(UUID, UUID, String)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BusinessCascadeDeleteService {

    private final EntityManager entityManager;

    /**
     * Bir işletmeye bağlı TÜM child verisini FK-güvenli sırada siler.
     *
     * <p>{@code businesses} satırının KENDİSİNİ silmez — yalnız bağımlı
     * kayıtları temizler; çağıran (BusinessService) aynı transaction içinde
     * Business entity'sini siler.</p>
     *
     * @param businessId silinecek işletme id'si (asla null olmamalı)
     * @return tablo-adı → silinen satır sayısı (yalnız >0 olanlar), audit için
     */
    @Transactional
    public Map<String, Integer> purgeBusinessChildren(UUID businessId) {
        if (businessId == null) {
            throw new IllegalArgumentException("businessId null olamaz");
        }

        Map<String, Integer> counts = new LinkedHashMap<>();

        // ─────────────────────────────────────────────────────────────────
        // TUR 1 — En-çocuk / grandchild satırlar (ebeveyn FK üzerinden).
        // Bunlar ebeveynlerinden ÖNCE silinmeli.
        // ─────────────────────────────────────────────────────────────────

        // postings → journal_entries(business_id) (account/category/counterpart
        // FK'leri de buradan temizlenmiş olur — bank_accounts vb. silmeden önce).
        del(counts, "postings",
                "DELETE FROM postings WHERE journal_entry_id IN " +
                        "(SELECT id FROM journal_entries WHERE business_id = :bid)", businessId);

        // invoice_lines → invoices(business_id)
        del(counts, "invoice_lines",
                "DELETE FROM invoice_lines WHERE invoice_id IN " +
                        "(SELECT id FROM invoices WHERE business_id = :bid)", businessId);

        // bank_import_lines → bank_import_batches(business_id)
        del(counts, "bank_import_lines",
                "DELETE FROM bank_import_lines WHERE batch_id IN " +
                        "(SELECT id FROM bank_import_batches WHERE business_id = :bid)", businessId);

        // day_close_account_counts → day_closes(business_id)
        del(counts, "day_close_account_counts",
                "DELETE FROM day_close_account_counts WHERE day_close_id IN " +
                        "(SELECT id FROM day_closes WHERE business_id = :bid)", businessId);

        // day_open_account_openings → day_opens(business_id)
        del(counts, "day_open_account_openings",
                "DELETE FROM day_open_account_openings WHERE day_open_id IN " +
                        "(SELECT id FROM day_opens WHERE business_id = :bid)", businessId);

        // phone_device_bank → phone_device(business_id)
        del(counts, "phone_device_bank",
                "DELETE FROM phone_device_bank WHERE phone_device_id IN " +
                        "(SELECT id FROM phone_device WHERE business_id = :bid)", businessId);

        // fuel_logs / maintenance_logs → inventory_items(business_id)
        del(counts, "fuel_logs",
                "DELETE FROM fuel_logs WHERE inventory_item_id IN " +
                        "(SELECT id FROM inventory_items WHERE business_id = :bid)", businessId);
        del(counts, "maintenance_logs",
                "DELETE FROM maintenance_logs WHERE inventory_item_id IN " +
                        "(SELECT id FROM inventory_items WHERE business_id = :bid)", businessId);

        // ─────────────────────────────────────────────────────────────────
        // TUR 2 — Bağlantı/bağımlı satırlar (business_id'leri var ama
        // transaction/debt/instrument/pos vb. ebeveynlerinden önce silinmeli).
        // ─────────────────────────────────────────────────────────────────

        // fund_links → transactions'a iki NOT NULL FK; tx'ten önce.
        del(counts, "fund_link",
                "DELETE FROM fund_link WHERE business_id = :bid", businessId);

        // sub_cash_tx_inclusion → transactions + bank_accounts; ikisinden önce.
        del(counts, "sub_cash_tx_inclusion",
                "DELETE FROM sub_cash_tx_inclusion WHERE business_id = :bid", businessId);

        // sub_cash_assignments → bank_accounts; bank_accounts'tan önce.
        del(counts, "sub_cash_assignments",
                "DELETE FROM sub_cash_assignments WHERE business_id = :bid", businessId);

        // debt_payments → debts/counterparts/transactions/bank_accounts/payment_instruments; hepsinden önce.
        del(counts, "debt_payments",
                "DELETE FROM debt_payments WHERE business_id = :bid", businessId);
        // debt_writeoffs → debts/counterparts; debts'ten önce.
        del(counts, "debt_writeoffs",
                "DELETE FROM debt_writeoffs WHERE business_id = :bid", businessId);

        // pos_deals → pos_settlement_batches/pos_devices/bank_accounts/counterparts
        del(counts, "pos_deals",
                "DELETE FROM pos_deals WHERE business_id = :bid", businessId);
        // pos_settlement_batches → pos_devices/bank_accounts
        del(counts, "pos_settlement_batches",
                "DELETE FROM pos_settlement_batches WHERE business_id = :bid", businessId);

        // day_close_edit_requests → day_closes; day_closes'tan önce.
        del(counts, "day_close_edit_requests",
                "DELETE FROM day_close_edit_requests WHERE business_id = :bid", businessId);

        // ─────────────────────────────────────────────────────────────────
        // TUR 3 — Orta katman (transactions, journal_entries, debts, invoices,
        // instruments, payment_instruments, bank_import_batches ...).
        // Yukarıdaki çocukları/bağlantıları temizlendikten sonra silinir.
        // ─────────────────────────────────────────────────────────────────

        // transactions: fund_link / sub_cash_tx_inclusion / debt_payments /
        // postings(journal) zaten gitti.
        del(counts, "transactions",
                "DELETE FROM transactions WHERE business_id = :bid", businessId);
        // journal_entries: postings zaten gitti.
        del(counts, "journal_entries",
                "DELETE FROM journal_entries WHERE business_id = :bid", businessId);
        // invoices: invoice_lines zaten gitti.
        del(counts, "invoices",
                "DELETE FROM invoices WHERE business_id = :bid", businessId);
        // bank_import_batches: bank_import_lines zaten gitti.
        del(counts, "bank_import_batches",
                "DELETE FROM bank_import_batches WHERE business_id = :bid", businessId);
        // debts: debt_payments/debt_writeoffs zaten gitti.
        del(counts, "debts",
                "DELETE FROM debts WHERE business_id = :bid", businessId);
        del(counts, "instruments",
                "DELETE FROM instruments WHERE business_id = :bid", businessId);
        // payment_instruments: debt_payments zaten gitti.
        del(counts, "payment_instruments",
                "DELETE FROM payment_instruments WHERE business_id = :bid", businessId);
        del(counts, "cash_closings",
                "DELETE FROM cash_closings WHERE business_id = :bid", businessId);
        del(counts, "closed_period_summaries",
                "DELETE FROM closed_period_summaries WHERE business_id = :bid", businessId);
        del(counts, "profit_share_rules",
                "DELETE FROM profit_share_rules WHERE business_id = :bid", businessId);
        del(counts, "category_learning_rules",
                "DELETE FROM category_learning_rules WHERE business_id = :bid", businessId);

        // ─────────────────────────────────────────────────────────────────
        // TUR 4 — Referans/lookup tabloları. Yukarıdaki tüm FK referansları
        // (postings/transactions/pos/sub_cash/debt/instrument) temizlendi.
        // ─────────────────────────────────────────────────────────────────

        // bank_accounts: postings/transactions/sub_cash*/pos*/debt_payments/
        // instruments(cashed_account)/day_*_account FK'leri temizlenmiş olmalı.
        del(counts, "bank_accounts",
                "DELETE FROM bank_accounts WHERE business_id = :bid", businessId);
        // categories: postings/transactions/bank_import_lines/category_learning_rules temizlendi.
        del(counts, "categories",
                "DELETE FROM categories WHERE business_id = :bid", businessId);
        // counterparts: postings/debt*/pos*/instrument*/payment_instruments temizlendi.
        del(counts, "counterparts",
                "DELETE FROM counterparts WHERE business_id = :bid", businessId);
        // pos_devices: pos_deals/pos_settlement_batches/transactions(pos_device) temizlendi.
        del(counts, "pos_devices",
                "DELETE FROM pos_devices WHERE business_id = :bid", businessId);
        // phone_device: phone_device_bank temizlendi.
        del(counts, "phone_device",
                "DELETE FROM phone_device WHERE business_id = :bid", businessId);
        // inventory_items: fuel_logs/maintenance_logs temizlendi.
        del(counts, "inventory_items",
                "DELETE FROM inventory_items WHERE business_id = :bid", businessId);
        // day_closes: day_close_account_counts/day_close_edit_requests temizlendi.
        del(counts, "day_closes",
                "DELETE FROM day_closes WHERE business_id = :bid", businessId);
        // day_opens: day_open_account_openings temizlendi.
        del(counts, "day_opens",
                "DELETE FROM day_opens WHERE business_id = :bid", businessId);

        // ─────────────────────────────────────────────────────────────────
        // TUR 5 — İşletmeye bağlı bağımsız (yaprak) tablolar — sıra önemsiz.
        // ─────────────────────────────────────────────────────────────────
        del(counts, "ai_embeddings",
                "DELETE FROM ai_embeddings WHERE business_id = :bid", businessId);
        del(counts, "approval_requests",
                "DELETE FROM approval_requests WHERE business_id = :bid", businessId);
        del(counts, "telegram_approval_callbacks",
                "DELETE FROM telegram_approval_callbacks WHERE business_id = :bid", businessId);
        del(counts, "deleted_transaction_logs",
                "DELETE FROM deleted_transaction_logs WHERE business_id = :bid", businessId);
        del(counts, "ledger_wait_list",
                "DELETE FROM ledger_wait_list WHERE business_id = :bid", businessId);
        del(counts, "notifications",
                "DELETE FROM notifications WHERE business_id = :bid", businessId);
        del(counts, "ocr_scans",
                "DELETE FROM ocr_scans WHERE business_id = :bid", businessId);
        del(counts, "quick_actions",
                "DELETE FROM quick_actions WHERE business_id = :bid", businessId);
        del(counts, "reminders",
                "DELETE FROM reminders WHERE business_id = :bid", businessId);
        del(counts, "vehicles",
                "DELETE FROM vehicles WHERE business_id = :bid", businessId);
        del(counts, "employees",
                "DELETE FROM employees WHERE business_id = :bid", businessId);
        del(counts, "fixed_costs",
                "DELETE FROM fixed_costs WHERE business_id = :bid", businessId);
        del(counts, "business_notes",
                "DELETE FROM business_notes WHERE business_id = :bid", businessId);
        del(counts, "business_group_members",
                "DELETE FROM business_group_members WHERE business_id = :bid", businessId);

        // NOT: business_members / business_modules → Business entity'sinin
        //   @OneToMany cascade=ALL, orphanRemoval=true ilişkisiyle, çağıran
        //   BusinessService.delete(business) sırasında ORM tarafından silinir.
        // NOT: currency_rates / system_setting / notification_preferences →
        //   business_id YOK; global/per-user, KORUNUR.
        // NOT: audit_logs → forensik iz; KORUNUR (purge audit'i de buraya düşer).

        int total = counts.values().stream().mapToInt(Integer::intValue).sum();
        log.warn("[business-purge] businessId={} child-rows-deleted total={} byTable={}",
                businessId, total, counts);
        return counts;
    }

    /**
     * Tek bir native DELETE'i çalıştırır, silinen satır sayısını (>0 ise)
     * counts'a yazar. Bind: yalnız {@code :bid} → scope garantisi.
     */
    private void del(Map<String, Integer> counts, String table, String sql, UUID businessId) {
        int n = entityManager.createNativeQuery(sql)
                .setParameter("bid", businessId)
                .executeUpdate();
        if (n > 0) {
            counts.put(table, n);
        }
    }
}

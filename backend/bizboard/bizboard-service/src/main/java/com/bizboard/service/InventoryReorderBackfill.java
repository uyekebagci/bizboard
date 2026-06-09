package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * WP f4fe6d82: inventory_items.reorder_point / reorder_lead_days için idempotent
 * startup migration + backfill.
 *
 * <p>Prod {@code ddl-auto=update}. Bu runner: (1) kolonları {@code ADD COLUMN
 * IF NOT EXISTS} ile garantiler, (2) mevcut satırlarda {@code reorder_lead_days}
 * NULL ise 7 yapar. {@code reorder_point} bilinçli NULL kalır (otomatik
 * hesaplanır). İdempotent; hata fatal değil.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(24)
public class InventoryReorderBackfill implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS reorder_point numeric(15,2)");
            jdbc.execute("ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS reorder_lead_days integer");
            int n = jdbc.update("UPDATE inventory_items SET reorder_lead_days = 7 WHERE reorder_lead_days IS NULL");
            log.info("[inventory-reorder-backfill] reorder_lead_days={} satır dolduruldu.", n);
        } catch (Exception e) {
            log.warn("[inventory-reorder-backfill] schema/backfill atlandı: {}", e.getMessage());
        }
    }
}

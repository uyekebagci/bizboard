package com.bizboard.service;

import com.bizboard.common.entity.InventoryItem;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.repository.InventoryItemRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.inventory.ReorderCalculator;
import com.bizboard.service.notification.NotificationDispatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * WP f4fe6d82 + f1fa3cd5 (otomasyon): Envanter hatırlatma cron'u.
 *
 * <p>Her sabah 09:00 (Europe/Istanbul):</p>
 * <ul>
 *   <li><b>LOW_STOCK</b> — reorder eşiğinin altına düşen aktif sarf malzeme
 *       (akıllı eşik: {@link ReorderCalculator}). Şablon değişkenleri
 *       {item}/{quantity}/{threshold}.</li>
 *   <li><b>WARRANTY_EXPIRING</b> — garanti bitişi {@code WARRANTY_LEAD_DAYS} gün
 *       içinde olan aktif kalemler. Şablon {item}/{when}/{warrantyDate}.</li>
 * </ul>
 *
 * <p>DebtDueReminder/ChequeReminder pattern'i: admin alıcılar, dispatch (in-app +
 * opt-in Telegram), businessId iletilir. Opt-in tercih sistemi otomatik uygulanır
 * (in-app default açık, Telegram default kapalı).</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InventoryReminderScheduler {

    /** Garanti bitişine kaç gün kala uyarı atılsın. */
    private static final int WARRANTY_LEAD_DAYS = 30;

    private final InventoryItemRepository inventoryItemRepository;
    private final UserRepository userRepository;
    private final NotificationDispatchService dispatchService;
    private final ReorderCalculator reorderCalculator;

    /** Cron: {@code 0 0 9 * * *} her sabah 09:00 İstanbul. */
    @Scheduled(cron = "0 0 9 * * *", zone = "Europe/Istanbul")
    public void runInventoryReminders() {
        List<User> admins = userRepository.findByRoleIgnoreCase("admin");
        if (admins.isEmpty()) {
            log.info("[inventory-reminder] admin yok, bildirim atlandı");
            return;
        }
        List<UUID> recipients = admins.stream().map(User::getId).toList();

        int lowStock = dispatchLowStock(recipients);
        int warranty = dispatchWarrantyExpiring(recipients);

        log.info("[inventory-reminder] low_stock={} warranty_expiring={} alıcı={}",
                lowStock, warranty, recipients.size());
    }

    private int dispatchLowStock(List<UUID> recipients) {
        List<InventoryItem> consumables = inventoryItemRepository.findByActiveTrueAndCategory("CONSUMABLE");
        int sent = 0;
        for (InventoryItem item : consumables) {
            ReorderCalculator.Result r = reorderCalculator.compute(item);
            if (!r.needsReorder()) continue;
            dispatchService.dispatch(
                    NotificationEvent.LOW_STOCK,
                    recipients,
                    Map.of(
                            "item", item.getName() != null ? item.getName() : "Kalem",
                            "quantity", plain(item.getCurrentStock()) + unitSuffix(item),
                            "threshold", plain(r.effectiveReorderPoint())
                    ),
                    actionUrl(item),
                    item.getBusiness() != null ? item.getBusiness().getId() : null);
            sent++;
        }
        return sent;
    }

    private int dispatchWarrantyExpiring(List<UUID> recipients) {
        LocalDate today = LocalDate.now();
        int sent = 0;
        // Bugün → +WARRANTY_LEAD_DAYS aralığındaki her gün için tek tek tara
        // (tarih-aralığı sorgusu yerine basit + idempotent; küçük veri seti).
        for (int offset = 0; offset <= WARRANTY_LEAD_DAYS; offset++) {
            LocalDate target = today.plusDays(offset);
            List<InventoryItem> items = inventoryItemRepository.findByActiveTrueAndWarrantyExpiry(target);
            for (InventoryItem item : items) {
                dispatchService.dispatch(
                        NotificationEvent.WARRANTY_EXPIRING,
                        recipients,
                        Map.of(
                                "item", item.getName() != null ? item.getName() : "Kalem",
                                "when", offset == 0 ? "bugün" : offset + " gün içinde",
                                "warrantyDate", target.toString()
                        ),
                        actionUrl(item),
                        item.getBusiness() != null ? item.getBusiness().getId() : null);
                sent++;
            }
        }
        return sent;
    }

    private static String actionUrl(InventoryItem item) {
        UUID bid = item.getBusiness() != null ? item.getBusiness().getId() : null;
        return bid != null ? "/dashboard/inventory?business=" + bid : "/dashboard/inventory";
    }

    private static String unitSuffix(InventoryItem item) {
        return item.getUnit() != null && !item.getUnit().isBlank() ? " " + item.getUnit() : "";
    }

    private static String plain(BigDecimal v) {
        return v != null ? v.stripTrailingZeros().toPlainString() : "?";
    }
}

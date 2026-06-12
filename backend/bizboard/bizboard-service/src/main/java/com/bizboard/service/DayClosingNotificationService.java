package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.PeriodSummaryDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.DayClose;
import com.bizboard.common.entity.NotificationChannelBinding;
import com.bizboard.common.entity.SystemSetting;
import com.bizboard.common.enums.NotificationChannelType;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.repository.NotificationChannelBindingRepository;
import com.bizboard.repository.SystemSettingRepository;
import com.bizboard.repository.TelegramChatEventPreferenceRepository;
import com.bizboard.service.notification.telegram.TelegramApprovalCallbackService;
import com.bizboard.service.notification.telegram.TelegramClient;
import com.bizboard.service.notification.telegram.TelegramProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * GUN-1..4 (Gün Kapanışı → Telegram Grubu Özeti).
 *
 * <p>Bir işletmenin gün-kapanışı FINALIZE edildiğinde ({@link DayClose} CLOSED)
 * bağlı Telegram GRUBUNA "✅ Gün kapanışı yapıldı" + patron-okur, Excel-vari gün
 * özeti gönderir. Hedef: doğrulanmış GRUP-tipi Telegram binding'leri
 * ({@link NotificationChannelBinding} channel=TELEGRAM, chat_type=GROUP) — bireysel
 * DM'lere DEĞİL. <b>TENANT-SCOPE:</b> yalnızca binding'i kuran kullanıcının
 * gün-kapatan işletmeye erişebildiği gruplar mesaj alır
 * ({@link BusinessAccessGuard#canAccessBusiness} ile filtre; admin bu kontrolde
 * her zaman geçer). Erişimi olmayan kullanıcıların grupları ATLANIR — A
 * işletmesinin finansal özeti A'ya erişimi olmayanların gruplarına SIZMAZ. Bu,
 * {@link TelegramApprovalCallbackService#sendApprovalButtons} ile aynı business-erişim
 * kapısı desenidir (orada onay admin-aksiyonu olduğu için ek {@code isAdmin}
 * vardır; burada özet salt-okunur bilgi olduğundan business-erişim kapısı yeterlidir).
 * Gönderim mevcut {@link TelegramClient} ile yapılır. DayClose finalize akışına EK
 * (additive) bir adımdır — mevcut akışı bozmaz; tüm yollar best-effort/non-fatal.</p>
 *
 * <p>Per-business aktivasyon bayrağı bu modülün TEK opt-in kapısıdır: bayrak AÇIKSA
 * gruba gönderilir (per-user TELEGRAM tercihi GEREKMEZ — grup kasıtlı hedeftir,
 * kullanıcının "grup kurulunca aktive" akışıyla tutarlı). Bir grup yine de
 * {@link com.bizboard.common.entity.TelegramChatEventPreference} ile bu event'i
 * AÇIKÇA susturabilir (varsa ve disabled ise atlanır;
 * {@code TelegramNotificationChannel} ile aynı semantik).</p>
 *
 * <h3>Aktivasyon (DEFAULT KAPALI — spam-yok, non-breaking)</h3>
 * <p>İşletme-başına {@link SystemSetting} key-value bayrağı ({@link #enabledKey}),
 * Tier 3 {@link PeriodicSummaryService} ve day_open enforce ile birebir desen.
 * Satır yoksa veya değer {@code false} ise GÖNDERİM YOKTUR. Kullanıcı Telegram
 * grubunu kurup bağlayınca admin bu bayrağı açar. Hiçbir mevcut işletme, admin
 * açıkça açana kadar etkilenmez.</p>
 *
 * <h3>İçerik (patron-okur, Excel-vari)</h3>
 * <p>İşletme, tarih, SON KASA ({@code actualTotal}), OLMASI GEREKEN
 * ({@code computedClosing}), fark/variance (eksi=kaçak vurgulu), gün Net Kâr,
 * gün gelir/gider toplamı, POS özeti. Gün-kapanışı sayıları DOĞRUDAN
 * {@link DayClose} entity'sinden; gün net kâr/gelir/gider/POS mevcut
 * {@link SummaryService} (Σ tutarlı; TRANSFER/LOAN dışlanır, POS tam-tutar) ile —
 * YENİ finansal hesap yolu EKLENMEZ, yalnız okuma + raporlama.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DayClosingNotificationService {

    /** İşletme-başına "gün kapanışı → Telegram grubu" bildirimi açık mı? key prefix. */
    public static final String KEY_DAY_CLOSING_NOTIFY_ENABLED = "day_closing.notify_enabled";

    private final SystemSettingRepository settingRepository;
    private final SummaryService summaryService;
    private final NotificationChannelBindingRepository bindingRepository;
    private final TelegramChatEventPreferenceRepository chatPrefRepository;
    private final TelegramClient telegramClient;
    private final TelegramProperties telegramProperties;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;

    // ───────── konfigürasyon (admin) ─────────

    /** İşletme-başına aktivasyon key'i ({@code <prefix>:<businessId>}). */
    public static String enabledKey(UUID businessId) {
        return KEY_DAY_CLOSING_NOTIFY_ENABLED + ":" + businessId;
    }

    /** İşletmenin tercihi (satır yok → KAPALI; default spam-yok). */
    @Transactional(readOnly = true)
    public boolean isEnabled(UUID businessId) {
        return businessId != null && readBool(enabledKey(businessId));
    }

    /**
     * İşletme tercihini günceller (audit'li). Kullanıcı Telegram grubunu kurup
     * bağlayınca admin {@code enabled=true} ile aktive eder.
     */
    @Transactional
    public boolean setEnabled(UUID businessId, boolean enabled, UUID actorUserId) {
        if (businessId == null) {
            throw new IllegalArgumentException(
                    "business_id zorunlu (per-business gün-kapanışı bildirim tercihi)");
        }
        writeBool(enabledKey(businessId), enabled, actorUserId);
        auditLogService.recordEntityAction(
                AuditAction.DAY_CLOSING_NOTIFY_CONFIG_UPDATE, actorUserId, "admin",
                "SYSTEM_SETTING", null,
                "Gün-kapanışı Telegram grubu bildirimi " + (enabled ? "açıldı" : "kapatıldı")
                        + " (business=" + businessId + ")",
                Map.of(
                        "businessId", businessId.toString(),
                        "enabled", String.valueOf(enabled)));
        log.info("[day-closing-notify] tercih güncellendi business={} enabled={} by={}",
                businessId, enabled, actorUserId);
        return enabled;
    }

    // ───────── tetikleyici (DayClose finalize'ten çağrılır) ─────────

    /**
     * Gün-kapanışı FINALIZE edildikten sonra çağrılır (additive listener). İşletme
     * bayrağı AÇIKSA bağlı Telegram GRUP'larına "✅ Gün kapanışı yapıldı" + özet
     * gönderir. KAPALIysa hiçbir şey yapmaz (default; spam-yok).
     *
     * <p><b>Best-effort:</b> her şey try/catch ile izole — bildirim hatası gün
     * kapanışını BOZMAZ. Çağıran ({@code DayCloseService.closeDay}) bunu zaten
     * non-fatal try/catch ile sarmalar.</p>
     *
     * @return gruba en az bir başarılı gönderim olduysa true; aksi false.
     */
    @Transactional
    public boolean onDayClosed(DayClose dc) {
        if (dc == null || dc.getBusiness() == null) return false;
        Business business = dc.getBusiness();
        UUID businessId = business.getId();

        if (!isEnabled(businessId)) {
            // Default kapalı — sessizce geç (non-breaking, spam-yok).
            return false;
        }
        if (!telegramProperties.isConfigured()) {
            log.debug("[day-closing-notify] Telegram yapılandırılmamış — atlandı (business={}).",
                    businessId);
            return false;
        }

        List<NotificationChannelBinding> groups = resolveGroupBindings(businessId);
        if (groups.isEmpty()) {
            log.debug("[day-closing-notify] business={} bayrak açık ama erişimli kullanıcının bağlı Telegram grubu yok — atlandı.",
                    businessId);
            return false;
        }

        String html = buildHtml(business, dc);
        Set<String> sentChatIds = new LinkedHashSet<>();
        int sent = 0;
        for (NotificationChannelBinding b : groups) {
            String chatId = b.getExternalId();
            if (chatId == null || chatId.isBlank() || sentChatIds.contains(chatId)) continue;
            // Grup bu event'i AÇIKÇA susturmuş mu? (varsa+disabled → atla;
            // TelegramNotificationChannel ile aynı semantik.)
            if (isEventMutedForBinding(b.getId())) continue;

            TelegramClient.SendResult r = telegramClient.sendMessage(chatId, html);
            if (r == TelegramClient.SendResult.OK) {
                sentChatIds.add(chatId);
                sent++;
            } else {
                log.warn("[day-closing-notify] grup gönderim başarısız chat={} sonuç={} (business={})",
                        chatId, r, businessId);
            }
        }

        if (sent == 0) return false;

        // Teşhis izi (audit) — gönderim kasıtlı/izlenebilir olsun.
        auditLogService.recordEntityAction(
                AuditAction.DAY_CLOSING_NOTIFY_DISPATCHED, dc.getClosedBy(), "system",
                "DAY_CLOSE", dc.getId(),
                "Gün-kapanışı özeti Telegram grubuna gönderildi: " + business.getName()
                        + " — " + dc.getCloseDate(),
                Map.of(
                        "businessId", businessId.toString(),
                        "date", dc.getCloseDate() != null ? dc.getCloseDate().toString() : "—",
                        "groupsSent", String.valueOf(sent)));
        log.info("[day-closing-notify] özet gruba gönderildi business={} date={} grupSayısı={}",
                businessId, dc.getCloseDate(), sent);
        return true;
    }

    /**
     * Gün-kapatan {@code businessId} için hedef GRUP-tipi Telegram binding'leri.
     *
     * <p><b>TENANT-SCOPE (sızıntı kapısı):</b> doğrulanmış TÜM binding'ler arasından
     * yalnızca binding'i kuran kullanıcı ({@code binding.getUserId()}) bu işletmeye
     * erişebiliyorsa ({@link BusinessAccessGuard#canAccessBusiness}) binding alınır;
     * aksi halde ATLANIR (continue). Böylece A işletmesinin gün-kapanışı özeti, A'ya
     * erişimi OLMAYAN kullanıcıların bağladığı gruplara GİTMEZ. Admin
     * {@code canAccessBusiness} içinde her zaman geçtiğinden tüm işletmelerin özetini
     * almaya devam eder. Bu, {@link TelegramApprovalCallbackService#sendApprovalButtons}
     * fan-out'undaki business-erişim kapısıyla aynı desendir (orada onay bir
     * admin-aksiyonu olduğu için ek {@code isAdmin} de aranır; burada özet salt-okunur
     * bilgi olduğundan business-erişim kapısı yeterlidir).</p>
     *
     * <p>Tip filtresi: Telegram {@code getChat} ile tip doğrulanır (DM dışlanır);
     * zenginleştirme başarısızsa (best-effort) binding yine aday olarak alınır —
     * gruba bağlanmış chat_id'ye gönderim güvenli, DM'e gitmesi pratikte de zararsız
     * (yine de tip belli olanlarda DM elenir).</p>
     */
    private List<NotificationChannelBinding> resolveGroupBindings(UUID businessId) {
        if (businessId == null) return List.of();
        List<NotificationChannelBinding> verified =
                bindingRepository.findByChannelAndVerifiedTrue(NotificationChannelType.TELEGRAM);
        return verified.stream()
                .filter(b -> b.getExternalId() != null && !b.getExternalId().isBlank())
                // TENANT-SCOPE: yalnız bu işletmeye erişebilen kullanıcının binding'i.
                .filter(b -> accessGuard.canAccessBusiness(b.getUserId(), businessId))
                .filter(this::isGroupChat)
                .toList();
    }

    /** Chat GRUP mu? getChat tip "group/supergroup/channel" → true; DM/private → false. */
    private boolean isGroupChat(NotificationChannelBinding b) {
        TelegramClient.ChatInfo info = telegramClient.getChat(b.getExternalId()).orElse(null);
        if (info == null || info.type() == null || info.type().isBlank()) {
            // Tip belirlenemedi (getChat başarısız) — DM olduğunu kanıtlayamadık,
            // güvenli tarafta TUT (grup-kurulumu sonrası bağlanmış chat varsayımı).
            return true;
        }
        return switch (info.type()) {
            case "group", "supergroup", "channel" -> true;
            default -> false; // private/DM
        };
    }

    /** Grup bu event'i AÇIKÇA kapatmış mı? (TelegramChatEventPreference varsa+disabled). */
    private boolean isEventMutedForBinding(UUID bindingId) {
        return chatPrefRepository
                .findByBindingIdAndEvent(bindingId, NotificationEvent.DAY_CLOSING_COMPLETED)
                .map(p -> !p.isEnabled())
                .orElse(false); // kayıt yoksa: per-business bayrak zaten opt-in → gönder.
    }

    // ───────── içerik (patron-okur, Excel-vari gün özeti) ─────────

    /**
     * Gün-kapanışı özet gövdesi (çok-satırlı). Gün-kapanışı sayıları DOĞRUDAN
     * {@link DayClose}'tan; gün net kâr/gelir/gider/POS mevcut {@link SummaryService}
     * (tek-gün custom dönem) ile — Σ tutarlı, yeni hesap yolu yok.
     */
    @Transactional(readOnly = true)
    public String buildSummaryBody(Business business, DayClose dc) {
        String currency = business.getCurrency() != null ? business.getCurrency() : "TRY";

        // ── SAĞLAMA HESAP bloğu (DayClose entity — Excel konvansiyonu) ──
        BigDecimal actual = dc.getActualTotal();        // SON KASA
        BigDecimal computed = dc.getComputedClosing();  // OLMASI GEREKEN
        BigDecimal variance = dc.getVariance();         // = computed − actual (eksi=kaçak)

        StringBuilder sb = new StringBuilder();
        sb.append("SON KASA: ").append(fmt(actual)).append(' ').append(currency).append('\n');
        sb.append("OLMASI GEREKEN: ").append(fmt(computed)).append(' ').append(currency).append('\n');
        sb.append(varianceLine(variance, currency)).append('\n');

        // ── Gün finansal özeti (SummaryService — tek-gün, Σ tutarlı) ──
        try {
            PeriodSummaryDto s = summaryService.getBusinessSummaryForSystem(
                    business.getId(), "custom", dc.getCloseDate(), dc.getCloseDate());
            sb.append("Gün Net Kâr: ").append(fmt(s.getNetProfit())).append(' ').append(currency).append('\n');
            sb.append("Gün Gelir: ").append(fmt(s.getTotalIncome())).append(' ').append(currency).append('\n');
            sb.append("Gün Gider: ").append(fmt(s.getTotalExpense())).append(' ').append(currency).append('\n');
            sb.append("İşlem Sayısı: ").append(s.getTransactionCount());

            BigDecimal pos = posIncome(s.getBreakdownByCategory());
            if (pos.signum() != 0) {
                sb.append('\n').append("POS Geliri: ").append(fmt(pos)).append(' ').append(currency);
            }
        } catch (Exception e) {
            // İzole: finansal özet alınamazsa SAĞLAMA HESAP bloğu yine de gider.
            log.warn("[day-closing-notify] gün finansal özeti alınamadı business={} date={}: {}",
                    business.getId(), dc.getCloseDate(), e.getMessage());
        }

        return sb.toString().trim();
    }

    /** Fark/variance satırı — eksi (kaçak/eksik) açıkça vurgulanır. */
    private static String varianceLine(BigDecimal variance, String currency) {
        if (variance == null) {
            return "Fark: —";
        }
        // KARAR A1: variance = computed − actual. Pozitif = beklenenden AZ para → EKSİK/kaçak.
        int sign = variance.signum();
        String base = "Fark: " + fmt(variance) + " " + currency;
        if (sign > 0) {
            return "⚠ " + base + " (EKSİK — kaçak)";
        } else if (sign < 0) {
            return base + " (fazla)";
        }
        return base + " (tam — fark yok)";
    }

    /**
     * Gün breakdown'ından POS gelir kalemi (kategori adı "POS" içeren). Best-effort:
     * POS kategorisi yoksa BigDecimal.ZERO döner (satır gösterilmez). Σ'ya zaten
     * dahil — bu yalnız ayrı görünürlük (yeni hesap değil).
     */
    private static BigDecimal posIncome(Map<String, Map<String, BigDecimal>> breakdown) {
        if (breakdown == null) return BigDecimal.ZERO;
        BigDecimal total = BigDecimal.ZERO;
        for (Map.Entry<String, Map<String, BigDecimal>> e : breakdown.entrySet()) {
            String name = e.getKey();
            if (name == null || !name.toUpperCase(java.util.Locale.ROOT).contains("POS")) continue;
            BigDecimal inc = e.getValue() != null ? e.getValue().get("income") : null;
            if (inc != null) total = total.add(inc);
        }
        return total;
    }

    // ───────── Telegram HTML (kalın başlık + özet gövde) ─────────

    /**
     * Gruba gönderilecek HTML mesaj: kalın "✅ Gün kapanışı yapıldı" başlığı +
     * (template başlığıyla aynı) işletme/tarih + Excel-vari gün özeti gövdesi.
     * {@code TelegramNotificationChannel.buildHtml} ile aynı kaçış/biçim.
     */
    private String buildHtml(Business business, DayClose dc) {
        String name = business.getName() != null ? business.getName() : "";
        String date = dc.getCloseDate() != null ? dc.getCloseDate().toString() : "";
        String title = "✅ Gün kapanışı yapıldı: " + name + " (" + date + ")";
        String body = buildSummaryBody(business, dc);
        StringBuilder sb = new StringBuilder();
        sb.append("<b>").append(escape(title)).append("</b>");
        if (body != null && !body.isBlank()) {
            sb.append('\n').append(escape(body));
        }
        return sb.toString();
    }

    /** Telegram HTML parse_mode için minimum kaçış (kanal ile aynı). */
    private static String escape(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    // ───────── yardımcılar ─────────

    private boolean readBool(String key) {
        String raw = settingRepository.findById(key).map(SystemSetting::getValue).orElse(null);
        return "true".equalsIgnoreCase(raw != null ? raw.trim() : null);
    }

    private void writeBool(String key, boolean value, UUID actorUserId) {
        SystemSetting s = settingRepository.findById(key)
                .orElseGet(() -> SystemSetting.builder().key(key).build());
        s.setValue(Boolean.toString(value));
        s.setUpdatedBy(actorUserId);
        s.setUpdatedAt(java.time.LocalDateTime.now());
        settingRepository.save(s);
    }

    private static BigDecimal nz(BigDecimal v) { return v != null ? v : BigDecimal.ZERO; }

    private static String fmt(BigDecimal v) {
        return nz(v).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }
}

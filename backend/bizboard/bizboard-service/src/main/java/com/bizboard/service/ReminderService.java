package com.bizboard.service;

import com.bizboard.common.dto.ReminderDto;
import com.bizboard.common.dto.ReminderRequest;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Reminder;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.common.enums.ReminderRecurrence;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.ReminderRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.notification.NotificationDispatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Standalone hatırlatıcı CRUD + tetikleme (fire/advance) mantığı.
 *
 * <p><b>Tenant sınırı:</b> {@code owner} — her kullanıcı yalnız KENDİ
 * hatırlatıcılarını listeler/değiştirir/siler ({@code ownerId} her zaman
 * controller'da principal'dan gelir, body'de TAŞINMAZ). Cross-user erişim
 * imkânsız.</p>
 *
 * <p>{@code business_id} verilirse kullanıcının erişebildiği bir işletme olmalı
 * ({@link BusinessAccessGuard} doğrular).</p>
 *
 * <p>Tetikleme {@code ReminderScheduler} tarafından çağrılır; best-effort.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReminderService {

    private final ReminderRepository repository;
    private final UserRepository userRepository;
    private final BusinessRepository businessRepository;
    private final BusinessAccessGuard accessGuard;
    private final NotificationDispatchService dispatchService;

    // ───────── CRUD ─────────

    @Transactional(readOnly = true)
    public List<ReminderDto> listForUser(UUID ownerId) {
        return repository.findByOwnerIdOrderByRemindAtAsc(ownerId)
                .stream().map(ReminderService::toDto).toList();
    }

    @Transactional
    public ReminderDto create(UUID ownerId, ReminderRequest req) {
        validate(req);
        User owner = userRepository.findById(ownerId)
                .orElseThrow(() -> new IllegalArgumentException("Kullanici bulunamadi"));

        Reminder r = Reminder.builder()
                .owner(owner)
                .title(req.getTitle().trim())
                .message(req.getMessage())
                .remindAt(req.getRemindAt())
                .recurrence(req.getRecurrence() != null ? req.getRecurrence() : ReminderRecurrence.NONE)
                .enabled(req.getEnabled() == null || req.getEnabled())
                .build();
        r.setBusiness(resolveBusiness(ownerId, req.getBusinessId()));

        r = repository.save(r);
        log.info("[reminder] created id={} owner={} remindAt={} recurrence={}",
                r.getId(), ownerId, r.getRemindAt(), r.getRecurrence());
        return toDto(r);
    }

    @Transactional
    public ReminderDto update(UUID ownerId, UUID reminderId, ReminderRequest req) {
        validate(req);
        Reminder r = loadOwned(ownerId, reminderId);
        r.setTitle(req.getTitle().trim());
        r.setMessage(req.getMessage());
        r.setRemindAt(req.getRemindAt());
        r.setRecurrence(req.getRecurrence() != null ? req.getRecurrence() : ReminderRecurrence.NONE);
        if (req.getEnabled() != null) r.setEnabled(req.getEnabled());
        r.setBusiness(resolveBusiness(ownerId, req.getBusinessId()));
        r = repository.save(r);
        log.info("[reminder] updated id={} owner={}", reminderId, ownerId);
        return toDto(r);
    }

    @Transactional
    public void delete(UUID ownerId, UUID reminderId) {
        Reminder r = loadOwned(ownerId, reminderId);
        repository.delete(r);
        log.info("[reminder] deleted id={} owner={}", reminderId, ownerId);
    }

    // ───────── tetikleme (scheduler tarafından) ─────────

    /**
     * Vadesi gelen hatırlatıcıları tarar; her birini sahibine dispatch eder ve
     * tekrar kuralına göre öteler (NONE → enabled=false). Best-effort: bir
     * hatırlatıcı patlasa diğerlerini engellemez.
     *
     * @param now  referans an (genelde {@code LocalDateTime.now()})
     * @return fire edilen hatırlatıcı sayısı
     */
    @Transactional
    public int fireDue(LocalDateTime now) {
        List<Reminder> due = repository.findByEnabledTrueAndRemindAtLessThanEqual(now);
        int fired = 0;
        for (Reminder r : due) {
            try {
                fireOne(r, now);
                fired++;
            } catch (Exception e) {
                log.warn("[reminder] fire hatası (izole) id={}: {}", r.getId(), e.getMessage());
            }
        }
        if (fired > 0) {
            log.info("[reminder] tarama tamam — fire edilen={}", fired);
        }
        return fired;
    }

    private void fireOne(Reminder r, LocalDateTime now) {
        User owner = r.getOwner();
        if (owner == null) return;
        Business b = r.getBusiness();
        dispatchService.dispatchToUser(
                NotificationEvent.REMINDER_DUE,
                owner.getId(),
                Map.of(
                        "title", r.getTitle() != null ? r.getTitle() : "",
                        "message", r.getMessage() != null ? r.getMessage() : ""
                ),
                "/dashboard/hatirlaticilar",
                b != null ? b.getId() : null);

        r.setLastFiredAt(now);
        LocalDateTime next = nextOccurrence(r.getRemindAt(), r.getRecurrence());
        if (next == null) {
            // Tek-sefer (NONE) → tekrar etmesin diye pasifleştir.
            r.setEnabled(false);
        } else {
            // Tekrarlı → kaçırılan periyotları atla, bir sonraki gelecek vadeye getir.
            while (!next.isAfter(now)) {
                next = nextOccurrence(next, r.getRecurrence());
                if (next == null) break;
            }
            r.setRemindAt(next != null ? next : r.getRemindAt());
        }
        repository.save(r);
    }

    /** Bir sonraki tekrar zamanı; NONE → null (tek-sefer). */
    private static LocalDateTime nextOccurrence(LocalDateTime from, ReminderRecurrence rec) {
        if (from == null || rec == null) return null;
        return switch (rec) {
            case DAILY -> from.plusDays(1);
            case WEEKLY -> from.plusWeeks(1);
            case MONTHLY -> from.plusMonths(1);
            case NONE -> null;
        };
    }

    // ───────── yardımcılar ─────────

    private void validate(ReminderRequest req) {
        if (req == null) throw new IllegalArgumentException("İstek gövdesi zorunlu");
        if (req.getTitle() == null || req.getTitle().isBlank()) {
            throw new IllegalArgumentException("title zorunlu");
        }
        if (req.getRemindAt() == null) {
            throw new IllegalArgumentException("remind_at zorunlu");
        }
    }

    /** Owner-scope: kayıt yoksa veya sahibi farklıysa erişim yok (404-eşdeğer). */
    private Reminder loadOwned(UUID ownerId, UUID reminderId) {
        Reminder r = repository.findById(reminderId)
                .orElseThrow(() -> new IllegalArgumentException("Hatirlatici bulunamadi"));
        if (r.getOwner() == null || !r.getOwner().getId().equals(ownerId)) {
            throw new SecurityException("Access denied");
        }
        return r;
    }

    /** Opsiyonel business — verilirse erişim doğrula, yoksa null. */
    private Business resolveBusiness(UUID ownerId, UUID businessId) {
        if (businessId == null) return null;
        accessGuard.assertCanAccessBusiness(ownerId, businessId);
        return businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("İşletme bulunamadi"));
    }

    private static ReminderDto toDto(Reminder r) {
        Business b = r.getBusiness();
        return ReminderDto.builder()
                .id(r.getId())
                .title(r.getTitle())
                .message(r.getMessage())
                .remindAt(r.getRemindAt())
                .recurrence(r.getRecurrence())
                .businessId(b != null ? b.getId() : null)
                .businessName(b != null ? b.getName() : null)
                .enabled(r.isEnabled())
                .lastFiredAt(r.getLastFiredAt())
                .createdAt(r.getCreatedAt())
                .updatedAt(r.getUpdatedAt())
                .build();
    }
}

package com.bizboard.api.controller;

import com.bizboard.common.dto.*;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.SubCashEntityType;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.CounterpartRepository;
import com.bizboard.repository.PosDeviceRepository;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.BankAccountService;
import com.bizboard.service.DtoMapper;
import com.bizboard.service.SubCashAggregateService;
import com.bizboard.service.SubCashService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.*;

/**
 * v1.6.23.27 (UI Fix WP TODO 7cc85a10 + df12d130 + 85a7e425):
 * Sub-Cash assignment endpoint'leri.
 *
 * <p>Path-scoped: {@code /bank-accounts/{subCashId}/assignments} — sub-cash
 * tenant izolasyonu service tarafında.</p>
 */
@RestController
@RequestMapping("/bank-accounts/{subCashId}")
@RequiredArgsConstructor
public class SubCashController {

    private final SubCashService subCashService;
    private final SubCashAggregateService aggregateService;
    private final BankAccountRepository bankAccountRepository;
    private final CounterpartRepository counterpartRepository;
    private final PosDeviceRepository posDeviceRepository;
    /** WP Sub-Cash Retroactive Inclusion. */
    private final com.bizboard.service.SubCashInclusionService inclusionService;
    private final com.bizboard.repository.SubCashTxInclusionRepository inclusionRepository;

    /**
     * v1.7.x WP 8b961444 TODO 474b775c: Sub-cash periyot geliri (multi-attribution).
     *
     * <p>Default periyot: bu ay (1. günden ay sonuna). Query: from, to.</p>
     */
    @GetMapping("/income-summary")
    public ResponseEntity<?> incomeSummary(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID subCashId,
            @org.springframework.web.bind.annotation.RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
                    java.time.LocalDate from,
            @org.springframework.web.bind.annotation.RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
                    java.time.LocalDate to) {
        try {
            return ResponseEntity.ok(subCashService.incomeForSubCash(subCashId, from, to, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Sub-cash bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * v1.6.23.27 (TODO 85a7e425 + 31c441cb): Sub-cash detay aggregate.
     * Balance kartı + assignment listesi + tx listesi tek round-trip.
     */
    /**
     * v1.7.0.x (prod hotfix): @Transactional eklendi — prod open-in-view=false
     * olduğu için bankAccountRepository.findById sonrası subCash.getBusiness()
     * lazy proxy erişimi LazyInitializationException atıyordu (kullanıcıya 401
     * gibi görünüyordu, gerçekte 500).
     */
    @Transactional(readOnly = true)
    @GetMapping("/sub-cash-detail")
    public ResponseEntity<?> detail(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID subCashId,
            @RequestParam(name = "tx_limit", defaultValue = "20") int txLimit) {
        try {
            BankAccount subCash = bankAccountRepository.findById(subCashId)
                    .orElseThrow(() -> new IllegalArgumentException("Sub-cash bulunamadi"));
            UUID bizId = subCash.getBusiness() != null ? subCash.getBusiness().getId() : null;
            // Access check ve eligibility — service çağrılarında zaten yapılıyor
            List<SubCashAssignment> assigns = subCashService.listForSubCash(subCashId, principal.getId());
            BigDecimal agg = aggregateService.subCashAggregate(subCashId);
            BigDecimal main = bizId != null ? aggregateService.mainAggregate(bizId) : BigDecimal.ZERO;
            BigDecimal unassigned = bizId != null ? aggregateService.unassignedAggregate(bizId) : BigDecimal.ZERO;

            List<SubCashAssignmentDto> assignDtos = assigns.stream()
                    .map(this::toAssignmentDto).toList();
            // WP Sub-Cash Retroactive Inclusion: tx'leri inclusion table'dan
            // okuyup scope bilgisini DTO'ya damgalıyoruz.
            java.util.Map<UUID, String> scopeByTxId = new java.util.HashMap<>();
            for (com.bizboard.common.entity.SubCashTxInclusion inc :
                    inclusionRepository.findBySubCash_Id(subCashId)) {
                if (inc.getTransaction() != null && inc.getScope() != null) {
                    scopeByTxId.put(inc.getTransaction().getId(), inc.getScope().name());
                }
            }
            List<TransactionDto> txDtos = subCashService
                    .transactionsForSubCash(subCashId, principal.getId(), txLimit)
                    .stream()
                    .map(t -> {
                        TransactionDto d = DtoMapper.toTransactionDto(t);
                        d.setInclusionScope(scopeByTxId.get(t.getId()));
                        return d;
                    })
                    .toList();

            // Beta v1.1 fix: subCash.current_balance entity field'ı (recompute
                // edilmiş gerçek bakiye) — aggregate override geçirme!
                // aggregate ayrı field olarak dönüyor zaten.
            SubCashDetailDto detail = SubCashDetailDto.builder()
                    .subCash(BankAccountService.toDto(subCash, null))
                    .aggregate(agg)
                    .mainAggregate(main)
                    .unassignedAggregate(unassigned)
                    .assignments(assignDtos)
                    .transactions(txDtos)
                    .build();
            return ResponseEntity.ok(detail);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Sub-cash bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", e.getMessage()));
        }
    }

    /** v1.6.23.27 (TODO 7cc85a10): Entity assign. */
    @PostMapping("/assignments")
    public ResponseEntity<?> assign(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID subCashId,
            @Valid @RequestBody CreateSubCashAssignmentRequest req) {
        try {
            SubCashEntityType type;
            try {
                type = SubCashEntityType.valueOf(req.getEntityType().trim().toUpperCase(Locale.ENGLISH));
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "Gecersiz entity_type — COUNTERPART/POS_DEVICE/BANK_ACCOUNT olmali"));
            }
            SubCashAssignment a = subCashService.assign(subCashId, type, req.getEntityId(), principal.getId());
            return ResponseEntity.status(HttpStatus.CREATED).body(toAssignmentDto(a));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Sub-cash bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /** v1.6.23.27 (TODO df12d130): Unassign — entity verisi etkilenmez. */
    @DeleteMapping("/assignments/{assignmentId}")
    public ResponseEntity<?> unassign(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID subCashId,
            @PathVariable UUID assignmentId) {
        try {
            subCashService.unassign(assignmentId, principal.getId());
            return ResponseEntity.noContent().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Atama bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", e.getMessage()));
        }
    }

    // ─────────────────────── helper ───────────────────────

    private SubCashAssignmentDto toAssignmentDto(SubCashAssignment a) {
        String name = "?";
        BigDecimal contribution = BigDecimal.ZERO;
        switch (a.getEntityType()) {
            case BANK_ACCOUNT -> {
                BankAccount ba = bankAccountRepository.findById(a.getEntityId()).orElse(null);
                if (ba != null) {
                    name = ba.getName();
                    if (SubCashAggregateService.isEligibleBankAccount(ba)
                            && ba.getCurrentBalance() != null) {
                        contribution = ba.getCurrentBalance();
                    }
                }
            }
            case COUNTERPART -> {
                Counterpart c = counterpartRepository.findById(a.getEntityId()).orElse(null);
                if (c != null) name = c.getName();
            }
            case POS_DEVICE -> {
                PosDevice p = posDeviceRepository.findById(a.getEntityId()).orElse(null);
                if (p != null) name = p.getName();
            }
        }
        return SubCashAssignmentDto.builder()
                .id(a.getId())
                .subCashId(a.getSubCash() != null ? a.getSubCash().getId() : null)
                .subCashName(a.getSubCash() != null ? a.getSubCash().getName() : null)
                .businessId(a.getBusiness() != null ? a.getBusiness().getId() : null)
                .entityType(a.getEntityType().name())
                .entityId(a.getEntityId())
                .entityName(name)
                .entityBalanceContribution(contribution)
                .assignedAt(a.getAssignedAt())
                .assignedBy(a.getAssignedBy())
                .build();
    }

    // ─────────────────── WP Sub-Cash Retroactive Inclusion ───────────────────

    /**
     * Sub-cash'in assigned entity'lerine ait ama henüz inclusion'da OLMAYAN
     * tx'ler (eklenebilir tx'ler). Paginated + tarih filtreli.
     */
    /**
     * v1.7.0.x (prod hotfix): @Transactional eklendi — service'in döndürdüğü
     * Transaction entity'leri DtoMapper içinde lazy field'lara erişiyor
     * (business, category, posDevice). open-in-view=false prod'da kapalı
     * session → LazyInitializationException → response 401 görünüyordu.
     */
    @Transactional(readOnly = true)
    @GetMapping("/available-tx")
    public ResponseEntity<?> availableTx(
            @org.springframework.security.core.annotation.AuthenticationPrincipal
                    com.bizboard.security.UserPrincipal principal,
            @PathVariable UUID subCashId,
            @org.springframework.web.bind.annotation.RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
                    java.time.LocalDate from,
            @org.springframework.web.bind.annotation.RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
                    java.time.LocalDate to,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "0") int offset,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "50") int limit) {
        try {
            com.bizboard.service.SubCashInclusionService.AvailableTxPage page =
                    inclusionService.listAvailableTx(subCashId, from, to, offset, limit, principal.getId());
            List<TransactionDto> items = page.items.stream()
                    .map(DtoMapper::toTransactionDto).toList();
            return ResponseEntity.ok(Map.of(
                    "total", page.total,
                    "offset", offset,
                    "limit", limit,
                    "items", items));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Sub-cash bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * RETROACTIVE bulk insert — kullanıcı UI'sından seçtiği tx'leri ekler.
     * Body: {"transaction_ids": [uuid, uuid, ...]}
     */
    @PostMapping("/inclusions")
    public ResponseEntity<?> addInclusions(
            @org.springframework.security.core.annotation.AuthenticationPrincipal
                    com.bizboard.security.UserPrincipal principal,
            @PathVariable UUID subCashId,
            @RequestBody Map<String, Object> body) {
        try {
            Object raw = body == null ? null : body.get("transaction_ids");
            if (!(raw instanceof List<?> list) || list.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "transaction_ids zorunlu (boş olamaz)"));
            }
            List<UUID> txIds = new java.util.ArrayList<>();
            for (Object o : list) {
                if (o == null) continue;
                try { txIds.add(UUID.fromString(o.toString())); }
                catch (Exception ignored) { /* skip invalid */ }
            }
            com.bizboard.service.SubCashInclusionService.BulkInclusionResult r =
                    inclusionService.bulkInsertRetroactive(subCashId, txIds, principal.getId());
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(Map.of("added", r.added, "skipped", r.skipped, "failed", r.failed));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Sub-cash bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * Tek inclusion sil — manuel veya otomatik, fark etmez.
     */
    @DeleteMapping("/inclusions/{transactionId}")
    public ResponseEntity<?> removeInclusion(
            @org.springframework.security.core.annotation.AuthenticationPrincipal
                    com.bizboard.security.UserPrincipal principal,
            @PathVariable UUID subCashId,
            @PathVariable UUID transactionId) {
        try {
            boolean removed = inclusionService.removeInclusion(subCashId, transactionId, principal.getId());
            if (!removed) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "Inclusion bulunamadi"));
            }
            return ResponseEntity.noContent().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Sub-cash bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * Beta v1.1 hotfix recovery: SUB_CASH bakiyesini inclusion table'dan
     * sıfırdan recompute eder. Stale/şişmiş bakiyeleri temizler.
     */
    @PostMapping("/recompute-balance")
    public ResponseEntity<?> recomputeBalance(
            @org.springframework.security.core.annotation.AuthenticationPrincipal
                    com.bizboard.security.UserPrincipal principal,
            @PathVariable UUID subCashId) {
        try {
            java.math.BigDecimal newBalance = inclusionService.recomputeBalance(
                    subCashId, principal.getId());
            return ResponseEntity.ok(Map.of(
                    "sub_cash_id", subCashId.toString(),
                    "current_balance", newBalance));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Sub-cash bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * Beta v1.1 hotfix: SUB_CASH'in tüm tx'lerini paginate olarak listele.
     * Detail endpoint'i ilk N tx döner (default 20); bu endpoint "Daha
     * Fazla Yükle" akışı için. Lazy fetch — yüzlerce tx olduğunda kullanıcı
     * sayfayı açarken beklemez.
     *
     * <p>Response: {@code { items: TransactionDto[], total, has_more }}.</p>
     */
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    @GetMapping("/transactions-page")
    public ResponseEntity<?> transactionsPage(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID subCashId,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "20") int limit) {
        try {
            int effLimit = Math.max(1, Math.min(limit, 100));
            int effOffset = Math.max(0, offset);
            List<com.bizboard.common.entity.Transaction> all = subCashService
                    .transactionsForSubCash(subCashId, principal.getId(),
                            Integer.MAX_VALUE);
            int total = all.size();
            int end = Math.min(effOffset + effLimit, total);
            List<com.bizboard.common.entity.Transaction> page = effOffset >= total
                    ? List.of() : all.subList(effOffset, end);

            // scope bilgisi inclusion table'dan zenginleştir
            java.util.Map<UUID, String> scopeByTxId = new java.util.HashMap<>();
            for (com.bizboard.common.entity.SubCashTxInclusion inc :
                    inclusionRepository.findBySubCash_Id(subCashId)) {
                if (inc.getTransaction() != null && inc.getScope() != null) {
                    scopeByTxId.put(inc.getTransaction().getId(), inc.getScope().name());
                }
            }

            List<TransactionDto> items = page.stream().map(t -> {
                TransactionDto d = DtoMapper.toTransactionDto(t);
                d.setInclusionScope(scopeByTxId.get(t.getId()));
                return d;
            }).toList();

            return ResponseEntity.ok(Map.of(
                    "items", items,
                    "total", total,
                    "has_more", end < total));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Sub-cash bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", e.getMessage()));
        }
    }
}

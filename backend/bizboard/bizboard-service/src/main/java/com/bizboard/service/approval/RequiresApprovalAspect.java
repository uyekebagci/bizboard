package com.bizboard.service.approval;

import com.bizboard.common.dto.ApprovalDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Onay (Approval) modülü v1.1 — {@link RequiresApproval} işaretli servis
 * metotlarını saran aspect.
 *
 * <p>Akış:</p>
 * <ol>
 *   <li>Metot çağrılınca SpEL/parametre-adıyla {@code businessId} (+ varsa
 *       {@code amount}) çözülür.</li>
 *   <li>Onay gereksinimi bu işletmede AÇIK mı + (varsa) eşik aşıldı mı kontrol
 *       edilir. <b>İkisi de sağlanmazsa metot NORMAL yürür</b> (NON-BREAKING).</li>
 *   <li>Gerekiyorsa metot HİÇ çağrılmadan bir {@code approval_request} (PENDING)
 *       oluşturulur ve {@link ApprovalPendingException} fırlatılır. Gerçek işlem
 *       yetkili onaylayınca {@link ApprovalExecutor} ile yürütülür.</li>
 * </ol>
 *
 * <p><b>STRICT güvenli varsayılan:</b> businessId çözülemezse ya da herhangi bir
 * gating hatası olursa aspect onay TETİKLEMEZ — metot normal yürür (var olan
 * davranış korunur; onay opt-in bir kapıdır, kör blokaj değil).</p>
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class RequiresApprovalAspect {

    private static final ExpressionParser SPEL = new SpelExpressionParser();

    private final ApprovalFeatureFlagService flagService;
    private final ApprovalService approvalService;

    @Around("@annotation(requiresApproval)")
    public Object around(ProceedingJoinPoint pjp, RequiresApproval requiresApproval) throws Throwable {
        MethodSignature sig = (MethodSignature) pjp.getSignature();
        Method method = sig.getMethod();
        String[] paramNames = sig.getParameterNames();
        Object[] args = pjp.getArgs();

        UUID businessId = resolveBusinessId(requiresApproval, method, paramNames, args);
        if (businessId == null) {
            // Tenant bağlamı yok → güvenli tarafta kal, normal yürüt.
            return pjp.proceed();
        }

        // 1) İşletmede onay gereksinimi açık mı? (DEFAULT KAPALI → normal yürür)
        if (!flagService.isEnabled(businessId)) {
            return pjp.proceed();
        }

        // 2) Eşik kontrolü (varsa). Eşik altıysa normal yürür.
        BigDecimal amount = resolveAmount(requiresApproval, method, paramNames, args);
        if (!thresholdExceeded(requiresApproval.actionType(), businessId, amount)) {
            return pjp.proceed();
        }

        // 3) Onaya gönder — metot ÇAĞRILMAZ. Payload = tüm named parametreler.
        UUID actorUserId = resolveActorUserId(paramNames, args);
        Map<String, Object> payload = buildPayload(paramNames, args);
        String title = requiresApproval.title().isBlank()
                ? requiresApproval.actionType() : requiresApproval.title();

        ApprovalDto created = approvalService.create(
                businessId, requiresApproval.actionType(), title, payload,
                /* requireVerifyCode */ false, /* expiresInMinutes */ null, actorUserId);

        log.info("[approval-aspect] '{}' onaya gönderildi (business={} amount={}) → approvalId={}",
                requiresApproval.actionType(), businessId, amount, created.getId());
        throw new ApprovalPendingException(created.getId(), requiresApproval.actionType());
    }

    // ─────────────────────────── resolvers ─────────────────────────────────

    private UUID resolveBusinessId(RequiresApproval ann, Method method,
                                   String[] paramNames, Object[] args) {
        String spec = ann.businessIdParam();
        if (spec == null || spec.isBlank()) return null;
        Object value = spec.startsWith("#")
                ? evalSpel(spec, method, paramNames, args)
                : argByName(spec, paramNames, args);
        return toUuid(value);
    }

    private BigDecimal resolveAmount(RequiresApproval ann, Method method,
                                     String[] paramNames, Object[] args) {
        String expr = ann.amountExpression();
        if (expr == null || expr.isBlank()) return null;
        Object value = evalSpel(expr, method, paramNames, args);
        return toBigDecimal(value);
    }

    /** Konvansiyon: actorUserId parametresi onay talebinin "requested_by"'ı olur. */
    private UUID resolveActorUserId(String[] paramNames, Object[] args) {
        if (paramNames == null) return null;
        for (int i = 0; i < paramNames.length; i++) {
            String n = paramNames[i];
            if (n != null && (n.equals("actorUserId") || n.equals("userId")
                    || n.equals("actorId"))) {
                UUID u = toUuid(args[i]);
                if (u != null) return u;
            }
        }
        return null;
    }

    private boolean thresholdExceeded(String actionType, UUID businessId, BigDecimal amount) {
        if (amount == null) {
            // Eşik karşılaştırması yapamıyoruz → bayrak açıksa her çağrı onaya gider.
            return true;
        }
        // Şu an yalnız BALANCE_ADJUST için eşik tanımlı; diğer türlerde eşiksiz.
        if ("BALANCE_ADJUST".equals(actionType)) {
            BigDecimal threshold = flagService.balanceAdjustThreshold(businessId);
            if (threshold == null || threshold.signum() == 0) {
                return true; // eşik yok → bayrak açıksa her düzeltme onaya gider
            }
            return amount.abs().compareTo(threshold.abs()) >= 0;
        }
        return true;
    }

    /** Onay payload'ı = serileştirilebilir named parametreler (UUID/sayı/string/bool). */
    private Map<String, Object> buildPayload(String[] paramNames, Object[] args) {
        Map<String, Object> payload = new LinkedHashMap<>();
        if (paramNames == null) return payload;
        for (int i = 0; i < paramNames.length; i++) {
            Object v = args[i];
            if (v == null) continue;
            if (v instanceof UUID || v instanceof CharSequence
                    || v instanceof Number || v instanceof Boolean) {
                payload.put(paramNames[i], v.toString());
            } else if (v instanceof BigDecimal) {
                payload.put(paramNames[i], ((BigDecimal) v).toPlainString());
            }
            // Karmaşık tipler (entity/DTO) payload'a konmaz — executor gerekli
            // alanları primitive parametrelerden kurar. Bu, JSONB'de lazy-proxy
            // serileştirme tuzaklarını da önler.
        }
        return payload;
    }

    // ─────────────────────────── util ──────────────────────────────────────

    private Object evalSpel(String expr, Method method, String[] paramNames, Object[] args) {
        try {
            EvaluationContext ctx = new StandardEvaluationContext();
            if (paramNames != null) {
                for (int i = 0; i < paramNames.length; i++) {
                    ((StandardEvaluationContext) ctx).setVariable(paramNames[i], args[i]);
                }
            }
            return SPEL.parseExpression(expr).getValue(ctx);
        } catch (Exception e) {
            log.warn("[approval-aspect] SpEL '{}' çözülemedi: {}", expr, e.getMessage());
            return null;
        }
    }

    private Object argByName(String name, String[] paramNames, Object[] args) {
        if (paramNames == null) return null;
        for (int i = 0; i < paramNames.length; i++) {
            if (name.equals(paramNames[i])) return args[i];
        }
        return null;
    }

    private UUID toUuid(Object v) {
        if (v == null) return null;
        if (v instanceof UUID) return (UUID) v;
        try {
            return UUID.fromString(v.toString());
        } catch (Exception e) {
            return null;
        }
    }

    private BigDecimal toBigDecimal(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal) return (BigDecimal) v;
        if (v instanceof Number) return BigDecimal.valueOf(((Number) v).doubleValue());
        try {
            return new BigDecimal(v.toString());
        } catch (Exception e) {
            return null;
        }
    }
}

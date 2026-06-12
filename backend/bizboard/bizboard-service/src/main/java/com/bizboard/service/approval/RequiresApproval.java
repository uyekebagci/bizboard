package com.bizboard.service.approval;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Onay (Approval) modülü v1.1 — bir servis metodunu "onaya tabi" işaretler.
 *
 * <p>İşaretli metot çağrıldığında {@link RequiresApprovalAspect}, işlemi DOĞRUDAN
 * yürütmek yerine bir {@code approval_request} (PENDING) oluşturur ve metoda hiç
 * girmeden döner ({@link ApprovalPendingException} fırlatır → controller 202
 * "onaya gönderildi" döner). Yetkili onaylayınca kayıtlı {@link ApprovalExecutor}
 * işlemi yürütür.</p>
 *
 * <p><b>NON-BREAKING (STRICT):</b> aspect yalnızca özellik bayrağı AÇIK ve
 * (varsa) eşik aşıldığında devreye girer. Bayrak işletme-başına DEFAULT KAPALI
 * olduğundan, var olan akış — DGR dahil — hiçbir şekilde değişmez. Aspect'in
 * eşik/flag kararı için gerekli bağlamı (businessId, amount) parametre
 * adlarından okuyabilmesi adına SpEL ifadeleri verilebilir.</p>
 *
 * <pre>{@code
 * @RequiresApproval(
 *     actionType = "BALANCE_ADJUST",
 *     businessIdParam = "businessId",
 *     amountExpression = "#newBalance")
 * public BankAccountDto adjustBalance(UUID businessId, BigDecimal newBalance, ...) { ... }
 * }</pre>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RequiresApproval {

    /** Onay türü — {@link ApprovalExecutor#actionType()} ile eşleşmeli. */
    String actionType();

    /**
     * İnsan-okur kısa başlık (UI'da gösterilir). Boşsa actionType kullanılır.
     */
    String title() default "";

    /**
     * businessId'yi taşıyan metot parametresinin ADI ya da SpEL ifadesi.
     * {@code "#"} ile başlıyorsa SpEL; aksi hâlde parametre adı. Tenant-scope
     * için zorunlu (boşsa aspect güvenli tarafta kalır ve onay TETİKLEMEZ).
     */
    String businessIdParam() default "";

    /**
     * Eşik kontrolü için kullanılacak tutarın SpEL ifadesi (örn. {@code "#newBalance"}).
     * Boşsa eşik kontrolü yapılmaz — bayrak açıksa her çağrı onaya gider.
     */
    String amountExpression() default "";
}

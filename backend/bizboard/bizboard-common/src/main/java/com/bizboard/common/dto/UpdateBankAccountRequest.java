package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

/**
 * v1.6.23.4: BankAccount partial update payload.
 *
 * <p>Tüm alanlar opsiyonel — yalnız gönderilenler güncellenir.</p>
 *
 * <p><b>Immutable alanlar:</b> {@code type}, {@code currency}, {@code holderPerson}
 * — bunlar değiştirilemez (yeni hesap aç). {@code is_active} için ayrı
 * {@link BankAccountToggleRequest} ile {@code PATCH /{id}/active} kullan.</p>
 */
@Data
public class UpdateBankAccountRequest {

    private String name;

    @JsonProperty("bank_name")
    private String bankName;

    private String iban;

    private String notes;

    /**
     * v1.7.0.x: Banka hesabının ait olduğu kendi firmamız (MyCompany).
     * Servis tarafında her zaman uygulanır — null gönderilirse mevcut firma
     * bağlantısı temizlenir. Frontend her zaman bu alanı göndermeli.
     */
    @JsonProperty("owner_my_company_id")
    private java.util.UUID ownerMyCompanyId;
}

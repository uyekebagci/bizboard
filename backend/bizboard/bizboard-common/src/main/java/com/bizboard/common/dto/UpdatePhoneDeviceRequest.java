package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.UUID;

/**
 * v1.6.23.12: PATCH /phone-devices/{id} body. Tüm alanlar opsiyonel.
 *
 * <p>{@code brand_id}/{@code model_id}/{@code custom_model} kombinasyonu
 * yeni atanırsa validation (mutex, brand-model uyumu) yeniden çalışır.
 * {@code is_active=false} → soft delete.</p>
 */
@Data
public class UpdatePhoneDeviceRequest {

    @JsonProperty("phone_number")
    private String phoneNumber;

    /** Kullanıcı-atamalı etiket (sticker) numarası. */
    @JsonProperty("label_no")
    private Integer labelNo;

    /** Etiket numarasını temizle (null yap). */
    @JsonProperty("clear_label_no")
    private Boolean clearLabelNo;

    /** LEGACY — firma/kişi ataması (geriye-uyum). Yeni UI {@code assigned_employee_id} kullanır. */
    @JsonProperty("assigned_counterpart_id")
    private UUID assignedCounterpartId;

    /** "clear" mantığı için: explicit null'ı destekleyemediğimizden flag kullan. */
    @JsonProperty("clear_assigned_counterpart")
    private Boolean clearAssignedCounterpart;

    /** v1.7.x: telefonu kullanan personel. */
    @JsonProperty("assigned_employee_id")
    private UUID assignedEmployeeId;

    /** Personel atamasını temizle (havuza al). */
    @JsonProperty("clear_assigned_employee")
    private Boolean clearAssignedEmployee;

    @JsonProperty("brand_id")
    private UUID brandId;

    @JsonProperty("clear_brand")
    private Boolean clearBrand;

    @JsonProperty("model_id")
    private UUID modelId;

    @JsonProperty("clear_model")
    private Boolean clearModel;

    @JsonProperty("custom_model")
    private String customModel;

    private String notes;

    @JsonProperty("is_active")
    private Boolean active;
}

package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** v1.6.23.12: GET/POST /phone-devices yanıtı. */
@Data @Builder
public class PhoneDeviceDto {
    private UUID id;
    @JsonProperty("business_id") private UUID businessId;
    @JsonProperty("business_name") private String businessName;
    @JsonProperty("device_number") private int deviceNumber;
    /** Kullanıcı-atamalı etiket (sticker) numarası — UI "#" kolonu. Null olabilir. */
    @JsonProperty("label_no") private Integer labelNo;
    @JsonProperty("phone_number") private String phoneNumber;
    /** LEGACY firma/kişi ataması (geriye-uyum). */
    @JsonProperty("assigned_counterpart_id") private UUID assignedCounterpartId;
    @JsonProperty("assigned_counterpart_name") private String assignedCounterpartName;

    /** v1.7.x: atanan personel (null = havuz). */
    @JsonProperty("assigned_employee_id") private UUID assignedEmployeeId;
    @JsonProperty("assigned_employee_name") private String assignedEmployeeName;

    /** Master marka FK (null olabilir, custom_model kullanıldıysa). */
    @JsonProperty("brand_id") private UUID brandId;
    @JsonProperty("brand_name") private String brandName;

    /** Master model FK (null olabilir). */
    @JsonProperty("model_id") private UUID modelId;
    @JsonProperty("model_name") private String modelName;

    /** Master'da yoksa serbest metin. brand_id + model_id ile mutex. */
    @JsonProperty("custom_model") private String customModel;

    /**
     * Görüntü için birleştirilmiş etiket: "Marka Adı · Model Adı" veya
     * custom_model. UI tablo kolonunda direkt kullanılabilir.
     */
    @JsonProperty("display_label") private String displayLabel;

    private String notes;
    @JsonProperty("is_active") private boolean active;

    /** Yüklü bankacılık uygulamaları. */
    private List<PhoneDeviceBankDto> banks;

    @JsonProperty("created_at") private LocalDateTime createdAt;
    @JsonProperty("updated_at") private LocalDateTime updatedAt;
}

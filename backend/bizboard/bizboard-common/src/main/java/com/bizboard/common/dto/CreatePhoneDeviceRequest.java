package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.UUID;

/**
 * v1.6.23.12: POST /phone-devices body.
 *
 * <p>Validation servis tarafında:
 * <ul>
 *   <li>{@code business_id} zorunlu</li>
 *   <li>{@code brand_id}+{@code model_id} master listeden, ya da {@code custom_model}
 *       serbest metin. İkisi birden olamaz; üçü birden de olabilir (marka/model boş).</li>
 *   <li>{@code model_id} verilirse aynı {@code brand_id} altında olmalı</li>
 *   <li>{@code device_number} verilmezse bu işletmedeki max+1 atanır</li>
 * </ul>
 */
@Data
public class CreatePhoneDeviceRequest {

    @NotNull
    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("device_number")
    private Integer deviceNumber;

    /** Kullanıcı-atamalı etiket (sticker) numarası — nullable; verilmezse max+1 önerilir. */
    @JsonProperty("label_no")
    private Integer labelNo;

    @JsonProperty("phone_number")
    private String phoneNumber;

    /** LEGACY — firma/kişi ataması (geriye-uyum). Yeni UI {@code assigned_employee_id} kullanır. */
    @JsonProperty("assigned_counterpart_id")
    private UUID assignedCounterpartId;

    /** v1.7.x: telefonu kullanan personel (null = havuz). */
    @JsonProperty("assigned_employee_id")
    private UUID assignedEmployeeId;

    @JsonProperty("brand_id")
    private UUID brandId;

    @JsonProperty("model_id")
    private UUID modelId;

    @JsonProperty("custom_model")
    private String customModel;

    private String notes;

    /** Yüklü bankalar (opsiyonel, sonradan POST /phone-devices/{id}/banks ile de eklenebilir). */
    private List<PhoneDeviceBankDto> banks;
}

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

    @JsonProperty("phone_number")
    private String phoneNumber;

    @JsonProperty("assigned_counterpart_id")
    private UUID assignedCounterpartId;

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

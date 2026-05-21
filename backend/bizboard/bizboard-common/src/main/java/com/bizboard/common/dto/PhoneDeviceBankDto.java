package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

/** v1.6.23.12: telefondaki bankacılık uygulaması kaydı. */
@Data @Builder
public class PhoneDeviceBankDto {
    @JsonProperty("bank_name") private String bankName;
    @JsonProperty("app_username") private String appUsername;
    private String notes;
}

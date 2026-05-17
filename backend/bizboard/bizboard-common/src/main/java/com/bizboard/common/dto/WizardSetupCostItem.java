package com.bizboard.common.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Data;

import java.math.BigDecimal;

/** Wizard adım 1: bir kuruluş maliyeti kalemi (manuel serbest liste). */
@Data
public class WizardSetupCostItem {

    @NotBlank
    private String name;

    @PositiveOrZero
    private BigDecimal amount;
}

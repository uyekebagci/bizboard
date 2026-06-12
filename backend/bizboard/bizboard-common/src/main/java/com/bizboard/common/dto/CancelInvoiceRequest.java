package com.bizboard.common.dto;

import lombok.Data;

/** e-Fatura iptal isteği — opsiyonel gerekçe. */
@Data
public class CancelInvoiceRequest {
    private String reason;
}

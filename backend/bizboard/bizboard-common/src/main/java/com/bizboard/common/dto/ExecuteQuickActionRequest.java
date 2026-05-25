package com.bizboard.common.dto;

import lombok.Data;

import java.util.Map;

/**
 * WP e4dc5271: POST /quick-actions/{id}/execute body.
 *
 * <p>Override edilebilen alanlar: amount, transaction_date (=date),
 * description, ve daha sonra eklenebilecek diğerleri. overrides
 * template üzerine merge edilir (overrides öncelikli).</p>
 */
@Data
public class ExecuteQuickActionRequest {

    /** Template üzerine merge edilecek override'lar — boş gönderilebilir. */
    private Map<String, Object> overrides;
}

package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

/** e-Fatura çıktısı. Liste görünümünde {@code lines} null/boş gelebilir. */
@Data
@Builder
public class InvoiceDto {

    private UUID id;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    @JsonProperty("invoice_number")
    private String invoiceNumber;

    private String ettn;

    @JsonProperty("issue_date")
    private LocalDate issueDate;

    @JsonProperty("issue_time")
    private LocalTime issueTime;

    private String scenario;

    @JsonProperty("invoice_type")
    private String invoiceType;

    private String status;

    private String currency;

    // ── Satıcı ──
    @JsonProperty("supplier_tax_id")
    private String supplierTaxId;

    @JsonProperty("supplier_title")
    private String supplierTitle;

    @JsonProperty("supplier_tax_office")
    private String supplierTaxOffice;

    @JsonProperty("supplier_address")
    private String supplierAddress;

    @JsonProperty("supplier_city")
    private String supplierCity;

    @JsonProperty("supplier_district")
    private String supplierDistrict;

    @JsonProperty("supplier_country")
    private String supplierCountry;

    // ── Alıcı ──
    @JsonProperty("customer_tax_id")
    private String customerTaxId;

    @JsonProperty("customer_title")
    private String customerTitle;

    @JsonProperty("customer_tax_office")
    private String customerTaxOffice;

    @JsonProperty("customer_address")
    private String customerAddress;

    @JsonProperty("customer_city")
    private String customerCity;

    @JsonProperty("customer_district")
    private String customerDistrict;

    @JsonProperty("customer_country")
    private String customerCountry;

    // ── Toplamlar ──
    @JsonProperty("line_extension_amount")
    private BigDecimal lineExtensionAmount;

    @JsonProperty("tax_exclusive_amount")
    private BigDecimal taxExclusiveAmount;

    @JsonProperty("tax_inclusive_amount")
    private BigDecimal taxInclusiveAmount;

    @JsonProperty("total_tax_amount")
    private BigDecimal totalTaxAmount;

    @JsonProperty("allowance_total_amount")
    private BigDecimal allowanceTotalAmount;

    @JsonProperty("payable_amount")
    private BigDecimal payableAmount;

    private String notes;

    // ── Entegratör izleri ──
    @JsonProperty("integrator_key")
    private String integratorKey;

    @JsonProperty("integrator_ref")
    private String integratorRef;

    @JsonProperty("integrator_status")
    private String integratorStatus;

    @JsonProperty("integrator_error")
    private String integratorError;

    @JsonProperty("has_xml")
    private boolean hasXml;

    @JsonProperty("generated_at")
    private LocalDateTime generatedAt;

    @JsonProperty("sent_at")
    private LocalDateTime sentAt;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;

    private List<InvoiceLineDto> lines;
}

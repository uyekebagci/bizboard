package com.bizboard.service.efatura;

import com.bizboard.common.dto.InvoiceDto;
import com.bizboard.common.dto.InvoiceLineDto;
import com.bizboard.common.entity.Invoice;
import com.bizboard.common.entity.InvoiceLine;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * {@link Invoice} → {@link InvoiceDto} dönüştürücü (entity'yi API'den izole eder).
 *
 * <p>Liste görünümünde {@code withLines=false} ile satırlar atlanır (lazy
 * koleksiyonu tetiklememek + payload küçültmek için); detayda {@code true}.</p>
 */
@Component
public class InvoiceDtoMapper {

    public InvoiceDto toDto(Invoice inv, boolean withLines) {
        return InvoiceDto.builder()
                .id(inv.getId())
                .businessId(inv.getBusiness() != null ? inv.getBusiness().getId() : null)
                .businessName(inv.getBusiness() != null ? inv.getBusiness().getName() : null)
                .invoiceNumber(inv.getInvoiceNumber())
                .ettn(inv.getEttn())
                .issueDate(inv.getIssueDate())
                .issueTime(inv.getIssueTime())
                .scenario(inv.getScenario() != null ? inv.getScenario().name() : null)
                .invoiceType(inv.getInvoiceType() != null ? inv.getInvoiceType().name() : null)
                .status(inv.getStatus() != null ? inv.getStatus().name() : null)
                .currency(inv.getCurrency())
                .supplierTaxId(inv.getSupplierTaxId())
                .supplierTitle(inv.getSupplierTitle())
                .supplierTaxOffice(inv.getSupplierTaxOffice())
                .supplierAddress(inv.getSupplierAddress())
                .supplierCity(inv.getSupplierCity())
                .supplierDistrict(inv.getSupplierDistrict())
                .supplierCountry(inv.getSupplierCountry())
                .customerTaxId(inv.getCustomerTaxId())
                .customerTitle(inv.getCustomerTitle())
                .customerTaxOffice(inv.getCustomerTaxOffice())
                .customerAddress(inv.getCustomerAddress())
                .customerCity(inv.getCustomerCity())
                .customerDistrict(inv.getCustomerDistrict())
                .customerCountry(inv.getCustomerCountry())
                .lineExtensionAmount(inv.getLineExtensionAmount())
                .taxExclusiveAmount(inv.getTaxExclusiveAmount())
                .taxInclusiveAmount(inv.getTaxInclusiveAmount())
                .totalTaxAmount(inv.getTotalTaxAmount())
                .allowanceTotalAmount(inv.getAllowanceTotalAmount())
                .payableAmount(inv.getPayableAmount())
                .notes(inv.getNotes())
                .integratorKey(inv.getIntegratorKey())
                .integratorRef(inv.getIntegratorRef())
                .integratorStatus(inv.getIntegratorStatus())
                .integratorError(inv.getIntegratorError())
                .hasXml(inv.getUblXml() != null && !inv.getUblXml().isBlank())
                .generatedAt(inv.getGeneratedAt())
                .sentAt(inv.getSentAt())
                .createdAt(inv.getCreatedAt())
                .updatedAt(inv.getUpdatedAt())
                .lines(withLines ? lineDtos(inv) : null)
                .build();
    }

    private List<InvoiceLineDto> lineDtos(Invoice inv) {
        if (inv.getLines() == null) return null;
        List<InvoiceLineDto> out = new ArrayList<>(inv.getLines().size());
        for (InvoiceLine l : inv.getLines()) {
            out.add(InvoiceLineDto.builder()
                    .id(l.getId())
                    .lineNumber(l.getLineNumber())
                    .itemName(l.getItemName())
                    .description(l.getDescription())
                    .unitCode(l.getUnitCode())
                    .quantity(l.getQuantity())
                    .unitPrice(l.getUnitPrice())
                    .vatRate(l.getVatRate())
                    .discountAmount(l.getDiscountAmount())
                    .lineExtensionAmount(l.getLineExtensionAmount())
                    .vatAmount(l.getVatAmount())
                    .build());
        }
        return out;
    }
}

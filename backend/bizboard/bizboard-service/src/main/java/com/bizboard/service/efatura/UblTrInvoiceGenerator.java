package com.bizboard.service.efatura;

import com.bizboard.common.entity.Invoice;
import com.bizboard.common.entity.InvoiceLine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * UBL-TR 1.2 e-Fatura XML üreteci.
 *
 * <p>GİB UBL-TR 1.2 kılavuzuna göre şema-uyumlu bir fatura XML'i üretir.
 * Standart UBL 2.1 ad alanlarını + UBL-TR uzantılarını kullanır:</p>
 * <ul>
 *   <li>{@code Invoice} kök elemanı (urn:oasis:names:specification:ubl...:Invoice-2)</li>
 *   <li>{@code cbc:UBLVersionID}=2.1, {@code cbc:CustomizationID}=TR1.2</li>
 *   <li>{@code cbc:ProfileID} = senaryo (TEMELFATURA/TICARIFATURA)</li>
 *   <li>{@code cbc:ID} = fatura no, {@code cbc:UUID} = ETTN</li>
 *   <li>{@code cac:AccountingSupplierParty} / {@code cac:AccountingCustomerParty}
 *       — VKN/TCKN ({@code PartyIdentification schemeID})</li>
 *   <li>{@code cac:TaxTotal} + {@code cac:LegalMonetaryTotal}</li>
 *   <li>{@code cac:InvoiceLine}* satır kalemleri</li>
 * </ul>
 *
 * <p><b>İmza yok:</b> {@code cac:Signature} / {@code ext:UBLExtensions} XAdES
 * imzası bu üretici tarafından eklenmez (bkz. {@link EInvoiceSigner}); imza
 * entegratörde/imza modülünde uygulanır. İmzasız XML önizleme/indirme için
 * geçerli ve şema-uyumludur.</p>
 *
 * <p>Tüm metin alanları XML-escape edilir; tutarlar {@code BigDecimal} ile
 * nokta ayraçlı (Locale.ROOT) yazılır.</p>
 */
@Slf4j
@Component
public class UblTrInvoiceGenerator {

    private static final String UBL_VERSION = "2.1";
    private static final String CUSTOMIZATION_ID = "TR1.2";

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm:ss");

    /**
     * Faturadan geçerli UBL-TR 1.2 XML üretir.
     *
     * @param inv satır kalemleri yüklenmiş, toplamları hesaplanmış fatura
     * @return UBL-TR XML metni (UTF-8, imzasız)
     */
    public String generate(Invoice inv) {
        if (inv == null) {
            throw new IllegalArgumentException("Fatura null olamaz");
        }
        String currency = nz(inv.getCurrency(), "TRY");

        StringBuilder sb = new StringBuilder(4096);
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.append("<Invoice xmlns=\"urn:oasis:names:specification:ubl:schema:xsd:Invoice-2\"")
          .append(" xmlns:cac=\"urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2\"")
          .append(" xmlns:cbc=\"urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2\"")
          .append(" xmlns:ext=\"urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2\"")
          .append(" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">\n");

        // UBLExtensions — imza buraya gelir (placeholder, boş bırakılmaz; imza
        // modülü doldurur). Şema gereği boş extensions geçerlidir.
        sb.append("  <ext:UBLExtensions>\n")
          .append("    <ext:UBLExtension>\n")
          .append("      <ext:ExtensionContent/>\n")
          .append("    </ext:UBLExtension>\n")
          .append("  </ext:UBLExtensions>\n");

        // ── Başlık ──
        appendCbc(sb, 1, "UBLVersionID", UBL_VERSION);
        appendCbc(sb, 1, "CustomizationID", CUSTOMIZATION_ID);
        appendCbc(sb, 1, "ProfileID", inv.getScenario() != null
                ? inv.getScenario().profileId() : "TEMELFATURA");
        appendCbc(sb, 1, "ID", nz(inv.getInvoiceNumber(), ""));
        // ETTN (büyük harf, GİB beklentisi).
        appendCbc(sb, 1, "UUID", nz(inv.getEttn(), "").toUpperCase(Locale.ENGLISH));
        appendCbc(sb, 1, "IssueDate",
                (inv.getIssueDate() != null ? inv.getIssueDate() : LocalDate.now()).format(DATE_FMT));
        if (inv.getIssueTime() != null) {
            appendCbc(sb, 1, "IssueTime", inv.getIssueTime().format(TIME_FMT));
        }
        appendCbc(sb, 1, "InvoiceTypeCode", inv.getInvoiceType() != null
                ? inv.getInvoiceType().code() : "SATIS");
        if (inv.getNotes() != null && !inv.getNotes().isBlank()) {
            appendCbc(sb, 1, "Note", inv.getNotes());
        }
        appendCbc(sb, 1, "DocumentCurrencyCode", currency);
        appendCbc(sb, 1, "LineCountNumeric", String.valueOf(
                inv.getLines() != null ? inv.getLines().size() : 0));

        // ── Satıcı ──
        appendSupplier(sb, inv);
        // ── Alıcı ──
        appendCustomer(sb, inv);

        // ── Vergi toplamı ──
        appendTaxTotal(sb, inv, currency);
        // ── Parasal toplam ──
        appendLegalMonetaryTotal(sb, inv, currency);

        // ── Satır kalemleri ──
        if (inv.getLines() != null) {
            for (InvoiceLine line : inv.getLines()) {
                appendInvoiceLine(sb, line, currency);
            }
        }

        sb.append("</Invoice>\n");
        return sb.toString();
    }

    // ── Party blokları ────────────────────────────────────────────────────

    private void appendSupplier(StringBuilder sb, Invoice inv) {
        sb.append("  <cac:AccountingSupplierParty>\n");
        appendParty(sb, 2,
                inv.getSupplierTaxId(),
                inv.getSupplierTitle(),
                inv.getSupplierTaxOffice(),
                inv.getSupplierAddress(),
                inv.getSupplierDistrict(),
                inv.getSupplierCity(),
                inv.getSupplierCountry());
        sb.append("  </cac:AccountingSupplierParty>\n");
    }

    private void appendCustomer(StringBuilder sb, Invoice inv) {
        sb.append("  <cac:AccountingCustomerParty>\n");
        appendParty(sb, 2,
                inv.getCustomerTaxId(),
                inv.getCustomerTitle(),
                inv.getCustomerTaxOffice(),
                inv.getCustomerAddress(),
                inv.getCustomerDistrict(),
                inv.getCustomerCity(),
                inv.getCustomerCountry());
        sb.append("  </cac:AccountingCustomerParty>\n");
    }

    /**
     * UBL {@code cac:Party} bloğu. VKN (10 hane) → schemeID="VKN",
     * TCKN (11 hane) → schemeID="TCKN". Tüzel kişi için PartyName, gerçek kişi
     * için Person tercih edilir; basitlik için unvanı PartyName'e yazıyoruz
     * (GİB her iki durumda da kabul eder; gerçek kişi ek olarak Person ister —
     * v1.1'de unvan yeterli, entegratör seçilince genişletilir).
     */
    private void appendParty(StringBuilder sb, int indent,
                             String taxId, String title, String taxOffice,
                             String address, String district, String city,
                             String country) {
        String pad = "  ".repeat(indent);
        sb.append(pad).append("<cac:Party>\n");

        if (taxId != null && !taxId.isBlank()) {
            String scheme = taxId.trim().length() == 11 ? "TCKN" : "VKN";
            sb.append(pad).append("  <cac:PartyIdentification>\n");
            sb.append(pad).append("    <cbc:ID schemeID=\"").append(scheme).append("\">")
              .append(escape(taxId.trim())).append("</cbc:ID>\n");
            sb.append(pad).append("  </cac:PartyIdentification>\n");
        }

        sb.append(pad).append("  <cac:PartyName>\n");
        sb.append(pad).append("    <cbc:Name>").append(escape(nz(title, ""))).append("</cbc:Name>\n");
        sb.append(pad).append("  </cac:PartyName>\n");

        // PostalAddress — UBL-TR'de en azından ülke önerilir.
        sb.append(pad).append("  <cac:PostalAddress>\n");
        if (address != null && !address.isBlank()) {
            sb.append(pad).append("    <cbc:StreetName>").append(escape(address)).append("</cbc:StreetName>\n");
        }
        if (district != null && !district.isBlank()) {
            sb.append(pad).append("    <cbc:CitySubdivisionName>")
              .append(escape(district)).append("</cbc:CitySubdivisionName>\n");
        }
        if (city != null && !city.isBlank()) {
            sb.append(pad).append("    <cbc:CityName>").append(escape(city)).append("</cbc:CityName>\n");
        }
        sb.append(pad).append("    <cac:Country>\n");
        sb.append(pad).append("      <cbc:Name>").append(escape(nz(country, "Türkiye"))).append("</cbc:Name>\n");
        sb.append(pad).append("    </cac:Country>\n");
        sb.append(pad).append("  </cac:PostalAddress>\n");

        // Vergi dairesi → PartyTaxScheme.
        if (taxOffice != null && !taxOffice.isBlank()) {
            sb.append(pad).append("  <cac:PartyTaxScheme>\n");
            sb.append(pad).append("    <cac:TaxScheme>\n");
            sb.append(pad).append("      <cbc:Name>").append(escape(taxOffice)).append("</cbc:Name>\n");
            sb.append(pad).append("    </cac:TaxScheme>\n");
            sb.append(pad).append("  </cac:PartyTaxScheme>\n");
        }

        sb.append(pad).append("</cac:Party>\n");
    }

    // ── Toplam blokları ─────────────────────────────────────────────────────

    private void appendTaxTotal(StringBuilder sb, Invoice inv, String currency) {
        BigDecimal taxAmount = scale2(inv.getTotalTaxAmount());
        BigDecimal taxable = scale2(inv.getTaxExclusiveAmount());

        sb.append("  <cac:TaxTotal>\n");
        sb.append("    <cbc:TaxAmount currencyID=\"").append(currency).append("\">")
          .append(money(taxAmount)).append("</cbc:TaxAmount>\n");
        sb.append("    <cac:TaxSubtotal>\n");
        sb.append("      <cbc:TaxableAmount currencyID=\"").append(currency).append("\">")
          .append(money(taxable)).append("</cbc:TaxableAmount>\n");
        sb.append("      <cbc:TaxAmount currencyID=\"").append(currency).append("\">")
          .append(money(taxAmount)).append("</cbc:TaxAmount>\n");
        sb.append("      <cac:TaxCategory>\n");
        sb.append("        <cac:TaxScheme>\n");
        // 0015 = KDV (GİB vergi kodu).
        sb.append("          <cbc:Name>KDV</cbc:Name>\n");
        sb.append("          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>\n");
        sb.append("        </cac:TaxScheme>\n");
        sb.append("      </cac:TaxCategory>\n");
        sb.append("    </cac:TaxSubtotal>\n");
        sb.append("  </cac:TaxTotal>\n");
    }

    private void appendLegalMonetaryTotal(StringBuilder sb, Invoice inv, String currency) {
        sb.append("  <cac:LegalMonetaryTotal>\n");
        appendMoney(sb, 2, "LineExtensionAmount", inv.getLineExtensionAmount(), currency);
        appendMoney(sb, 2, "TaxExclusiveAmount", inv.getTaxExclusiveAmount(), currency);
        appendMoney(sb, 2, "TaxInclusiveAmount", inv.getTaxInclusiveAmount(), currency);
        appendMoney(sb, 2, "AllowanceTotalAmount", inv.getAllowanceTotalAmount(), currency);
        appendMoney(sb, 2, "PayableAmount", inv.getPayableAmount(), currency);
        sb.append("  </cac:LegalMonetaryTotal>\n");
    }

    private void appendInvoiceLine(StringBuilder sb, InvoiceLine line, String currency) {
        sb.append("  <cac:InvoiceLine>\n");
        appendCbc(sb, 2, "ID", String.valueOf(line.getLineNumber()));
        sb.append("    <cbc:InvoicedQuantity unitCode=\"").append(escape(nz(line.getUnitCode(), "C62")))
          .append("\">").append(qty(line.getQuantity())).append("</cbc:InvoicedQuantity>\n");
        appendMoney(sb, 2, "LineExtensionAmount", line.getLineExtensionAmount(), currency);

        // Satır iskonto (varsa) → AllowanceCharge (ChargeIndicator=false).
        BigDecimal discount = scale2(line.getDiscountAmount());
        if (discount != null && discount.signum() > 0) {
            sb.append("    <cac:AllowanceCharge>\n");
            sb.append("      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>\n");
            sb.append("      <cbc:Amount currencyID=\"").append(currency).append("\">")
              .append(money(discount)).append("</cbc:Amount>\n");
            sb.append("    </cac:AllowanceCharge>\n");
        }

        // Satır KDV.
        sb.append("    <cac:TaxTotal>\n");
        sb.append("      <cbc:TaxAmount currencyID=\"").append(currency).append("\">")
          .append(money(scale2(line.getVatAmount()))).append("</cbc:TaxAmount>\n");
        sb.append("      <cac:TaxSubtotal>\n");
        sb.append("        <cbc:TaxableAmount currencyID=\"").append(currency).append("\">")
          .append(money(scale2(line.getLineExtensionAmount()))).append("</cbc:TaxableAmount>\n");
        sb.append("        <cbc:TaxAmount currencyID=\"").append(currency).append("\">")
          .append(money(scale2(line.getVatAmount()))).append("</cbc:TaxAmount>\n");
        sb.append("        <cbc:Percent>").append(percent(line.getVatRate())).append("</cbc:Percent>\n");
        sb.append("        <cac:TaxCategory>\n");
        sb.append("          <cac:TaxScheme>\n");
        sb.append("            <cbc:Name>KDV</cbc:Name>\n");
        sb.append("            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>\n");
        sb.append("          </cac:TaxScheme>\n");
        sb.append("        </cac:TaxCategory>\n");
        sb.append("      </cac:TaxSubtotal>\n");
        sb.append("    </cac:TaxTotal>\n");

        // Mal/hizmet bilgisi.
        sb.append("    <cac:Item>\n");
        sb.append("      <cbc:Name>").append(escape(nz(line.getItemName(), ""))).append("</cbc:Name>\n");
        if (line.getDescription() != null && !line.getDescription().isBlank()) {
            sb.append("      <cbc:Description>").append(escape(line.getDescription()))
              .append("</cbc:Description>\n");
        }
        sb.append("    </cac:Item>\n");

        // Birim fiyat.
        sb.append("    <cac:Price>\n");
        sb.append("      <cbc:PriceAmount currencyID=\"").append(currency).append("\">")
          .append(price(line.getUnitPrice())).append("</cbc:PriceAmount>\n");
        sb.append("    </cac:Price>\n");

        sb.append("  </cac:InvoiceLine>\n");
    }

    // ── Yazım yardımcıları ──────────────────────────────────────────────────

    private void appendCbc(StringBuilder sb, int indent, String name, String value) {
        sb.append("  ".repeat(indent)).append("<cbc:").append(name).append('>')
          .append(escape(value)).append("</cbc:").append(name).append(">\n");
    }

    private void appendMoney(StringBuilder sb, int indent, String name,
                             BigDecimal value, String currency) {
        sb.append("  ".repeat(indent)).append("<cbc:").append(name)
          .append(" currencyID=\"").append(currency).append("\">")
          .append(money(scale2(value))).append("</cbc:").append(name).append(">\n");
    }

    private static BigDecimal scale2(BigDecimal v) {
        return (v != null ? v : BigDecimal.ZERO).setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private static String money(BigDecimal v) {
        return scale2(v).toPlainString();
    }

    private static String qty(BigDecimal v) {
        return (v != null ? v : BigDecimal.ONE)
                .setScale(4, java.math.RoundingMode.HALF_UP).toPlainString();
    }

    private static String price(BigDecimal v) {
        return (v != null ? v : BigDecimal.ZERO)
                .setScale(4, java.math.RoundingMode.HALF_UP).toPlainString();
    }

    private static String percent(BigDecimal v) {
        return (v != null ? v : BigDecimal.ZERO)
                .setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
    }

    private static String nz(String s, String dflt) {
        return (s == null || s.isBlank()) ? dflt : s;
    }

    /** XML metin escape — &lt; &gt; &amp; &quot; &apos;. */
    static String escape(String s) {
        if (s == null || s.isEmpty()) return "";
        StringBuilder out = new StringBuilder(s.length() + 16);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '&' -> out.append("&amp;");
                case '<' -> out.append("&lt;");
                case '>' -> out.append("&gt;");
                case '"' -> out.append("&quot;");
                case '\'' -> out.append("&apos;");
                default -> out.append(c);
            }
        }
        return out.toString();
    }
}

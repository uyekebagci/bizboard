package com.bizboard.common.enums;

/**
 * e-Fatura senaryosu (UBL-TR {@code ProfileID}).
 *
 * <ul>
 *   <li>{@link #TEMEL} — TEMELFATURA: alıcı kabul/ret yapamaz, kesilince geçerlidir.</li>
 *   <li>{@link #TICARI} — TICARIFATURA: alıcı 8 gün içinde kabul/ret/itiraz edebilir.</li>
 * </ul>
 *
 * <p>UBL-TR 1.2'de {@code cbc:ProfileID} alanına "TEMELFATURA" / "TICARIFATURA"
 * olarak yazılır (bkz. {@link #profileId()}).</p>
 */
public enum InvoiceScenario {

    TEMEL("TEMELFATURA"),
    TICARI("TICARIFATURA");

    private final String profileId;

    InvoiceScenario(String profileId) {
        this.profileId = profileId;
    }

    /** UBL-TR {@code cbc:ProfileID} değeri. */
    public String profileId() {
        return profileId;
    }
}

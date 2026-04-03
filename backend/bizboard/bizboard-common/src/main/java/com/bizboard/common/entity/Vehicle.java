package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "vehicles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Vehicle {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    // ─── Temel Bilgiler ───────────────────────────────────────

    /** Plaka */
    @Column(name = "plate_number", nullable = false)
    private String plateNumber;

    /** Marka (Mercedes, BMW, Ford vb.) */
    private String brand;

    /** Model (Sprinter, 3 Serisi, Transit vb.) */
    private String model;

    /** Model Yili */
    @Column(name = "model_year")
    private Integer modelYear;

    /** Renk */
    private String color;

    // ─── Teknik Bilgiler ──────────────────────────────────────

    /** Sasi No / VIN */
    @Column(name = "chassis_number")
    private String chassisNumber;

    /** Motor No */
    @Column(name = "engine_number")
    private String engineNumber;

    /** Motor Tipi: BENZIN, DIZEL, LPG, HYBRID, ELEKTRIK */
    @Column(name = "fuel_type")
    private String fuelType;

    /** Motor Hacmi (cc) */
    @Column(name = "engine_displacement")
    private Integer engineDisplacement;

    /** Motor Gucu (HP) */
    @Column(name = "horse_power")
    private Integer horsePower;

    /** Vites Tipi: MANUAL, OTOMATIK */
    @Column(name = "transmission")
    private String transmission;

    /** Arac Tipi: BINEK, HAFIF_TICARI, AGIR_TICARI, MOTOSIKLET, DIGER */
    @Column(name = "vehicle_type")
    private String vehicleType;

    // ─── Kilometre & Yakit ────────────────────────────────────

    /** Mevcut Kilometre */
    @Column(name = "current_km")
    @Builder.Default
    private Integer currentKm = 0;

    /** Ortalama Yakit Tuketimi (lt/100km) */
    @Column(name = "avg_fuel_consumption", precision = 5, scale = 2)
    private BigDecimal avgFuelConsumption;

    // ─── Ruhsat & Sigorta ─────────────────────────────────────

    /** Ruhsat Seri No */
    @Column(name = "registration_serial")
    private String registrationSerial;

    /** Ruhsat No */
    @Column(name = "registration_number")
    private String registrationNumber;

    /** Trafik Sigorta Bitis Tarihi */
    @Column(name = "traffic_insurance_expiry")
    private LocalDate trafficInsuranceExpiry;

    /** Kasko Bitis Tarihi */
    @Column(name = "kasko_expiry")
    private LocalDate kaskoExpiry;

    /** Muayene Bitis Tarihi */
    @Column(name = "inspection_expiry")
    private LocalDate inspectionExpiry;

    // ─── Sahiplik & Kiralama ──────────────────────────────────

    /** Sahiplik: OWNED (firma mali), RENTED (kiralik), LEASED (leasing) */
    @Column(name = "ownership_type", nullable = false)
    @Builder.Default
    private String ownershipType = "OWNED";

    /** Kiralik ise: kiralama bedeli */
    @Column(name = "rental_cost", precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal rentalCost = BigDecimal.ZERO;

    /** Kiralama periyodu: DAILY, WEEKLY, MONTHLY, YEARLY */
    @Column(name = "rental_period")
    private String rentalPeriod;

    /** Kiralama baslangic tarihi */
    @Column(name = "rental_start_date")
    private LocalDate rentalStartDate;

    /** Kiralama bitis tarihi */
    @Column(name = "rental_end_date")
    private LocalDate rentalEndDate;

    /** Kiralayan firma/kisi */
    @Column(name = "rental_company")
    private String rentalCompany;

    // ─── Diger ────────────────────────────────────────────────

    /** Arac aktif mi? */
    @Column(name = "is_active", nullable = false, columnDefinition = "boolean default true")
    @Builder.Default
    private boolean active = true;

    /** Not / Aciklama */
    @Column(columnDefinition = "text")
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}

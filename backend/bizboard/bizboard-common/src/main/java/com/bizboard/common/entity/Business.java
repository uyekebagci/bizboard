package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "businesses")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Business {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "business_type_id", nullable = false)
    private BusinessType businessType;

    @Column(nullable = false)
    private String name;

    /**
     * v1.5.7: serbest metin işletme tipi adı (yeni wizard autocomplete tarafı).
     * BusinessType FK katı master data sağlar; {@code businessTypeName} kullanıcının
     * yazdığı human-readable adı tutar — autocomplete listesinin kaynaklarından biri.
     * Eski kayıtlarda null kalır; yeni wizard'da zorunlu girilir.
     */
    @Column(name = "business_type_name", length = 120)
    private String businessTypeName;

    private String description;

    @Column(name = "logo_url")
    private String logoUrl;

    private String color;

    @Builder.Default
    private String currency = "TRY";

    @Column(name = "is_active")
    @Builder.Default
    private boolean active = true;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> metadata = Map.of();

    @OneToMany(mappedBy = "business", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<BusinessMember> members = new ArrayList<>();

    @OneToMany(mappedBy = "business", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<BusinessModule> modules = new ArrayList<>();

    /**
     * v1.5.0: işletme bağlı olduğu tüzel kişi ("Benim Firmam").
     * Nullable — eski kayıtlar bootstrap runner ile "Default Firmam"a bağlanır.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "my_company_id")
    private MyCompany myCompany;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}

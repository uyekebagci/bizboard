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

    @Column(nullable = false)
    private String name;

    /**
     * İşletme tipi adı (serbest metin). v1.6.2: master `BusinessType` tablosu
     * tamamen kaldırıldı, kullanıcılar wizard'da tipi serbest yazıyor.
     * Raporlamada/filtrelemede kullanılır.
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

    /**
     * Soft-delete / arşiv bayrağı. {@code true} → işletme arşivlenmiş:
     * varsayılan listelerden ve portföy/DGR agregalarından gizlenir, ancak
     * verisi korunur ve "Arşivden Çıkar" ile geri yüklenebilir.
     *
     * <p>{@code is_active} ile AYRI bir kavram: arşiv mantığı bu yeni alan
     * üzerinden yürür. ddl-auto:update güvenli — NOT NULL default false.</p>
     */
    @Column(name = "archived", nullable = false)
    @Builder.Default
    private boolean archived = false;

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

package com.bizboard.common.entity;

import com.bizboard.common.enums.BusinessCategory;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "business_types")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BusinessType {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, unique = true)
    private BusinessCategory category;

    @Column(nullable = false)
    private String label;

    @Column(nullable = false)
    private String icon;

    @Column(nullable = false)
    private String color;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "default_modules", columnDefinition = "jsonb")
    private List<String> defaultModules;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "default_categories", columnDefinition = "jsonb")
    private List<Map<String, String>> defaultCategories;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}

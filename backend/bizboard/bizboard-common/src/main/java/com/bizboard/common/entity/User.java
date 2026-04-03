package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(unique = true)
    private String email;

    @Column(nullable = false)
    private String password;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "avatar_url")
    private String avatarUrl;

    private String phone;

    @Column(name = "preferred_currency")
    @Builder.Default
    private String preferredCurrency = "TRY";

    @Column(name = "preferred_language")
    @Builder.Default
    private String preferredLanguage = "tr";

    @Column(name = "onboarding_completed")
    @Builder.Default
    private boolean onboardingCompleted = false;

    /** Kullanıcı rolü: "admin", "viewer", "accountant" vb. */
    @Column(nullable = false)
    @Builder.Default
    private String role = "viewer";

    @Column(name = "accessible_businesses", columnDefinition = "TEXT")
    private String accessibleBusinesses;

    @Column(name = "is_active")
    @Builder.Default
    private boolean active = true;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}

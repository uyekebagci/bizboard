package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "file_uploads")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FileUpload {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Orijinal dosya adi */
    @Column(name = "original_name", nullable = false)
    private String originalName;

    /** Diskte saklanan benzersiz dosya adi */
    @Column(name = "stored_name", nullable = false, unique = true)
    private String storedName;

    /** MIME tipi (image/png, application/pdf, vb.) */
    @Column(name = "content_type", nullable = false)
    private String contentType;

    /** Dosya boyutu (byte) */
    @Column(nullable = false)
    private long size;

    /** Dosya kategorisi: document, image, receipt, avatar, logo, debt_doc, note_attachment */
    @Column(nullable = false)
    private String category;

    /** Iliskili entity tipi: business, transaction, debt, note, user */
    @Column(name = "entity_type")
    private String entityType;

    /** Iliskili entity ID */
    @Column(name = "entity_id")
    private UUID entityId;

    /** Aciklama (opsiyonel) */
    private String description;

    /** Sadece admin gorebilir */
    @Column(name = "admin_only", nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private boolean adminOnly = false;

    /** Yukleyen kullanici */
    @Column(name = "uploaded_by", nullable = false)
    private UUID uploadedBy;

    /** Yukleyen kullanici adi (denormalize, audit icin) */
    @Column(name = "uploaded_by_name")
    private String uploadedByName;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}

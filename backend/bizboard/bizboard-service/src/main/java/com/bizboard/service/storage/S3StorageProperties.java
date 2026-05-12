package com.bizboard.service.storage;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Bound from {@code app.storage.s3.*} in application.yml.
 *
 * <p>Validation lives in {@link S3FileStorageAdapter#init()} rather than here — we only
 * want startup to fail if the S3 adapter is actually selected.</p>
 */
@Data
@ConfigurationProperties(prefix = "app.storage.s3")
public class S3StorageProperties {

    /** Bucket name (required when storage type=s3). */
    private String bucket;

    /** AWS region or "auto" for providers that ignore region (e.g. Cloudflare R2). */
    private String region = "auto";

    /**
     * Endpoint override for S3-compatible providers (Sevalla, R2, B2, MinIO, ...).
     * Leave blank to use AWS S3.
     */
    private String endpoint = "";

    private String accessKey = "";
    private String secretKey = "";

    /**
     * Path-style (bucket as URL path) — required for most non-AWS S3 providers.
     * AWS itself supports both; defaults to true for portability.
     */
    private boolean pathStyle = true;

    /** Optional object-key prefix (e.g. "prod/" or "test/") for env separation. */
    private String prefix = "";
}

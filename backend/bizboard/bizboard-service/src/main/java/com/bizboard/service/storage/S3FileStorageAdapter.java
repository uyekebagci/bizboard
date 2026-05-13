package com.bizboard.service.storage;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.*;

import java.io.InputStream;
import java.net.URI;

/**
 * S3-compatible {@link FileStorage} adapter using AWS SDK v2.
 *
 * <p>Works with AWS S3, Sevalla Object Storage, Cloudflare R2, Backblaze B2,
 * MinIO, Linode Object Storage, and any other provider implementing the S3 API.
 * Activated when {@code app.storage.type=s3}.</p>
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.storage.type", havingValue = "s3")
@EnableConfigurationProperties(S3StorageProperties.class)
public class S3FileStorageAdapter implements FileStorage {

    private final S3StorageProperties props;
    private S3Client client;

    public S3FileStorageAdapter(S3StorageProperties props) {
        this.props = props;
    }

    @PostConstruct
    public void init() {
        if (isBlank(props.getBucket())) {
            throw new StorageException("app.storage.type=s3 but app.storage.s3.bucket is blank");
        }
        if (isBlank(props.getAccessKey()) || isBlank(props.getSecretKey())) {
            throw new StorageException("S3 access-key / secret-key are required when storage type=s3");
        }

        var builder = S3Client.builder()
                .region(Region.of(isBlank(props.getRegion()) ? "auto" : props.getRegion()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(props.getAccessKey(), props.getSecretKey())))
                .serviceConfiguration(S3Configuration.builder()
                        .pathStyleAccessEnabled(props.isPathStyle())
                        .build())
                // urlConnectionHttpClient avoids pulling in Netty / Apache HC just for sync calls.
                .httpClient(UrlConnectionHttpClient.builder().build());

        if (!isBlank(props.getEndpoint())) {
            builder.endpointOverride(URI.create(props.getEndpoint()));
        }

        this.client = builder.build();

        log.info("[storage] backend=s3 bucket={} endpoint={} prefix='{}' pathStyle={}",
                props.getBucket(),
                isBlank(props.getEndpoint()) ? "<aws default>" : props.getEndpoint(),
                props.getPrefix(),
                props.isPathStyle());

        // Soft connectivity probe — Cloudflare R2 and some other S3-compatible providers
        // scope tokens at the bucket level and may reject head-bucket calls even when
        // standard object operations are allowed. We log a warning but do NOT fail the
        // application: the real test is the first upload/download.
        try {
            client.headBucket(HeadBucketRequest.builder().bucket(props.getBucket()).build());
            log.info("[storage] bucket head-check OK");
        } catch (Exception e) {
            log.warn("[storage] bucket head-check failed ({}). " +
                            "This is often harmless on Cloudflare R2 / scoped tokens — " +
                            "first object operation will surface real issues.",
                    e.getMessage());
        }
    }

    @PreDestroy
    public void close() {
        if (client != null) client.close();
    }

    @Override
    public StoredFile store(String key, InputStream data, long size, String contentType) {
        String fullKey = applyPrefix(key);
        try {
            client.putObject(
                    PutObjectRequest.builder()
                            .bucket(props.getBucket())
                            .key(fullKey)
                            .contentType(contentType)
                            .contentLength(size > 0 ? size : null)
                            .build(),
                    RequestBody.fromInputStream(data, size > 0 ? size : -1));
            return new StoredFile(key, size, contentType);
        } catch (S3Exception e) {
            throw new StorageException("S3 putObject failed for " + fullKey + ": " + e.awsErrorDetails().errorMessage(), e);
        } finally {
            try { data.close(); } catch (Exception ignored) {}
        }
    }

    @Override
    public InputStream openStream(String storageKey) {
        String fullKey = applyPrefix(storageKey);
        try {
            ResponseInputStream<GetObjectResponse> stream = client.getObject(
                    GetObjectRequest.builder()
                            .bucket(props.getBucket())
                            .key(fullKey)
                            .build());
            return stream;
        } catch (NoSuchKeyException e) {
            throw new StorageException("S3 object not found: " + fullKey);
        } catch (S3Exception e) {
            throw new StorageException("S3 getObject failed for " + fullKey + ": " + e.awsErrorDetails().errorMessage(), e);
        }
    }

    @Override
    public void delete(String storageKey) {
        String fullKey = applyPrefix(storageKey);
        try {
            client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(props.getBucket())
                    .key(fullKey)
                    .build());
        } catch (S3Exception e) {
            // Match LocalFileStorageAdapter semantics: deletion errors are warnings, not failures.
            log.warn("[storage] S3 deleteObject failed for {}: {}", fullKey, e.awsErrorDetails().errorMessage());
        }
    }

    @Override
    public boolean exists(String storageKey) {
        String fullKey = applyPrefix(storageKey);
        try {
            client.headObject(HeadObjectRequest.builder()
                    .bucket(props.getBucket())
                    .key(fullKey)
                    .build());
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        } catch (S3Exception e) {
            // 404 is sometimes thrown as a generic exception by non-AWS providers.
            if (e.statusCode() == 404) return false;
            throw new StorageException("S3 headObject failed for " + fullKey + ": " + e.awsErrorDetails().errorMessage(), e);
        }
    }

    @Override
    public String backendName() {
        return "s3:" + props.getBucket()
                + (isBlank(props.getPrefix()) ? "" : "/" + props.getPrefix());
    }

    private String applyPrefix(String key) {
        if (isBlank(props.getPrefix())) return key;
        String p = props.getPrefix();
        if (!p.endsWith("/")) p = p + "/";
        return p + key;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}

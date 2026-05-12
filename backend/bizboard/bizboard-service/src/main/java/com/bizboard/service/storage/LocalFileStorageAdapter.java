package com.bizboard.service.storage;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;

/**
 * Local-filesystem backed {@link FileStorage}. Default in {@code local} profile and
 * any environment that has not opted into S3.
 *
 * <p><strong>Production note:</strong> container filesystems are ephemeral; using
 * this adapter in production means files vanish at every redeploy. Use
 * {@link S3FileStorageAdapter} for production.</p>
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.storage.type", havingValue = "local", matchIfMissing = true)
public class LocalFileStorageAdapter implements FileStorage {

    private final Path rootLocation;

    public LocalFileStorageAdapter(@Value("${app.storage.local.root:./uploads}") String root) {
        this.rootLocation = Paths.get(root).toAbsolutePath().normalize();
    }

    @PostConstruct
    public void init() {
        try {
            Files.createDirectories(rootLocation);
            log.info("[storage] backend=local root={}", rootLocation);
        } catch (IOException e) {
            throw new StorageException("Could not initialise local storage root: " + rootLocation, e);
        }
    }

    @Override
    public StoredFile store(String key, InputStream data, long size, String contentType) {
        Path target = resolveSafe(key);
        try {
            Files.createDirectories(target.getParent());
            Files.copy(data, target, StandardCopyOption.REPLACE_EXISTING);
            long stored = Files.size(target);
            return new StoredFile(key, stored, contentType);
        } catch (IOException e) {
            throw new StorageException("Failed to write " + key + " to local disk", e);
        }
    }

    @Override
    public InputStream openStream(String storageKey) {
        Path target = resolveSafe(storageKey);
        try {
            if (!Files.exists(target)) {
                throw new StorageException("File not found in local storage: " + storageKey);
            }
            return Files.newInputStream(target);
        } catch (IOException e) {
            throw new StorageException("Failed to open local file: " + storageKey, e);
        }
    }

    @Override
    public void delete(String storageKey) {
        Path target = resolveSafe(storageKey);
        try {
            Files.deleteIfExists(target);
        } catch (IOException e) {
            log.warn("[storage] failed to delete local file {}: {}", storageKey, e.getMessage());
        }
    }

    @Override
    public boolean exists(String storageKey) {
        return Files.exists(resolveSafe(storageKey));
    }

    @Override
    public String backendName() {
        return "local:" + rootLocation;
    }

    /**
     * Resolve the storage key against root and ensure the result is still inside root.
     * Prevents path-traversal attacks (e.g. {@code ../etc/passwd}).
     */
    private Path resolveSafe(String storageKey) {
        Path resolved = rootLocation.resolve(storageKey).normalize();
        if (!resolved.startsWith(rootLocation)) {
            throw new StorageException("Path traversal blocked: " + storageKey);
        }
        return resolved;
    }
}

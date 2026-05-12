package com.bizboard.service.storage;

/**
 * Lightweight value object returned from {@link FileStorage#store}.
 *
 * @param storageKey  Provider-agnostic key (object path / relative file path) used
 *                    to retrieve or delete the file later. Persist this in the DB.
 * @param size        Size of the stored file in bytes.
 * @param contentType MIME type as supplied by the caller (we trust it for serving;
 *                    validation belongs to the caller).
 */
public record StoredFile(String storageKey, long size, String contentType) {}

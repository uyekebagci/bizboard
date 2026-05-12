package com.bizboard.service.storage;

import java.io.InputStream;

/**
 * Port for the persistent file storage layer (hexagonal architecture).
 *
 * <p>Two adapters implement this interface, selected by the
 * {@code app.storage.type} property:</p>
 *
 * <ul>
 *   <li>{@code local} – {@link LocalFileStorageAdapter}, writes to a directory on disk</li>
 *   <li>{@code s3}    – {@link S3FileStorageAdapter}, writes to an S3-compatible bucket</li>
 * </ul>
 *
 * <p>Storage keys are opaque strings — callers must not parse them. The convention
 * used by both adapters is {@code <category>/<uuid>.<ext>} (e.g. {@code receipt/abc.png}).</p>
 */
public interface FileStorage {

    /**
     * Persist a new file. The caller supplies a content-type and an already-chosen
     * logical key (e.g. {@code receipt/abc.png}). The adapter MAY prefix the key
     * internally (S3 prefix, local sub-root) but the returned {@link StoredFile#storageKey}
     * is always the value the caller must persist and pass back to {@link #openStream}.
     *
     * @param key         logical key suggested by the caller (no leading slash)
     * @param data        stream containing the file body; closed by the adapter
     * @param size        size in bytes (used as content-length hint where supported)
     * @param contentType MIME type (e.g. {@code image/png})
     * @return descriptor with the final {@code storageKey} to persist
     */
    StoredFile store(String key, InputStream data, long size, String contentType);

    /**
     * Open a streaming read of the stored file.
     *
     * @param storageKey  key returned previously from {@link #store}
     * @return an open InputStream — the caller is responsible for closing it
     * @throws StorageException if the object cannot be located or accessed
     */
    InputStream openStream(String storageKey);

    /**
     * Delete the stored file. Idempotent — deleting a missing key is not an error.
     *
     * @param storageKey  key returned previously from {@link #store}
     */
    void delete(String storageKey);

    /**
     * Whether the underlying object exists. Used by health checks; production code
     * should rely on {@link #openStream} catching {@link StorageException}.
     */
    boolean exists(String storageKey);

    /** Human-readable identifier of the active adapter (for logs / health). */
    String backendName();
}

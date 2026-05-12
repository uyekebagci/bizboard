package com.bizboard.service.storage;

/** Wraps low-level storage failures so callers don't need to catch IOException / SdkException. */
public class StorageException extends RuntimeException {
    public StorageException(String message) {
        super(message);
    }
    public StorageException(String message, Throwable cause) {
        super(message, cause);
    }
}

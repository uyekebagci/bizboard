"use client";

import { useRef, useState } from "react";
import { Upload, X, Loader2, FileText, Image as ImageIcon, Check } from "lucide-react";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { FileUploadInfo } from "@/types";

interface FileUploadButtonProps {
  /** Dosya kategorisi */
  category?: string;
  /** İlişkili entity tipi */
  entityType?: string;
  /** İlişkili entity ID */
  entityId?: string;
  /** Yükleme sonrası callback */
  onUploaded?: (file: FileUploadInfo) => void;
  /** Buton boyutu */
  size?: "sm" | "md";
  /** Buton metni */
  label?: string;
  /** Sadece resim mi? */
  imageOnly?: boolean;
  /** Ek CSS class */
  className?: string;
}

export function FileUploadButton({
  category = "document",
  entityType,
  entityId,
  onUploaded,
  size = "md",
  label = "Dosya Yükle",
  imageOnly = false,
  className = "",
}: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);

  const accept = imageOnly
    ? "image/jpeg,image/png,image/gif,image/webp"
    : "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv";

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      setError("Dosya boyutu 10 MB'yi asamaz");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);
      if (entityType) formData.append("entity_type", entityType);
      if (entityId) formData.append("entity_id", entityId);

      const result = await api.upload<FileUploadInfo>("/files", formData);
      setUploaded(true);
      toast.success("Dosya yüklendi");
      onUploaded?.(result);
      setTimeout(() => setUploaded(false), 2000);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Yükleme hatası"));
      toast.error(err);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const isSmall = size === "sm";

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`flex items-center gap-1.5 rounded-xl border border-dashed transition-all
          ${uploading ? "opacity-60 cursor-wait" : "hover:border-[rgb(var(--accent))]/50 hover:bg-[rgb(var(--accent))]/5 cursor-pointer"}
          ${uploaded ? "border-green-500/50 bg-green-500/10" : "border-[rgb(var(--v2-border))] v2-sunken"}
          ${isSmall ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"}
        `}
      >
        {uploading ? (
          <Loader2 size={isSmall ? 12 : 14} className="animate-spin text-accent-strong dark:text-accent" />
        ) : uploaded ? (
          <Check size={isSmall ? 12 : 14} className="text-green-700 dark:text-green-300" />
        ) : (
          <Upload size={isSmall ? 12 : 14} className="text-[rgb(var(--v2-muted))]" />
        )}
        <span className={`font-medium ${uploaded ? "text-green-700 dark:text-green-300" : "text-[rgb(var(--v2-muted))]"}`}>
          {uploading ? "Yükleniyor..." : uploaded ? "Yüklendi!" : label}
        </span>
      </button>
      {error && (
        <p className="text-red-500 text-xs mt-1">{error}</p>
      )}
    </div>
  );
}

// ── Dosya ile yükleme yapılan küçük inline bileşen ──
// Transaction form içinde kullanılacak
export function InlineFileUpload({
  category = "receipt",
  entityType,
  entityId,
  onUploaded,
  uploadedFiles = [],
  onRemoveFile,
}: {
  category?: string;
  entityType?: string;
  entityId?: string;
  onUploaded?: (file: FileUploadInfo) => void;
  uploadedFiles?: FileUploadInfo[];
  onRemoveFile?: (fileId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("Dosya boyutu 10 MB'yi asamaz");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);
      if (entityType) formData.append("entity_type", entityType);
      if (entityId) formData.append("entity_id", entityId);

      const result = await api.upload<FileUploadInfo>("/files", formData);
      toast.success("Dosya yüklendi");
      onUploaded?.(result);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Yükleme hatası"));
      toast.error(err);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function isImage(contentType: string) {
    return contentType.startsWith("image/");
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv"
        onChange={handleChange}
        className="hidden"
      />

      {/* Uploaded files list */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-1.5">
          {uploadedFiles.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 px-3 py-2 v2-sunken border border-[rgb(var(--v2-border))] rounded-xl"
            >
              {isImage(f.content_type) ? (
                <ImageIcon size={14} className="text-accent-strong dark:text-accent shrink-0" />
              ) : (
                <FileText size={14} className="text-[rgb(var(--v2-muted))] shrink-0" />
              )}
              <span className="text-xs text-[rgb(var(--v2-ink))] truncate flex-1">
                {f.original_name}
              </span>
              <span className="text-[10px] text-[rgb(var(--v2-muted))] shrink-0">
                {formatSize(f.size)}
              </span>
              {onRemoveFile && (
                <button
                  type="button"
                  onClick={() => onRemoveFile(f.id)}
                  className="p-0.5 hover:bg-red-500/15 rounded transition-colors shrink-0"
                >
                  <X size={12} className="text-red-500" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 px-3 py-2 w-full rounded-xl border border-dashed border-[rgb(var(--v2-border))]
                   v2-sunken hover:border-[rgb(var(--accent))]/50 hover:bg-[rgb(var(--accent))]/5 transition-all text-xs"
      >
        {uploading ? (
          <Loader2 size={13} className="animate-spin text-accent-strong dark:text-accent" />
        ) : (
          <Upload size={13} className="text-[rgb(var(--v2-muted))]" />
        )}
        <span className="text-[rgb(var(--v2-muted))] font-medium">
          {uploading ? "Yükleniyor..." : "Dosya / Fotoğraf Ekle"}
        </span>
      </button>

      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
}

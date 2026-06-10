"use client";

import { useEffect, useState } from "react";
import { X, Upload, Loader2, Check, FileText, EyeOff } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import {
  CATEGORY_LABELS,
  FILE_CATEGORIES,
  MAX_FILE_SIZE_BYTES,
  defaultCategoryFor,
  type FileCategory,
} from "@/lib/files";
import type { Business, FileUploadInfo } from "@/types";
import { DarkSelect } from "@/components/shared/DarkSelect";

interface FileUploadModalProps {
  preselectedBusinessId?: string;
  onClose: () => void;
  onUploaded?: (file: FileUploadInfo) => void;
}

export function FileUploadModal({
  preselectedBusinessId,
  onClose,
  onUploaded,
}: FileUploadModalProps) {
  const profile = useAppStore((s) => s.profile);
  const isAdmin = profile?.role === "admin";

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loadingBiz, setLoadingBiz] = useState(!preselectedBusinessId);
  const [businessId, setBusinessId] = useState(preselectedBusinessId || "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [category, setCategory] = useState<FileCategory>("document");
  const [description, setDescription] = useState("");
  const [adminOnly, setAdminOnly] = useState(isAdmin);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<FileUploadInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!preselectedBusinessId) {
      api
        .get<Business[]>("/businesses")
        .then((data) => setBusinesses(data || []))
        .catch(() => {})
        .finally(() => setLoadingBiz(false));
    }
  }, [preselectedBusinessId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    if (f.size > MAX_FILE_SIZE_BYTES) {
      setError("Dosya boyutu 10 MB'yi asamaz");
      return;
    }

    setFile(f);
    setError(null);
    setErrorRequestId(null);
    setUploaded(null);
    // Akilli default — MIME'a gore kategori sec. Kullanici degistirebilir.
    setCategory(defaultCategoryFor(f));

    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }

  async function handleUpload() {
    if (!file || !businessId) return;

    setUploading(true);
    setError(null);
    setErrorRequestId(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);
      formData.append("entity_type", "business");
      formData.append("entity_id", businessId);
      if (description.trim()) formData.append("description", description.trim());
      if (isAdmin) formData.append("admin_only", String(adminOnly));

      const result = await api.upload<FileUploadInfo>("/files", formData);
      setUploaded(result);
      toast.success("Dosya yüklendi");
      onUploaded?.(result);
    } catch (err: unknown) {
      toast.error(err);
      if (err instanceof ApiError) {
        // Backend code'a göre kullanıcı dostu mesaj.
        switch (err.code) {
          case "FILE-413":
            setError("Dosya boyutu izin verilen limiti asiyor (max 10 MB).");
            break;
          case "AUTH-403":
            setError("Bu isletmeye dosya yukleme yetkiniz yok.");
            break;
          case "RATE-429":
            setError(getErrorMessage(err));
            break;
          case "VAL-400":
            // Backend gercek hata mesajini gonderiyor (kategori, MIME, vb.)
            setError(getErrorMessage(err));
            break;
          default:
            setError(err.message || "Yukleme hatasi");
        }
        setErrorRequestId(err.requestId ?? null);
      } else if (err instanceof Error) {
        setError(err.message || "Yukleme hatasi");
      } else {
        setError("Yukleme hatasi");
      }
    } finally {
      setUploading(false);
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="glass-card shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="modal-header">
          <h3 className="text-lg font-semibold text-white">
            Dosya / Fotograf Yukle
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-600 transition-colors"
          >
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Business Selector */}
          {!preselectedBusinessId && (
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1.5">
                Isletme *
              </label>
              {loadingBiz ? (
                <div className="h-11 bg-surface-700 rounded-xl animate-pulse" />
              ) : (
                <DarkSelect
                  value={businessId}
                  onChange={setBusinessId}
                  placeholder="İşletme seçin"
                  searchable={businesses.length > 6}
                  options={businesses.map((b) => ({ value: b.id, label: b.name }))}
                />
              )}
            </div>
          )}

          {/* File Drop Zone */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1.5">
              Dosya *
            </label>
            <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed
                              border-surface-300 bg-surface-700 cursor-pointer hover:border-brand-400 hover:bg-brand-500/10 transition-all">
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
              {file ? (
                <>
                  {preview ? (
                    <img src={preview} alt="preview" className="w-20 h-20 object-cover rounded-lg" />
                  ) : (
                    <FileText size={32} className="text-surface-400" />
                  )}
                  <p className="text-sm text-surface-200 font-medium truncate max-w-full">{file.name}</p>
                  <p className="text-xs text-surface-400">{formatSize(file.size)}</p>
                </>
              ) : (
                <>
                  <Upload size={28} className="text-surface-400" />
                  <p className="text-sm text-surface-400">Dosya secmek icin tiklayin</p>
                  <p className="text-[10px] text-surface-400">JPEG, PNG, PDF, DOC, XLS — Maks 10MB</p>
                </>
              )}
            </label>
          </div>

          {/* Category */}
          <div>
            <label
              htmlFor="file-category"
              className="block text-sm font-medium text-surface-200 mb-1.5"
            >
              Kategori *
            </label>
            <DarkSelect
              id="file-category"
              value={category}
              onChange={(v) => setCategory(v as FileCategory)}
              options={FILE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1.5">
              Aciklama
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white
                         placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500
                         focus:border-transparent transition-all text-sm"
              placeholder="Dosya hakkinda kisa aciklama..."
            />
          </div>

          {/* Admin Only toggle */}
          {isAdmin && (
            <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <div className="flex items-center gap-2">
                <EyeOff size={14} className="text-amber-300" />
                <div>
                  <span className="text-sm text-surface-200">Gizli Belge</span>
                  <p className="text-[10px] text-surface-400">Sadece admin gorebilir</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdminOnly(!adminOnly)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  adminOnly ? "bg-amber-500" : "bg-surface-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-surface-800 rounded-full transition-transform shadow-sm ${
                    adminOnly ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Success */}
          {uploaded && (
            <div className="flex items-center gap-2 p-3 bg-green-500/15 border border-green-500/30 rounded-xl">
              <Check size={16} className="text-green-300" />
              <span className="text-sm text-green-300 font-medium">Dosya basariyla yuklendi!</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-red-300 text-sm">{error}</p>
              {errorRequestId && (
                <p className="mt-1 text-[10px] font-mono text-red-400/80">
                  Destek icin referans: {errorRequestId}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="btn-secondary flex-1 px-4 py-2.5 text-sm"
            >
              {uploaded ? "Kapat" : "Iptal"}
            </button>
            {!uploaded && (
              <button
                onClick={handleUpload}
                disabled={uploading || !file || !businessId}
                className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Yukleniyor...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Yukle
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import {
  Plus, FileText, Image as ImageIcon, Trash2, X, Download,
  EyeOff, Calendar, User, Building2, ExternalLink,
} from "lucide-react";
import { api, API_URL } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { FileUploadModal } from "@/components/shared/FileUploadModal";
import type { FileUploadInfo } from "@/types";

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function isImage(contentType: string) {
  return contentType?.startsWith("image/");
}

function getFileIcon(contentType: string) {
  if (isImage(contentType)) return ImageIcon;
  return FileText;
}

interface Props {
  businessId: string;
}

export function DocumentsModule({ businessId }: Props) {
  const profile = useAppStore((s) => s.profile);
  const isAdmin = profile?.role === "admin";

  const [files, setFiles] = useState<FileUploadInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileUploadInfo | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<FileUploadInfo | null>(null);

  useEffect(() => {
    fetchFiles();
  }, [businessId]);

  async function fetchFiles() {
    setLoading(true);
    try {
      const data = await api.get<FileUploadInfo[]>(
        `/files/by-entity?entity_type=business&entity_id=${businessId}`
      );
      setFiles(data || []);
    } catch (err) {
      logger.error("api", "Files fetch error", undefined, err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(fileId: string) {
    try {
      await api.delete(`/files/${fileId}`);
      setDeleteConfirm(null);
      setSelectedFile(null);
      fetchFiles();
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-16 bg-surface-600 rounded-xl" />
        <div className="h-16 bg-surface-600 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-surface-400">{files.length} belge</p>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-xs font-medium rounded-xl hover:bg-brand-700 transition-colors"
        >
          <Plus size={14} />
          Belge Yukle
        </button>
      </div>

      {/* File List */}
      {files.length === 0 ? (
        <div className="card p-8 text-center">
          <FileText size={32} className="text-surface-300 mx-auto mb-2" />
          <p className="text-surface-400 text-sm">Henuz belge yuklenmemis</p>
          <p className="text-surface-400 text-xs mt-1">
            Fatura, sozlesme veya fotograf yukleyebilirsiniz.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => {
            const Icon = getFileIcon(file.content_type);
            return (
              <div
                key={file.id}
                onClick={() => setSelectedFile(file)}
                className="flex items-center gap-3 p-3 rounded-xl border border-surface-600 bg-surface-800
                           hover:shadow-card-hover hover:border-surface-300 transition-all cursor-pointer group"
              >
                {/* Thumbnail / Icon */}
                {isImage(file.content_type) ? (
                  <div className="w-10 h-10 rounded-lg bg-surface-700 overflow-hidden shrink-0">
                    <img
                      src={`${API_URL}/files/${file.id}`}
                      alt={file.original_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-surface-700 flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-surface-400" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-white truncate">
                      {file.original_name}
                    </p>
                    {file.admin_only && isAdmin && (
                      <EyeOff size={11} className="text-amber-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-[10px] text-surface-400">
                    {formatSize(file.size)}
                    {file.description && ` • ${file.description}`}
                    {" • "}
                    {file.uploaded_by_name}
                  </p>
                </div>

                {/* Date */}
                <span className="text-[10px] text-surface-400 shrink-0 hidden sm:block">
                  {formatDate(file.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <FileUploadModal
          preselectedBusinessId={businessId}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            fetchFiles();
          }}
        />
      )}

      {/* File Detail Modal */}
      {selectedFile && (
        <FileDetailModal
          file={selectedFile}
          isAdmin={isAdmin}
          onClose={() => setSelectedFile(null)}
          onDelete={() => setDeleteConfirm(selectedFile)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface-800 rounded-2xl shadow-card-hover border border-surface-600 p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Belgeyi Sil</h3>
            <p className="text-surface-300 text-sm mb-1">Bu belgeyi silmek istediginize emin misiniz?</p>
            <p className="text-surface-400 text-xs mb-6 truncate">&quot;{deleteConfirm.original_name}&quot;</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-xl text-sm font-medium transition-colors"
              >
                Iptal
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── File Detail Modal ───────────────────────────────────────
function FileDetailModal({
  file,
  isAdmin,
  onClose,
  onDelete,
}: {
  file: FileUploadInfo;
  isAdmin: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  const fileUrl = `${API_URL}/files/${file.id}`;
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const authUrl = `${fileUrl}?token=${token}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-surface-800 rounded-2xl shadow-card-hover border border-surface-600 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-700">
          <h3 className="text-lg font-semibold text-white truncate pr-4">
            Belge Detayi
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-600 transition-colors shrink-0"
          >
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Preview */}
          {isImage(file.content_type) ? (
            <div className="rounded-xl overflow-hidden bg-surface-700 border border-surface-600">
              <img
                src={fileUrl}
                alt={file.original_name}
                className="w-full max-h-[400px] object-contain"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 bg-surface-700 rounded-xl border border-surface-600">
              <FileText size={48} className="text-surface-400 mb-2" />
              <p className="text-sm text-surface-300 font-medium">{file.original_name}</p>
              <p className="text-xs text-surface-400 mt-1">{file.content_type}</p>
            </div>
          )}

          {/* Details */}
          <div className="space-y-3">
            {/* Dosya adi */}
            <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
              <FileText size={16} className="text-surface-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-surface-400 uppercase tracking-wider">Dosya Adi</p>
                <p className="text-sm text-white font-medium break-all">{file.original_name}</p>
              </div>
            </div>

            {/* Aciklama */}
            {file.description && (
              <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                <FileText size={16} className="text-surface-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider">Aciklama</p>
                  <p className="text-sm text-white">{file.description}</p>
                </div>
              </div>
            )}

            {/* Boyut & Tip */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-surface-700 rounded-xl">
                <p className="text-[10px] text-surface-400 uppercase tracking-wider">Boyut</p>
                <p className="text-sm text-white font-medium">{formatSize(file.size)}</p>
              </div>
              <div className="p-3 bg-surface-700 rounded-xl">
                <p className="text-[10px] text-surface-400 uppercase tracking-wider">Tip</p>
                <p className="text-sm text-white font-medium">{file.category}</p>
              </div>
            </div>

            {/* Isletme */}
            {file.business_name && (
              <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                <Building2 size={16} className="text-surface-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider">Isletme</p>
                  <p className="text-sm text-white font-medium">{file.business_name}</p>
                </div>
              </div>
            )}

            {/* Yukleyen & Tarih */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                <User size={14} className="text-surface-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider">Yukleyen</p>
                  <p className="text-sm text-white">{file.uploaded_by_name || "-"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                <Calendar size={14} className="text-surface-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider">Tarih</p>
                  <p className="text-sm text-white">{formatDate(file.created_at)}</p>
                </div>
              </div>
            </div>

            {/* Gizli badge */}
            {file.admin_only && isAdmin && (
              <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <EyeOff size={14} className="text-amber-600" />
                <span className="text-sm text-amber-400 font-medium">Gizli Belge — Sadece admin gorebilir</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Download size={14} />
              Indir / Ac
            </a>
            <button
              onClick={onDelete}
              className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-medium transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

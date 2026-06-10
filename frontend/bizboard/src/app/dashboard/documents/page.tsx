"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, FileText, Image as ImageIcon, Download, Trash2,
  X, EyeOff, Calendar, User, Building2, Filter, Search, Plus,
} from "lucide-react";
import { api, API_URL } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { FileUploadModal } from "@/components/shared/FileUploadModal";
import { DarkSelect } from "@/components/shared/DarkSelect";
import type { Business, FileUploadInfo } from "@/types";

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

export default function DocumentsPage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const isAdmin = profile?.role === "admin";

  const [files, setFiles] = useState<FileUploadInfo[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBusiness, setFilterBusiness] = useState("");
  const [filterType, setFilterType] = useState<"all" | "image" | "document">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileUploadInfo | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<FileUploadInfo | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [filesData, bizData] = await Promise.all([
        api.get<FileUploadInfo[]>("/files/all"),
        api.get<Business[]>("/businesses"),
      ]);
      setFiles(filesData || []);
      setBusinesses(bizData || []);
    } catch (err) {
      logger.error("api", "Documents fetch error", undefined, err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(fileId: string) {
    try {
      await api.delete(`/files/${fileId}`);
      toast.info("Belge silindi");
      setDeleteConfirm(null);
      setSelectedFile(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err);
    }
  }

  // Filtreleme
  const filtered = files.filter((f) => {
    if (filterBusiness && f.entity_id !== filterBusiness) return false;
    if (filterType === "image" && !isImage(f.content_type)) return false;
    if (filterType === "document" && isImage(f.content_type)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const nameMatch = f.original_name.toLowerCase().includes(q);
      const descMatch = f.description?.toLowerCase().includes(q);
      const bizMatch = f.business_name?.toLowerCase().includes(q);
      if (!nameMatch && !descMatch && !bizMatch) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse max-w-2xl mx-auto">
        <div className="h-8 bg-surface-600 rounded-lg w-48" />
        <div className="h-10 bg-surface-600 rounded-xl" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-surface-600 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
          >
            <ArrowLeft size={20} className="text-surface-300" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Belgeler</h1>
            <p className="text-xs text-surface-400">{filtered.length} belge</p>
          </div>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-xs font-medium rounded-xl hover:bg-brand-700 transition-colors"
        >
          <Plus size={14} />
          Yukle
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Belge ara..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-sm text-white
                     placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {/* Business filter */}
        <div className="min-w-[180px]">
          <DarkSelect
            value={filterBusiness}
            onChange={setFilterBusiness}
            placeholder="Tüm İşletmeler"
            searchable={businesses.length > 6}
            options={businesses.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>

        {/* Type filter */}
        <div className="flex rounded-xl border border-surface-600 overflow-hidden">
          {([
            { key: "all", label: "Tumu" },
            { key: "image", label: "Fotograf" },
            { key: "document", label: "Dosya" },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilterType(opt.key)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                filterType === opt.key
                  ? "bg-brand-600 text-white"
                  : "bg-surface-800 text-surface-300 hover:bg-surface-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* File List */}
      {filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <FileText size={32} className="text-surface-300 mx-auto mb-2" />
          <p className="text-surface-400 text-sm">
            {files.length === 0 ? "Henuz belge yuklenmemis" : "Filtreye uygun belge bulunamadi"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((file) => (
            <div
              key={file.id}
              onClick={() => setSelectedFile(file)}
              className="flex items-center gap-3 p-3 rounded-xl border border-surface-600 bg-surface-800
                         hover:shadow-card-hover hover:border-surface-300 transition-all cursor-pointer group"
            >
              {/* Thumbnail */}
              {isImage(file.content_type) ? (
                <div className="w-11 h-11 rounded-lg bg-surface-700 overflow-hidden shrink-0">
                  <img
                    src={`${API_URL}/files/${file.id}`}
                    alt={file.original_name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-11 h-11 rounded-lg bg-surface-700 flex items-center justify-center shrink-0">
                  <FileText size={20} className="text-surface-400" />
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
                  {file.business_name && <span className="text-brand-500">{file.business_name}</span>}
                  {file.business_name && " • "}
                  {formatSize(file.size)}
                  {file.description && ` • ${file.description}`}
                </p>
              </div>

              {/* Meta */}
              <div className="text-right shrink-0 hidden sm:block">
                <p className="text-[10px] text-surface-400">{file.uploaded_by_name}</p>
                <p className="text-[10px] text-surface-300">{formatDate(file.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <FileUploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            fetchData();
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
          <div className="glass-card shadow-xl p-6 max-w-sm w-full">
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="glass-card shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="modal-header">
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
            <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
              <FileText size={16} className="text-surface-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-surface-400 uppercase tracking-wider">Dosya Adi</p>
                <p className="text-sm text-white font-medium break-all">{file.original_name}</p>
              </div>
            </div>

            {file.description && (
              <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                <FileText size={16} className="text-surface-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider">Aciklama</p>
                  <p className="text-sm text-white">{file.description}</p>
                </div>
              </div>
            )}

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

            {file.business_name && (
              <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                <Building2 size={16} className="text-surface-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider">Isletme</p>
                  <p className="text-sm text-white font-medium">{file.business_name}</p>
                </div>
              </div>
            )}

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

            {file.admin_only && isAdmin && (
              <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <EyeOff size={14} className="text-amber-300" />
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
              className="px-4 py-2.5 bg-red-500/15 hover:bg-red-500/20 text-red-300 rounded-xl text-sm font-medium transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

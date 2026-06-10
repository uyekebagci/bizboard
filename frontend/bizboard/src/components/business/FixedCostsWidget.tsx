"use client";

import { useState, useEffect } from "react";
import {
  Plus, X, Loader2, Home, Users, Zap, MoreHorizontal,
  Trash2, Edit3, AlertTriangle, TrendingDown,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { InlineFileUpload } from "@/components/shared/FileUploadButton";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { toast } from "@/lib/toast";
import type { FixedCost, FixedCostSummary, FileUploadInfo } from "@/types";

function formatMoney(n: number) {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Home; color: string; bg: string }> = {
  RENT: { label: "Kira", icon: Home, color: "text-orange-300", bg: "bg-orange-500/10" },
  PERSONNEL: { label: "Personel", icon: Users, color: "text-blue-300", bg: "bg-blue-500/15" },
  VEHICLE_RENTAL: { label: "Arac Kiralama", icon: TrendingDown, color: "text-teal-300", bg: "bg-teal-500/15" },
  UTILITY: { label: "Fatura", icon: Zap, color: "text-yellow-600", bg: "bg-yellow-50" },
  OTHER: { label: "Diger", icon: MoreHorizontal, color: "text-surface-300", bg: "bg-surface-700" },
};

interface Props {
  businessId: string;
  currency?: string;
}

export function FixedCostsWidget({ businessId, currency = "TRY" }: Props) {
  const { refreshKey, triggerRefresh } = useAppStore();
  const [summary, setSummary] = useState<FixedCostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<FixedCost | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FixedCost | null>(null);

  useEffect(() => {
    fetchData();
  }, [businessId, refreshKey]);

  async function fetchData() {
    setLoading(true);
    try {
      const data = await api.get<FixedCostSummary>(`/businesses/${businessId}/fixed-costs/summary`);
      setSummary(data || null);
    } catch (err) {
      logger.error("api", "Fixed cost fetch error", undefined, err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-4 animate-pulse">
        <div className="h-5 bg-surface-600 rounded w-32 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-surface-600 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <>
      <div className="glass-card overflow-hidden">
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <TrendingDown size={18} className="text-red-300" />
            <h3 className="text-sm font-bold text-white">Sabit Masraflar</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-red-300">
              {formatMoney(summary.total_monthly_cost)} {currency}/ay
            </span>
            <button
              onClick={() => setShowCreate(true)}
              className="p-1.5 rounded-lg bg-brand-500/15 text-brand-300 hover:bg-brand-500/25 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Summary Bar */}
        {summary.total_monthly_cost > 0 && (
          <div className="px-4 pt-3 pb-2">
            <div className="flex h-2 rounded-full overflow-hidden bg-surface-700">
              {summary.rent_cost > 0 && (
                <div
                  className="bg-orange-400 transition-all"
                  style={{ width: `${(summary.rent_cost / summary.total_monthly_cost) * 100}%` }}
                />
              )}
              {summary.personnel_cost > 0 && (
                <div
                  className="bg-blue-400 transition-all"
                  style={{ width: `${(summary.personnel_cost / summary.total_monthly_cost) * 100}%` }}
                />
              )}
              {summary.other_cost > 0 && (
                <div
                  className="bg-surface-300 transition-all"
                  style={{ width: `${(summary.other_cost / summary.total_monthly_cost) * 100}%` }}
                />
              )}
            </div>
            <div className="flex gap-3 mt-2 text-[10px]">
              {summary.rent_cost > 0 && (
                <span className="flex items-center gap-1 text-orange-300">
                  <span className="w-2 h-2 rounded-full bg-orange-400" /> Kira
                </span>
              )}
              {summary.personnel_cost > 0 && (
                <span className="flex items-center gap-1 text-blue-300">
                  <span className="w-2 h-2 rounded-full bg-blue-400" /> Personel
                </span>
              )}
              {summary.other_cost > 0 && (
                <span className="flex items-center gap-1 text-surface-400">
                  <span className="w-2 h-2 rounded-full bg-surface-300" /> Diger
                </span>
              )}
            </div>
          </div>
        )}

        {/* Fixed Cost List */}
        {summary.fixed_costs.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-surface-400 text-sm">Henuz sabit gider eklenmemis</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-700">
            {summary.fixed_costs.map((fc) => {
              const config = TYPE_CONFIG[fc.type] || TYPE_CONFIG.OTHER;
              const Icon = config.icon;

              return (
                <div
                  key={fc.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-700 transition-colors group"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${config.bg}`}>
                    <Icon size={14} className={config.color} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-white truncate">{fc.name}</p>
                      {fc.is_auto && (
                        <span className="px-1.5 py-0.5 bg-blue-500/15 text-blue-300 text-[9px] rounded-full font-medium">
                          Otomatik
                        </span>
                      )}
                      {fc.auto_generate && (
                        <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] rounded-full font-medium">
                          Aylik tx
                        </span>
                      )}
                    </div>
                    {fc.notes && (
                      <p className="text-xs text-surface-400 truncate">{fc.notes}</p>
                    )}
                    {fc.auto_generate && fc.last_auto_run && (
                      <p className="text-[10px] text-emerald-400/80 mt-0.5">
                        Son uretim: {new Date(fc.last_auto_run).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    )}
                  </div>

                  <span className="text-sm font-semibold text-red-300 flex-shrink-0">
                    {formatMoney(fc.amount)} {currency}
                  </span>

                  {!fc.is_auto && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                      <button
                        onClick={() => setEditTarget(fc)}
                        className="p-1 rounded-lg text-surface-400 hover:text-brand-300 hover:bg-brand-500/15"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(fc)}
                        className="p-1 rounded-lg text-surface-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateFixedCostModal
          businessId={businessId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchData(); triggerRefresh(); }}
        />
      )}

      {/* Edit Modal */}
      {editTarget && (
        <CreateFixedCostModal
          businessId={businessId}
          fixedCost={editTarget}
          onClose={() => setEditTarget(null)}
          onCreated={() => { setEditTarget(null); fetchData(); triggerRefresh(); }}
        />
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <DeleteFixedCostModal
          fixedCost={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); fetchData(); triggerRefresh(); }}
        />
      )}
    </>
  );
}

// ── Create / Edit Fixed Cost Modal ─────────────────────────
function CreateFixedCostModal({
  businessId,
  fixedCost,
  onClose,
  onCreated,
}: {
  businessId: string;
  fixedCost?: FixedCost;
  onClose: () => void;
  onCreated: () => void;
}) {
  const isEdit = !!fixedCost;
  const [name, setName] = useState(fixedCost?.name || "");
  const [type, setType] = useState(fixedCost?.type || "OTHER");
  const [amount, setAmount] = useState(fixedCost?.amount?.toString() || "");
  const [frequency, setFrequency] = useState(fixedCost?.frequency || "MONTHLY");
  const [notes, setNotes] = useState(fixedCost?.notes || "");
  /** v1.5.9: "her ay otomatik tx üret" tercihi */
  const [autoGenerate, setAutoGenerate] = useState<boolean>(!!fixedCost?.auto_generate);
  const [uploadedFiles, setUploadedFiles] = useState<FileUploadInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !amount) return;

    setSaving(true);
    setError(null);
    setFieldErrors({});

    const body = {
      name: name.trim(),
      type,
      amount: parseMoneyInput(amount),
      frequency,
      notes: notes.trim() || null,
      auto_generate: autoGenerate,
    };

    try {
      let resultId: string | undefined;

      if (isEdit) {
        const result = await api.put<FixedCost>(`/fixed-costs/${fixedCost.id}`, body);
        resultId = result?.id || fixedCost.id;
      } else {
        const result = await api.post<FixedCost>(`/businesses/${businessId}/fixed-costs`, body);
        resultId = result?.id;
      }

      // Yüklenen dosyaları fixed_cost entity'sine bağla
      if (resultId && uploadedFiles.length > 0) {
        await Promise.all(
          uploadedFiles.map((f) =>
            api.patch(`/files/${f.id}/link`, {
              entity_type: "fixed_cost",
              entity_id: resultId,
            })
          )
        );
      }

      toast.success(isEdit ? "Sabit gider güncellendi" : "Sabit gider eklendi");
      onCreated();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === "CONF-409") {
          // Otomatik yonetilen FixedCost (personel/arac) manuel duzenlenemez.
          setError(
            "Bu kayit personel veya arac modulunden otomatik yonetiliyor. " +
              "Degisiklik icin ilgili modulu kullanin."
          );
        } else if (err.code === "VAL-400" && err.fieldErrors) {
          setFieldErrors(err.fieldErrors);
          setError("Lutfen formdaki hatalari duzeltin.");
        } else {
          setError(err.message || "Bir hata olustu");
        }
      } else if (err instanceof Error) {
        setError(err.message || "Bir hata olustu");
      } else {
        setError("Bir hata olustu");
      }
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="glass-card shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="modal-header">
          <h3 className="text-lg font-bold text-white">
            {isEdit ? "Sabit Gider Duzenle" : "Yeni Sabit Gider"}
          </h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-600">
            <X size={20} className="text-surface-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1.5">Gider Adi</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ornegin: Ofis Kirasi, Elektrik, vb."
              aria-invalid={!!fieldErrors.name}
              className={`w-full px-4 py-3 rounded-xl border bg-surface-800 text-white
                         placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500
                         focus:border-transparent transition-all ${
                fieldErrors.name ? "border-red-500" : "border-surface-600"
              }`}
            />
            {fieldErrors.name && (
              <p className="mt-1 text-xs text-red-300">{fieldErrors.name}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1.5">Tip</label>
              <DarkSelect
                value={type}
                onChange={setType}
                options={[
                  { value: "RENT", label: "Kira" },
                  { value: "UTILITY", label: "Fatura" },
                  { value: "OTHER", label: "Diğer" },
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1.5">Tutar</label>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                placeholder="0"
                aria-invalid={!!fieldErrors.amount}
                className={`w-full px-4 py-3 rounded-xl border bg-surface-800 text-white
                           placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500
                           focus:border-transparent transition-all ${
                  fieldErrors.amount ? "border-red-500" : "border-surface-600"
                }`}
              />
              {fieldErrors.amount && (
                <p className="mt-1 text-xs text-red-300">{fieldErrors.amount}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1.5">Notlar</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ek bilgiler..."
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                         placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500
                         focus:border-transparent transition-all resize-none"
            />
          </div>

          {/* v1.5.9: recurring engine toggle */}
          <div className="bg-surface-700/50 rounded-xl p-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoGenerate}
                onChange={(e) => setAutoGenerate(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-brand-600"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">
                  Her ay otomatik tx olustur
                </p>
                <p className="text-xs text-surface-400 mt-0.5">
                  Acikken sistem her ayin 1&apos;inde otomatik bir gider transaction&apos;i
                  yaratir. Idempotent — ayni ay icinde iki kere uretmez. Audit log&apos;a
                  source=RECURRING ile dusurulur.
                </p>
                {isEdit && fixedCost?.last_auto_run && (
                  <p className="text-[10px] text-emerald-400 mt-1">
                    Son otomatik uretim: {new Date(fixedCost.last_auto_run).toLocaleString("tr-TR")}
                  </p>
                )}
              </div>
            </label>
          </div>

          {/* Belge / Sözleşme Yükleme */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1.5">
              Belge / Sozlesme
            </label>
            <InlineFileUpload
              category="contract"
              entityType="fixed_cost"
              onUploaded={(file) => setUploadedFiles((prev) => [...prev, file])}
              uploadedFiles={uploadedFiles}
              onRemoveFile={(fileId) =>
                setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId))
              }
            />
            <p className="text-xs text-surface-400 mt-1">
              Kira sozlesmesi, fatura ornegi vb. yukleyebilirsiniz
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 py-3">
              Vazgec
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !amount}
              className="flex-1 py-3 rounded-xl font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <><Loader2 size={18} className="animate-spin" /> Kaydediliyor...</> : isEdit ? "Guncelle" : <><Plus size={18} /> Ekle</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Fixed Cost Modal ────────────────────────────────
function DeleteFixedCostModal({
  fixedCost,
  onClose,
  onDeleted,
}: {
  fixedCost: FixedCost;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      await api.delete(`/fixed-costs/${fixedCost.id}`);
      toast.info("Sabit gider silindi");
      onDeleted();
    } catch (err: unknown) {
      toast.error(err);
      if (err instanceof ApiError && err.code === "CONF-409") {
        setError(
          "Bu kayit otomatik yonetiliyor; personel/arac modulunden silinmeden buradan silinemez."
        );
      } else if (err instanceof Error) {
        setError(err.message || "Sabit gider silinirken hata olustu");
      } else {
        setError("Sabit gider silinirken hata olustu");
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="glass-card shadow-xl w-full max-w-md">
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={16} className="text-red-300" />
            </div>
            <h3 className="text-lg font-bold text-white">Sabit Gideri Sil</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-600">
            <X size={20} className="text-surface-400" />
          </button>
        </div>

        <div className="p-4">
          <p className="text-sm text-surface-300 mb-4">
            <strong>{fixedCost.name}</strong> ({formatMoney(fixedCost.amount)} TL/ay) sabit giderini silmek istediginize emin misiniz?
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1 py-3">
              Vazgec
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 py-3 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 transition-colors flex items-center justify-center gap-2"
            >
              {isDeleting ? <><Loader2 size={18} className="animate-spin" /> Siliniyor...</> : <><Trash2 size={18} /> Sil</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

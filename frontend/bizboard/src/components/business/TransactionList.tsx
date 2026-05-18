"use client";

import { useState, useEffect } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Trash2, X, Loader2,
  AlertTriangle, Calendar, Building2, Tag, FileText, Hash,
  Pencil, Save, Paperclip, CreditCard, Banknote,
} from "lucide-react";
import { formatCurrency, formatRelativeDate, cn, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { InlineFileUpload } from "@/components/shared/FileUploadButton";
import type { Transaction, Category, FileUploadInfo, PaymentMethod } from "@/types";

interface Props {
  transactions: Transaction[];
  currency: string;
  /** v1.6.3+: opsiyonel ödeme yöntemi filtresi. Bilinmiyorsa NAKIT varsayılır. */
  paymentFilter?: "ALL" | PaymentMethod;
}

export function TransactionList({ transactions, currency, paymentFilter = "ALL" }: Props) {
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [detailTarget, setDetailTarget] = useState<Transaction | null>(null);

  const visible = paymentFilter === "ALL"
    ? transactions
    : transactions.filter((t) => (t.payment_method || "NAKIT") === paymentFilter);

  if (visible.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-surface-400">
          {paymentFilter === "POS"
            ? "POS ile odenmis islem yok"
            : paymentFilter === "NAKIT"
            ? "Nakit islem yok"
            : "Henuz islem yok"}
        </p>
        <p className="text-surface-400 text-sm mt-1">
          Ilk isleminizi kaydetmek icin &quot;Ekle&quot; butonuna basin
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="card divide-y divide-surface-700">
        {visible.map((tx) => {
          const isIncome = tx.direction === "income";
          const isPos = (tx.payment_method || "NAKIT") === "POS";
          return (
            <div
              key={tx.id}
              onClick={() => setDetailTarget(tx)}
              className="flex items-center gap-3 p-4 hover:bg-surface-700 transition-colors group cursor-pointer"
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                  isIncome ? "bg-green-50" : "bg-red-50"
                )}
              >
                {isIncome ? (
                  <ArrowDownLeft size={18} className="text-green-600" />
                ) : (
                  <ArrowUpRight size={18} className="text-red-600" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {tx.description || tx.category?.name || "Islem"}
                </p>
                <p className="text-xs text-surface-400 mt-0.5 flex items-center gap-1.5">
                  <span>{tx.category?.name || "Kategorisiz"}</span>
                  <span>·</span>
                  <span>{formatRelativeDate(tx.date)}</span>
                  <span
                    className={cn(
                      "ml-1 inline-flex items-center gap-1 px-1.5 py-[1px] rounded-full text-[10px] font-medium",
                      isPos
                        ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                        : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
                    )}
                    title={isPos ? "POS odeme" : "Nakit odeme"}
                  >
                    {isPos ? <CreditCard size={10} /> : <Banknote size={10} />}
                    {isPos ? "POS" : "Nakit"}
                    {isPos && tx.pos_rate ? <span className="opacity-70">%{tx.pos_rate}</span> : null}
                  </span>
                </p>
              </div>

              <span
                className={cn(
                  "text-sm font-semibold flex-shrink-0",
                  isIncome ? "text-green-600" : "text-red-600"
                )}
              >
                {isIncome ? "+" : "-"}
                {formatCurrency(tx.amount, currency)}
              </span>

              {/* Delete button */}
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(tx); }}
                className="p-1.5 rounded-lg text-surface-300 hover:text-red-500 hover:bg-red-50
                           opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                title="Islemi sil"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      {detailTarget && (
        <TransactionDetailModal
          transaction={detailTarget}
          currency={currency}
          onClose={() => setDetailTarget(null)}
          onDelete={() => { setDetailTarget(null); setDeleteTarget(detailTarget); }}
        />
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <DeleteTransactionModal
          transaction={deleteTarget}
          currency={currency}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

// ── Transaction Detail Modal ────────────────────────────────
export function TransactionDetailModal({
  transaction,
  currency,
  onClose,
  onDelete,
}: {
  transaction: Transaction;
  currency?: string;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const { triggerRefresh } = useAppStore();
  const isIncome = transaction.direction === "income";
  const effectiveCurrency = currency || transaction.currency || "TRY";

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit form state
  const [editDirection, setEditDirection] = useState(transaction.direction);
  const [editAmount, setEditAmount] = useState(String(transaction.amount));
  const [editDescription, setEditDescription] = useState(transaction.description || "");
  const [editDate, setEditDate] = useState(transaction.date);
  const [editTags, setEditTags] = useState((transaction.tags || []).join(", "));
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>(
    (transaction.payment_method as PaymentMethod) || "NAKIT",
  );
  const [editPosRate, setEditPosRate] = useState(
    transaction.pos_rate != null ? String(transaction.pos_rate) : "",
  );

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);
  const [editCategoryId, setEditCategoryId] = useState(transaction.category_id || "");

  // Files
  const [files, setFiles] = useState<FileUploadInfo[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<FileUploadInfo[]>([]);

  useEffect(() => {
    if (transaction.business_id) {
      api.get<Category[]>(`/businesses/${transaction.business_id}/categories`)
        .then(setCategories)
        .catch(() => {});
    }
    // Fetch existing files for this transaction
    api.get<FileUploadInfo[]>(`/files/by-entity?entity_type=transaction&entity_id=${transaction.id}`)
      .then(setFiles)
      .catch(() => {});
  }, [transaction.business_id, transaction.id]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const tags = editTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const posRateValue =
        editPaymentMethod === "POS" && editPosRate.trim() !== ""
          ? Number(editPosRate.replace(",", "."))
          : null;

      await api.put(`/businesses/${transaction.business_id}/transactions/${transaction.id}`, {
        direction: editDirection,
        amount: parseMoneyInput(editAmount),
        description: editDescription || null,
        date: editDate,
        category_id: editCategoryId || null,
        tags,
        payment_method: editPaymentMethod,
        pos_rate: posRateValue,
      });

      // Link newly uploaded files to transaction
      for (const f of uploadedFiles) {
        await api.patch(`/files/${f.id}/link`, {
          entity_type: "transaction",
          entity_id: transaction.id,
        });
      }

      triggerRefresh();
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Guncelleme sirasinda hata olustu"));
    } finally {
      setSaving(false);
    }
  }

  function handleFileUploaded(file: FileUploadInfo) {
    setUploadedFiles((prev) => [...prev, file]);
  }

  function handleRemoveNewFile(fileId: string) {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }

  const allFiles = [...files, ...uploadedFiles];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-surface-800 rounded-2xl shadow-card-hover border border-surface-600 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-700">
          <h3 className="text-lg font-semibold text-white">
            {editing ? "Islemi Duzenle" : "Islem Detayi"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors"
          >
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {editing ? (
            /* ── EDIT MODE ── */
            <>
              {/* Direction Toggle */}
              <div className="flex rounded-xl border border-surface-600 overflow-hidden">
                {(["income", "expense"] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setEditDirection(dir)}
                    className={cn(
                      "flex-1 py-2.5 text-sm font-medium transition-colors",
                      editDirection === dir
                        ? dir === "income"
                          ? "bg-green-600 text-white"
                          : "bg-red-600 text-white"
                        : "bg-surface-800 text-surface-300 hover:bg-surface-700"
                    )}
                  >
                    {dir === "income" ? "Gelir" : "Gider"}
                  </button>
                ))}
              </div>

              {/* Payment Method (v1.6.3+) */}
              <div>
                <label className="block text-sm font-medium text-surface-200 mb-1">Odeme Yontemi</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditPaymentMethod("NAKIT"); setEditPosRate(""); }}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-all border",
                      editPaymentMethod === "NAKIT"
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "bg-surface-800 border-surface-600 text-surface-300 hover:border-surface-300",
                    )}
                  >
                    <Banknote size={14} />
                    Nakit
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPaymentMethod("POS")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-all border",
                      editPaymentMethod === "POS"
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                        : "bg-surface-800 border-surface-600 text-surface-300 hover:border-surface-300",
                    )}
                  >
                    <CreditCard size={14} />
                    POS
                  </button>
                </div>
                {editPaymentMethod === "POS" && (
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-surface-300 mb-1">
                      POS Komisyon Orani (%)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editPosRate}
                      onChange={(e) => setEditPosRate(e.target.value.replace(/[^0-9.,]/g, ""))}
                      placeholder="orn. 1.95"
                      className="w-full px-3 py-2 rounded-xl border border-surface-600 bg-surface-800 text-white
                                 placeholder:text-surface-400 focus:outline-none focus:ring-2
                                 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-surface-200 mb-1">Tutar</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editAmount}
                  onChange={(e) => setEditAmount(formatMoneyInput(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white
                             focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-surface-200 mb-1">Tarih</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white
                             focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              {/* Category */}
              {categories.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Kategori</label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white
                               focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  >
                    <option value="">Kategorisiz</option>
                    {categories
                      .filter((c) => c.direction === editDirection)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-surface-200 mb-1">Aciklama</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white
                             placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500
                             focus:border-transparent resize-none"
                  placeholder="Aciklama ekleyin..."
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-surface-200 mb-1">Etiketler</label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="Virgul ile ayirin: fatura, kira, malzeme"
                  className="w-full px-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white
                             placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500
                             focus:border-transparent"
                />
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-surface-200 mb-1">Belgeler</label>
                {/* Existing files */}
                {files.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {files.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 px-3 py-2 bg-surface-700 border border-surface-600 rounded-xl">
                        <Paperclip size={14} className="text-surface-400 shrink-0" />
                        <span className="text-xs text-surface-200 truncate flex-1">{f.original_name}</span>
                        <span className="text-[10px] text-surface-400 shrink-0">Mevcut</span>
                      </div>
                    ))}
                  </div>
                )}
                <InlineFileUpload
                  category="receipt"
                  entityType="transaction"
                  onUploaded={handleFileUploaded}
                  uploadedFiles={uploadedFiles}
                  onRemoveFile={handleRemoveNewFile}
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              {/* Save / Cancel */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-xl text-sm font-medium transition-colors"
                >
                  Vazgec
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !editAmount || parseMoneyInput(editAmount) <= 0}
                  className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <><Loader2 size={16} className="animate-spin" /> Kaydediliyor...</>
                  ) : (
                    <><Save size={16} /> Kaydet</>
                  )}
                </button>
              </div>
            </>
          ) : (
            /* ── VIEW MODE ── */
            <>
              {/* Amount Banner */}
              <div className={cn(
                "rounded-xl p-5 text-center",
                isIncome ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
              )}>
                <div className="flex items-center justify-center gap-2 mb-1">
                  {isIncome ? (
                    <ArrowDownLeft size={20} className="text-green-600" />
                  ) : (
                    <ArrowUpRight size={20} className="text-red-600" />
                  )}
                  <span className={cn(
                    "text-sm font-medium",
                    isIncome ? "text-green-700" : "text-red-700"
                  )}>
                    {isIncome ? "Gelir" : "Gider"}
                  </span>
                </div>
                <p className={cn(
                  "text-3xl font-bold",
                  isIncome ? "text-green-700" : "text-red-700"
                )}>
                  {isIncome ? "+" : "-"}{formatCurrency(transaction.amount, effectiveCurrency)}
                </p>
              </div>

              {/* Details Grid */}
              <div className="space-y-3">
                {transaction.description && (
                  <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                    <FileText size={16} className="text-surface-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Aciklama</p>
                      <p className="text-sm text-white">{transaction.description}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                    <Calendar size={14} className="text-surface-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Tarih</p>
                      <p className="text-sm text-white font-medium">
                        {new Date(transaction.date).toLocaleDateString("tr-TR", {
                          day: "numeric", month: "long", year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                    <Tag size={14} className="text-surface-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Kategori</p>
                      <p className="text-sm text-white font-medium">
                        {transaction.category?.name || "Kategorisiz"}
                      </p>
                    </div>
                  </div>
                </div>

                {transaction.business_name && (
                  <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                    <Building2 size={16} className="text-surface-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Isletme</p>
                      <p className="text-sm text-white font-medium">{transaction.business_name}</p>
                    </div>
                  </div>
                )}

                {/* v1.6.3+: Odeme yontemi */}
                <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                  {(transaction.payment_method || "NAKIT") === "POS" ? (
                    <CreditCard size={16} className="text-indigo-300 mt-0.5 shrink-0" />
                  ) : (
                    <Banknote size={16} className="text-emerald-300 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="text-[10px] text-surface-400 uppercase tracking-wider">Odeme</p>
                    <p className="text-sm text-white font-medium">
                      {(transaction.payment_method || "NAKIT") === "POS" ? "POS" : "Nakit"}
                      {(transaction.payment_method || "NAKIT") === "POS" && transaction.pos_rate != null && (
                        <span className="ml-2 text-surface-300">%{transaction.pos_rate}</span>
                      )}
                    </p>
                    {(transaction.payment_method || "NAKIT") === "POS" && transaction.pos_rate != null && (
                      <p className="text-[11px] text-surface-400 mt-0.5">
                        Komisyon: {formatCurrency(
                          (Number(transaction.amount) * Number(transaction.pos_rate)) / 100,
                          effectiveCurrency,
                        )}
                        {" · Net: "}
                        {formatCurrency(
                          Number(transaction.amount) -
                            (Number(transaction.amount) * Number(transaction.pos_rate)) / 100,
                          effectiveCurrency,
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {transaction.tags && transaction.tags.length > 0 && (
                  <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                    <Hash size={16} className="text-surface-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Etiketler</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {transaction.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 bg-brand-50 text-brand-700 text-xs font-medium rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Attached Files */}
                {allFiles.length > 0 && (
                  <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                    <Paperclip size={16} className="text-surface-400 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Belgeler</p>
                      <div className="space-y-1 mt-1">
                        {allFiles.map((f) => (
                          <p key={f.id} className="text-sm text-surface-200">{f.original_name}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {transaction.created_at && (
                  <div className="p-3 bg-surface-700 rounded-xl">
                    <p className="text-[10px] text-surface-400 uppercase tracking-wider">Olusturulma</p>
                    <p className="text-sm text-white">
                      {new Date(transaction.created_at).toLocaleDateString("tr-TR", {
                        day: "numeric", month: "long", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-xl text-sm font-medium transition-colors"
                >
                  Kapat
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="px-4 py-2.5 bg-brand-50 hover:bg-brand-100 text-brand-600 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Pencil size={14} />
                  Duzenle
                </button>
                {onDelete && (
                  <button
                    onClick={onDelete}
                    className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <Trash2 size={14} />
                    Sil
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Delete Transaction Modal ────────────────────────────────
function DeleteTransactionModal({
  transaction,
  currency,
  onClose,
}: {
  transaction: Transaction;
  currency: string;
  onClose: () => void;
}) {
  const { triggerRefresh } = useAppStore();
  const [reason, setReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isIncome = transaction.direction === "income";

  async function handleDelete() {
    if (!reason.trim()) return;

    setIsDeleting(true);
    setError(null);

    try {
      await api.delete(
        `/businesses/${transaction.business_id}/transactions/${transaction.id}`,
        { reason: reason.trim() }
      );
      triggerRefresh();
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Islem silinirken bir hata olustu"));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-surface-800 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl z-10 animate-slide-up">
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle size={16} className="text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-white">Islemi Sil</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-700 transition-colors">
            <X size={20} className="text-surface-400" />
          </button>
        </div>

        <div className="p-4">
          <div className="bg-surface-700 rounded-xl p-3 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">
                  {transaction.description || transaction.category?.name || "Islem"}
                </p>
                <p className="text-xs text-surface-400 mt-0.5">
                  {new Date(transaction.date).toLocaleDateString("tr-TR", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </p>
              </div>
              <span className={cn("text-base font-bold", isIncome ? "text-green-600" : "text-red-600")}>
                {isIncome ? "+" : "-"}{formatCurrency(transaction.amount, currency)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1.5">
              Silme Sebebi <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Bu islemi neden siliyorsunuz? (zorunlu)"
              rows={3}
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                         placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-red-500
                         focus:border-transparent transition-all resize-none"
            />
            <p className="text-xs text-surface-400 mt-1">
              Silinen islemler kalici olarak kayit defterine kaydedilir
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 py-3 rounded-xl font-medium text-surface-200 bg-surface-700 hover:bg-surface-600 transition-colors"
            >
              Vazgec
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting || !reason.trim()}
              className="flex-1 py-3 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 transition-colors flex items-center justify-center gap-2"
            >
              {isDeleting ? (
                <><Loader2 size={18} className="animate-spin" /> Siliniyor...</>
              ) : (
                <><Trash2 size={18} /> Sil</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

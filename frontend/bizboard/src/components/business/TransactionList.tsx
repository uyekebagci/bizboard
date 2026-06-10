"use client";

import { useState, useEffect } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Trash2, X, Loader2,
  AlertTriangle, Calendar, Building2, Tag, FileText, Hash,
  Pencil, Save, Paperclip, CreditCard, Banknote, ArrowLeftRight,
} from "lucide-react";
import { formatCurrency, formatRelativeDate, cn, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { InlineFileUpload } from "@/components/shared/FileUploadButton";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { TransferDetailModal } from "@/components/transactions/TransferDetailModal";
import type { Transaction, Category, FileUploadInfo, PaymentMethod } from "@/types";

interface Props {
  transactions: Transaction[];
  currency: string;
  /** v1.6.3+: opsiyonel ödeme yöntemi filtresi. Bilinmiyorsa NAKIT varsayılır. */
  paymentFilter?: "ALL" | PaymentMethod;
  /** v1.6.23.10: POS settle/unsettle veya tx update sonrası parent refresh callback. */
  onChange?: () => void;
}

export function TransactionList({
  transactions,
  currency,
  paymentFilter = "ALL",
  onChange,
}: Props) {
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [detailTarget, setDetailTarget] = useState<Transaction | null>(null);
  // v1.7.0-beta (Bankalar WP TODO 64eb9a76): tx satırı transfer ise
  // standart TransactionDetailModal yerine TransferDetailModal aç.
  const [transferPairId, setTransferPairId] = useState<string | null>(null);

  const visible = paymentFilter === "ALL"
    ? transactions
    : transactions.filter((t) => (t.payment_method || "NAKIT") === paymentFilter);

  if (visible.length === 0) {
    return (
      <div className="p-8 text-center">
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
      {/* Redesign Inc.3: container plain (parent zaten glass-card ile sarmalıyor). */}
      <div className="divide-y divide-surface-700/60">
        {visible.map((tx) => {
          const isIncome = tx.direction === "income";
          const isPos = (tx.payment_method || "NAKIT") === "POS";
          // v1.7.0-beta (Bankalar WP TODO 6fcac2ef): transfer indicator
          const isTransfer = tx.kind === "TRANSFER" && !!tx.transfer_pair_id;
          return (
            <div
              key={tx.id}
              onClick={() => {
                if (isTransfer && tx.transfer_pair_id) {
                  setTransferPairId(tx.transfer_pair_id);
                } else {
                  setDetailTarget(tx);
                }
              }}
              className={cn(
                "row-hover flex items-center gap-3 p-4 transition-colors group cursor-pointer",
                isTransfer && "bg-blue-500/[0.03]",
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                  isTransfer
                    ? "bg-blue-500/15"
                    : isIncome ? "bg-emerald-500/15" : "bg-rose-500/15",
                )}
              >
                {isTransfer ? (
                  <ArrowLeftRight size={18} className="text-blue-400" />
                ) : isIncome ? (
                  <ArrowDownLeft size={18} className="text-emerald-400" />
                ) : (
                  <ArrowUpRight size={18} className="text-rose-400" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                  {/* Beta v1.1: POS komisyon UI tamamen kaldırıldı — POS satırı
                      da normal title formatı kullanır (description / kategori). */}
                  {tx.description || tx.category?.name || (isTransfer ? "Transfer" : isPos ? "POS İşlemi" : "Islem")}
                  {isTransfer && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-500/20 text-blue-300 border border-blue-500/40">
                      ⇄ {tx.direction === "expense" ? "OUT" : "IN"}
                    </span>
                  )}
                </p>
                <p className="text-xs text-surface-400 mt-0.5 flex items-center gap-1.5">
                  <span>{isTransfer ? "Hesaplar arası" : (tx.category?.name || "Kategorisiz")}</span>
                  <span>·</span>
                  <span>{formatRelativeDate(tx.date)}</span>
                  {!isTransfer && (
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
                    </span>
                  )}
                </p>
              </div>

              <span
                className={cn(
                  "num text-sm font-bold flex-shrink-0 text-right",
                  isIncome ? "text-emerald-300" : "text-rose-300",
                )}
              >
                {/* Beta v1.1: POS komisyon UI kaldırıldı — sağdaki amount her
                    zaman tx.amount (POS Hacmi mantığı). */}
                {isIncome ? "+" : "-"}{formatCurrency(tx.amount, currency)}
              </span>

              {/* Delete button */}
              {/* v1.7.0-beta (TODO 3993f396): TRANSFER tek-yönlü silinemez.
                  Tx satırına tıklayınca TransferDetailModal açılır; oradan
                  pair delete edilebilir. */}
              {isTransfer ? (
                <span
                  className="p-1.5 rounded-lg text-surface-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 cursor-default"
                  title="Transfer pair'i silmek için satıra tıkla"
                >
                  <ArrowLeftRight size={14} />
                </span>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(tx); }}
                  className="p-1.5 rounded-lg text-surface-300 hover:text-red-400 hover:bg-rose-500/10
                             opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  title="Islemi sil"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* v1.7.0-beta (TODO 64eb9a76): Transfer Detail Modal */}
      <TransferDetailModal
        pairId={transferPairId}
        onClose={() => setTransferPairId(null)}
        onDeleted={() => { setTransferPairId(null); onChange?.(); }}
      />

      {/* Detail Modal */}
      {detailTarget && (
        <TransactionDetailModal
          transaction={detailTarget}
          currency={currency}
          onClose={() => setDetailTarget(null)}
          onDelete={() => { setDetailTarget(null); setDeleteTarget(detailTarget); }}
          onChange={onChange}
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
  onChange,
}: {
  transaction: Transaction;
  currency?: string;
  onClose: () => void;
  onDelete?: () => void;
  /** v1.6.23.10: settle/unsettle sonrası parent refresh. */
  onChange?: () => void;
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
  // Beta v1.1: POS komisyon UI kaldırıldı — edit'te de oran sorulmuyor.
  // Mevcut tx'in oranı save sırasında olduğu gibi geri yollanır (data koruma).

  // WP b446c696 (Beta v1.1 Hotfix · POS Gider): pos_tx_subtype + related bank.
  const [editPosTxSubtype, setEditPosTxSubtype] = useState<"NAKIT" | "TRANSFER">(
    (transaction.pos_tx_subtype as "NAKIT" | "TRANSFER" | null) || "NAKIT",
  );
  const [editRelatedBankAccountId, setEditRelatedBankAccountId] = useState<string>(
    transaction.related_bank_account_id || "",
  );
  const [bankAccountsForRelated, setBankAccountsForRelated] = useState<
    Array<{ id: string; name: string; type: string }>
  >([]);
  useEffect(() => {
    api.get<Array<{ id: string; name: string; type: string; is_active?: boolean; business_id?: string }>>(
      `/bank-accounts`,
    )
      .then((accs) => {
        setBankAccountsForRelated(
          (accs || [])
            .filter((a) => a.is_active !== false)
            .filter((a) => !a.business_id || a.business_id === transaction.business_id)
            .filter((a) => ["CHECKING", "SAVINGS", "CASH_HOLDER", "MAIN_CASH", "SUB_CASH"].includes(a.type)),
        );
      })
      .catch(() => setBankAccountsForRelated([]));
  }, [transaction.business_id]);

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);
  const [editCategoryId, setEditCategoryId] = useState(transaction.category_id || "");

  // Files
  const [files, setFiles] = useState<FileUploadInfo[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<FileUploadInfo[]>([]);

  // Beta v1.1 hotfix: tx'in dahil olduğu sub-cash listesi — detay görüntüsü.
  const [includedSubCashes, setIncludedSubCashes] = useState<
    Array<{ sub_cash_id: string; sub_cash_name: string; scope: string | null }>
  >([]);
  useEffect(() => {
    if (!transaction.business_id || !transaction.id) return;
    api.get<Array<{ sub_cash_id: string; sub_cash_name: string; scope: string | null }>>(
      `/businesses/${transaction.business_id}/transactions/${transaction.id}/sub-cashes`,
    )
      .then(setIncludedSubCashes)
      .catch(() => setIncludedSubCashes([]));
  }, [transaction.business_id, transaction.id]);

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

      // Beta v1.1: POS komisyon UI kaldırıldı — edit'te eski oranları KORU
      // (backend tarafında migration yok, eski tx'ler değiştirilmesin).
      const isPosExpenseEdit = editPaymentMethod === "POS" && editDirection === "expense";
      await api.put(`/businesses/${transaction.business_id}/transactions/${transaction.id}`, {
        direction: editDirection,
        amount: parseMoneyInput(editAmount),
        description: editDescription || null,
        date: editDate,
        category_id: editCategoryId || null,
        tags,
        payment_method: editPaymentMethod,
        pos_rate: transaction.pos_rate ?? null,
        our_commission_rate: transaction.applied_our_commission_rate ?? null,
        // WP b446c696 (Beta v1.1 Hotfix): POS gider alt-tipi düzenlemesi.
        pos_tx_subtype: isPosExpenseEdit ? editPosTxSubtype : null,
        related_bank_account_id:
          isPosExpenseEdit && editPosTxSubtype === "TRANSFER" && editRelatedBankAccountId
            ? editRelatedBankAccountId
            : null,
      });

      // Link newly uploaded files to transaction
      for (const f of uploadedFiles) {
        await api.patch(`/files/${f.id}/link`, {
          entity_type: "transaction",
          entity_id: transaction.id,
        });
      }

      triggerRefresh();
      toast.success("İşlem güncellendi");
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Guncelleme sirasinda hata olustu"));
      toast.error(err);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="modal-surface shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="modal-header">
          <h3 className="text-lg font-semibold text-surface-100">
            {editing ? "Islemi Duzenle" : "Islem Detayi"}
          </h3>
          <button
            onClick={onClose}
            className="modal-close"
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
                    onClick={() => setEditPaymentMethod("NAKIT")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-all border",
                      editPaymentMethod === "NAKIT"
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
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
                        ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300"
                        : "bg-surface-800 border-surface-600 text-surface-300 hover:border-surface-300",
                    )}
                  >
                    <CreditCard size={14} />
                    POS
                  </button>
                </div>
                {/* Beta v1.1: POS komisyon input'ları kaldırıldı — edit modunda
                    da artık iki oran sorulmuyor. */}

                {/* WP b446c696 (Beta v1.1 Hotfix): POS gider alt-tipi düzenleme */}
                {editPaymentMethod === "POS" && editDirection === "expense" && (
                  <div className="mt-3 space-y-2">
                    <label className="block text-xs font-medium text-surface-300">
                      İşlem Tipi
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["NAKIT", "TRANSFER"] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setEditPosTxSubtype(opt)}
                          className={cn(
                            "py-2 px-3 rounded-xl text-xs font-medium border transition-all",
                            editPosTxSubtype === opt
                              ? "bg-indigo-500/15 border-indigo-500/50 text-indigo-200"
                              : "bg-surface-800 border-surface-600 text-surface-400 hover:border-surface-300",
                          )}
                        >
                          {opt === "NAKIT" ? "Nakit" : "Transfer"}
                        </button>
                      ))}
                    </div>
                    {editPosTxSubtype === "TRANSFER" && (
                      <div>
                        <label className="block text-[11px] font-medium text-surface-300 mb-1 mt-1">
                          İlgili Banka Hesabı (opsiyonel)
                        </label>
                        <DarkSelect
                          value={editRelatedBankAccountId}
                          onChange={setEditRelatedBankAccountId}
                          placeholder="Sonra seçebilirsin (opsiyonel)"
                          searchable={bankAccountsForRelated.length > 6}
                          options={[
                            { value: "", label: "— (Atlanır)" },
                            ...bankAccountsForRelated.map((b) => ({
                              value: b.id,
                              label: b.name,
                              meta: b.type,
                            })),
                          ]}
                        />
                        <p className="mt-1 text-[10px] text-surface-500">
                          Sadece bilgi alanı — hesap bakiyesini etkilemez.
                        </p>
                      </div>
                    )}
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
                  className="w-full px-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-surface-100
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
                  className="w-full px-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-surface-100
                             focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              {/* Category */}
              {categories.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Kategori</label>
                  <DarkSelect
                    value={editCategoryId}
                    onChange={setEditCategoryId}
                    placeholder="Kategorisiz"
                    searchable={categories.filter((c) => c.direction === editDirection).length > 6}
                    options={categories
                      .filter((c) => c.direction === editDirection)
                      .map((c) => ({ value: c.id, label: c.name }))}
                  />
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-surface-200 mb-1">Aciklama</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-surface-100
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
                  className="w-full px-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-surface-100
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
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              {/* Save / Cancel */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="btn-secondary flex-1 px-4 py-2.5 text-sm"
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
                isIncome ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"
              )}>
                <div className="flex items-center justify-center gap-2 mb-1">
                  {isIncome ? (
                    <ArrowDownLeft size={20} className="text-green-300" />
                  ) : (
                    <ArrowUpRight size={20} className="text-red-300" />
                  )}
                  <span className={cn(
                    "text-sm font-medium",
                    isIncome ? "text-green-300" : "text-red-300"
                  )}>
                    {isIncome ? "Gelir" : "Gider"}
                  </span>
                </div>
                <p className={cn(
                  "text-3xl font-bold",
                  isIncome ? "text-green-300" : "text-red-300"
                )}>
                  {/* Beta v1.1 (WP 4f6baaa3 follow-up): POS komisyon UI tamamen kaldırıldı —
                      tx tutarı her zaman amount (POS Hacmi mantığı). */}
                  {isIncome ? "+" : "-"}
                  {formatCurrency(transaction.amount, effectiveCurrency)}
                </p>
              </div>

              {/* Details Grid */}
              <div className="space-y-3">
                {transaction.description && (
                  <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                    <FileText size={16} className="text-surface-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Aciklama</p>
                      <p className="text-sm text-surface-100">{transaction.description}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                    <Calendar size={14} className="text-surface-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Tarih</p>
                      <p className="text-sm text-surface-100 font-medium">
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
                      <p className="text-sm text-surface-100 font-medium">
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
                      <p className="text-sm text-surface-100 font-medium">{transaction.business_name}</p>
                    </div>
                  </div>
                )}

                {/* v1.6.3+: Odeme yontemi + v1.6.21 (WP-4) POS settled toggle */}
                <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                  {(transaction.payment_method || "NAKIT") === "POS" ? (
                    <CreditCard size={16} className="text-indigo-300 mt-0.5 shrink-0" />
                  ) : (
                    <Banknote size={16} className="text-emerald-300 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="text-[10px] text-surface-400 uppercase tracking-wider">Odeme</p>
                    <p className="text-sm text-surface-100 font-medium">
                      {/* Beta v1.1: POS komisyon UI kaldırıldı — sadece method + cihaz adı. */}
                      {(transaction.payment_method || "NAKIT") === "POS" ? "POS" : "Nakit"}
                      {transaction.pos_device_name && (
                        <span className="ml-2 text-surface-400">· {transaction.pos_device_name}</span>
                      )}
                    </p>
                    {/* WP b446c696 (Beta v1.1 Hotfix): POS gider tx için alt-tip + related bank info */}
                    {(transaction.payment_method || "NAKIT") === "POS"
                      && transaction.direction === "expense"
                      && transaction.pos_tx_subtype && (
                      <p className="text-[11px] text-surface-400 mt-1">
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] font-medium">
                          {transaction.pos_tx_subtype === "NAKIT" ? "Nakit" : "Transfer"}
                        </span>
                        {transaction.pos_tx_subtype === "TRANSFER" && transaction.related_bank_account_name && (
                          <span className="ml-1.5 text-surface-300">· {transaction.related_bank_account_name}</span>
                        )}
                      </p>
                    )}
                    {/* v1.6.23.9 (TODO 658c6f63): POS settle button + bank modal — sadece income POS için */}
                    {(transaction.payment_method || "NAKIT") === "POS"
                      && transaction.direction !== "expense" && (
                      <PosSettledToggle
                        transactionId={transaction.id}
                        businessId={transaction.business_id}
                        initial={transaction.pos_settled ?? false}
                        settledBankName={transaction.settled_bank_account_name}
                        onSettleChange={onChange}
                      />
                    )}
                  </div>
                </div>

                {/* Beta v1.1 hotfix: tx hangi sub-cash'lere dahil — read-only display */}
                {includedSubCashes.length > 0 && (
                  <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                    <Banknote size={16} className="text-emerald-300 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">
                        Atandığı Alt Kasalar ({includedSubCashes.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {includedSubCashes.map((sc) => (
                          <span
                            key={sc.sub_cash_id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            title={sc.scope === "MANUAL" ? "Manuel atama" : "Otomatik (entity match)"}
                          >
                            <Banknote size={9} />
                            {sc.sub_cash_name}
                            {sc.scope === "MANUAL" && (
                              <span className="text-[9px] opacity-70">·M</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {transaction.tags && transaction.tags.length > 0 && (
                  <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                    <Hash size={16} className="text-surface-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Etiketler</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {transaction.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 bg-brand-500/15 text-brand-300 text-xs font-medium rounded-full"
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
                    <p className="text-sm text-surface-100">
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
                  className="btn-secondary flex-1 px-4 py-2.5 text-sm"
                >
                  Kapat
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="px-4 py-2.5 bg-brand-500/15 hover:bg-brand-500/25 text-brand-300 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Pencil size={14} />
                  Duzenle
                </button>
                {onDelete && (
                  <button
                    onClick={onDelete}
                    className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
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
      // Beta v1.1 hotfix v2: bazı CDN/WAF DELETE method'una 403 dönüyor —
      // POST /delete alternative endpoint'i kullan.
      await api.post(
        `/businesses/${transaction.business_id}/transactions/${transaction.id}/delete`,
        { reason: reason.trim() },
      );
      triggerRefresh();
      toast.info("İşlem silindi");
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Islem silinirken bir hata olustu"));
      toast.error(err);
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
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={16} className="text-red-300" />
            </div>
            <h3 className="text-lg font-bold text-surface-100">Islemi Sil</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-700 transition-colors">
            <X size={20} className="text-surface-400" />
          </button>
        </div>

        <div className="p-4">
          <div className="bg-surface-700 rounded-xl p-3 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-surface-100">
                  {transaction.description || transaction.category?.name || "Islem"}
                </p>
                <p className="text-xs text-surface-400 mt-0.5">
                  {new Date(transaction.date).toLocaleDateString("tr-TR", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </p>
              </div>
              <span className={cn("text-base font-bold", isIncome ? "text-green-300" : "text-red-300")}>
                {isIncome ? "+" : "-"}{formatCurrency(transaction.amount, currency)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1.5">
              Silme Sebebi <span className="text-red-300">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Bu islemi neden siliyorsunuz? (zorunlu)"
              rows={3}
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-surface-100
                         placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-red-500
                         focus:border-transparent transition-all resize-none"
            />
            <p className="text-xs text-surface-400 mt-1">
              Silinen islemler kalici olarak kayit defterine kaydedilir
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mt-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="btn-secondary flex-1 py-3"
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

// ─── v1.6.23.9 (TODO 658c6f63): POS Settle Button + Modal ────────────────────
// Önceki sürüm (v1.6.21): pos_settled boolean'ı düz PUT ile toggle ediyordu —
// hangi banka hesabına düştüğü bilgisi yoktu, bank balance güncellenmiyordu.
// Yeni akış: PATCH /transactions/{id}/settle endpoint'i, bank_account_id zorunlu.
function PosSettledToggle({
  transactionId,
  businessId,
  initial,
  settledBankName,
  onSettleChange,
}: {
  transactionId: string;
  businessId: string;
  initial: boolean;
  settledBankName?: string | null;
  /** v1.6.23.10: settle/unsettle sonrası parent refresh (consolidated widget vs.). */
  onSettleChange?: () => void;
}) {
  const [settled, setSettled] = useState<boolean>(initial);
  const [bankName, setBankName] = useState<string | null>(settledBankName || null);
  const [showModal, setShowModal] = useState(false);
  const [unsettling, setUnsettling] = useState(false);

  // v1.6.23.10: settle iptali (admin için inline buton)
  async function handleUnsettle() {
    if (!confirm("Bu POS işleminin 'hesaba düştü' onayını iptal etmek istediğinden emin misin?")) return;
    setUnsettling(true);
    try {
      await api.patch(`/businesses/${businessId}/transactions/${transactionId}/unsettle`);
      setSettled(false);
      setBankName(null);
      toast.success("Settle iptal edildi");
      onSettleChange?.();
    } catch (err) {
      // silent — toggle değiştirilmez
      toast.error(err);
    } finally {
      setUnsettling(false);
    }
  }

  if (settled) {
    return (
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
          title={bankName ? `Hesaba dustu: ${bankName}` : "Hesaba dustu"}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
          Hesaba düştü{bankName ? ` · ${bankName}` : ""}
        </span>
        <button
          type="button"
          onClick={handleUnsettle}
          disabled={unsettling}
          className="text-[10px] text-surface-400 hover:text-red-300 underline-offset-2 hover:underline disabled:opacity-50"
          title="Settle iptali (admin)"
        >
          {unsettling ? "iptal ediliyor…" : "iptal et"}
        </button>
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium border bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25 transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />
        Hesaba düştü olarak işaretle
      </button>
      {showModal && (
        <SettleModal
          transactionId={transactionId}
          businessId={businessId}
          onClose={() => setShowModal(false)}
          onSuccess={(bankNameResult) => {
            setSettled(true);
            setBankName(bankNameResult);
            setShowModal(false);
            onSettleChange?.();
          }}
        />
      )}
    </>
  );
}

function SettleModal({
  transactionId,
  businessId,
  onClose,
  onSuccess,
}: {
  transactionId: string;
  businessId: string;
  onClose: () => void;
  onSuccess: (bankName: string) => void;
}) {
  type BankRow = { id: string; name: string; type: string; bank_name?: string | null };
  const [banks, setBanks] = useState<BankRow[]>([]);
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [settledAt, setSettledAt] = useState<string>(new Date().toISOString().slice(0, 16));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<BankRow[]>("/bank-accounts")
      .then((rows) => {
        const eligible = rows.filter((b) => b.type === "CHECKING" || b.type === "SAVINGS");
        setBanks(eligible);
        if (eligible.length === 1) setSelectedBank(eligible[0].id);
      })
      .catch(() => setError("Banka hesapları yüklenemedi"));
  }, []);

  async function submit() {
    if (!selectedBank) {
      setError("Banka hesabı seç");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(
        `/businesses/${businessId}/transactions/${transactionId}/settle`,
        {
          bank_account_id: selectedBank,
          settled_at: settledAt.length > 0 ? `${settledAt}:00` : undefined,
        }
      );
      const bank = banks.find((b) => b.id === selectedBank);
      toast.success("Hesaba düştü olarak işaretlendi");
      onSuccess(bank?.name || "");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "İşlem başarısız");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="glass-card shadow-xl w-full max-w-md">
        <div className="modal-header">
          <h3 className="text-base font-semibold text-surface-100">POS işlemi hesaba düştü</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-700">
            <X size={16} className="text-surface-400" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg">
              {error}
            </div>
          )}
          <div>
            <label className="text-xs text-surface-300 mb-1 block">Banka hesabı</label>
            <DarkSelect
              value={selectedBank}
              onChange={setSelectedBank}
              placeholder="— seç —"
              searchable={banks.length > 6}
              options={banks.map((b) => ({
                value: b.id,
                label: b.name + (b.bank_name ? ` (${b.bank_name})` : ""),
              }))}
              addOption={{
                label: "+ Yeni Banka Hesabı Ekle",
                onClick: () => { window.location.href = "/dashboard/hesaplar"; },
              }}
            />
            {banks.length === 0 && (
              <p className="text-[10px] text-amber-300 mt-1">Aktif CHECKING/SAVINGS hesabı yok.</p>
            )}
          </div>
          <div>
            <label className="text-xs text-surface-300 mb-1 block">Düşme tarihi</label>
            <input
              type="datetime-local"
              value={settledAt}
              onChange={(e) => setSettledAt(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-surface-100 text-sm"
            />
          </div>
        </div>
        <div className="p-4 border-t border-surface-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm bg-surface-700 text-surface-300 hover:bg-surface-600 disabled:opacity-60"
          >
            İptal
          </button>
          <button
            onClick={submit}
            disabled={submitting || !selectedBank}
            className="px-4 py-2 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? "Kaydediliyor…" : "Onayla"}
          </button>
        </div>
      </div>
    </div>
  );
}

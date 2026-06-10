"use client";

import { useState, useEffect } from "react";
import { formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import {
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Trash2,
  X,
  Eye,
  EyeOff,
  FileImage,
  Calendar,
  Building2,
  Filter,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { InlineFileUpload } from "@/components/shared/FileUploadButton";
import { CounterpartCombobox } from "@/components/shared/CounterpartCombobox";
import type { Debt, DebtSummary, FileUploadInfo, ReceivableType } from "@/types";

const INSTRUMENT_OPTIONS = ["CEK", "SENET", "NAKIT"];

/**
 * v1.6.5+: RECEIVABLE direction'lı debt'ler için ek tipler.
 * Backend `receivable_type` enum'u SENET / CEK / ALTIN / NAKIT / DIGER.
 * ALTIN bu listede instrument_type'da yok — yalnız alacak tarafında anlamlı.
 */
const RECEIVABLE_TYPE_OPTIONS: ReceivableType[] = ["SENET", "CEK", "ALTIN", "NAKIT", "DIGER"];

function receivableTypeLabel(t: ReceivableType): string {
  switch (t) {
    case "SENET": return "Senet";
    case "CEK": return "Cek";
    case "ALTIN": return "Altin";
    case "NAKIT": return "Nakit";
    case "DIGER": return "Diger";
  }
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("tr-TR");
}

interface Props {
  businessId: string;
  currency: string;
}

export function DebtModule({ businessId, currency }: Props) {
  const { profile, triggerRefresh } = useAppStore();
  const isAdmin = profile?.role === "admin";

  const [debts, setDebts] = useState<Debt[]>([]);
  const [summary, setSummary] = useState<DebtSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "RECEIVABLE" | "PAYABLE">("all");
  const [showSettled, setShowSettled] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [settleConfirm, setSettleConfirm] = useState<Debt | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Debt | null>(null);

  useEffect(() => {
    fetchData();
  }, [businessId]);

  async function fetchData() {
    setLoading(true);
    try {
      const [debtsData, summaryData] = await Promise.all([
        api.get<Debt[]>(`/businesses/${businessId}/debts`),
        api.get<DebtSummary>(`/businesses/${businessId}/debts/summary`),
      ]);
      setDebts(debtsData || []);
      setSummary(summaryData || null);
    } catch (err) {
      logger.error("api", "Debt fetch error", undefined, err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSettle(debtId: string) {
    try {
      await api.patch(`/debts/${debtId}/settle`, {});
      toast.success("Borç kapatıldı");
      setSettleConfirm(null);
      fetchData();
      // BUG fix: alacaklar widget'ı consolidated dashboard'dan beslenir;
      // global refresh tetiklenmezse stale kalır.
      triggerRefresh();
    } catch (err: unknown) {
      toast.error(err);
    }
  }

  async function handleDelete(debtId: string) {
    try {
      await api.delete(`/debts/${debtId}`);
      toast.info("Borç silindi");
      setDeleteConfirm(null);
      fetchData();
      triggerRefresh();
    } catch (err: unknown) {
      toast.error(err);
    }
  }

  const filteredDebts = debts
    .filter((d) => filter === "all" || d.direction === filter)
    .filter((d) => showSettled || !d.is_settled);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-24 bg-surface-600 rounded-xl" />
        <div className="h-16 bg-surface-600 rounded-xl" />
        <div className="h-16 bg-surface-600 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-card p-3">
            <p className="text-xs text-surface-400 mb-1">Alacak</p>
            <p className="text-base font-bold text-emerald-300">
              {currency === "TRY" ? "₺" : currency}
              {formatMoney(summary.pending_receivable)}
            </p>
            <p className="text-[10px] text-surface-400 mt-0.5">
              {summary.receivable_count} kayit
            </p>
          </div>
          <div className="glass-card p-3">
            <p className="text-xs text-surface-400 mb-1">Verecek</p>
            <p className="text-base font-bold text-red-300">
              {currency === "TRY" ? "₺" : currency}
              {formatMoney(summary.pending_payable)}
            </p>
            <p className="text-[10px] text-surface-400 mt-0.5">
              {summary.payable_count} kayit
            </p>
          </div>
          <div className="glass-card p-3">
            <p className="text-xs text-surface-400 mb-1">Net</p>
            <p
              className={`text-base font-bold ${
                summary.net_balance >= 0 ? "text-emerald-300" : "text-red-300"
              }`}
            >
              {summary.net_balance >= 0 ? "+" : ""}
              {currency === "TRY" ? "₺" : currency}
              {formatMoney(summary.net_balance)}
            </p>
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Filter */}
          <div className="flex gap-1 bg-surface-700 rounded-xl p-0.5">
            {(
              [
                { key: "all", label: "Tumu" },
                { key: "RECEIVABLE", label: "Alacak" },
                { key: "PAYABLE", label: "Verecek" },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === f.key
                    ? "bg-surface-800 text-white shadow-sm"
                    : "text-surface-400 hover:text-surface-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Toggle settled */}
          <button
            onClick={() => setShowSettled(!showSettled)}
            className={`p-1.5 rounded-lg transition-colors ${
              showSettled ? "bg-surface-600 text-surface-200" : "bg-surface-700 text-surface-400"
            }`}
            title={showSettled ? "Kapatilanlari gizle" : "Kapatilanlari goster"}
          >
            {showSettled ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-xs font-medium rounded-xl hover:bg-brand-700 transition-colors"
        >
          <Plus size={14} />
          Ekle
        </button>
      </div>

      {/* Debt List */}
      {filteredDebts.length === 0 ? (
        <div className="glass-card p-6 text-center">
          <p className="text-surface-400 text-sm">Kayit bulunamadi</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDebts.map((debt) => (
            <div
              key={debt.id}
              className={`glass-card p-3.5 group ${debt.is_settled ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  {/* Direction icon */}
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      debt.direction === "RECEIVABLE"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-red-500/20 text-red-300"
                    }`}
                  >
                    {debt.direction === "RECEIVABLE" ? (
                      <ArrowDownLeft size={18} />
                    ) : (
                      <ArrowUpRight size={18} />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white text-sm truncate">
                        {debt.counterparty}
                      </p>
                      {debt.is_settled && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-300 rounded-full font-medium">
                          Kapatildi
                        </span>
                      )}
                      {debt.admin_only && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-300 rounded-full font-medium">
                          Gizli
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-surface-400">
                        {debt.instrument_type}
                      </span>
                      {debt.due_date && (
                        <span className="flex items-center gap-0.5 text-xs text-surface-400">
                          <Calendar size={10} />
                          {formatDate(debt.due_date)}
                        </span>
                      )}
                    </div>
                    {debt.description && (
                      <p className="text-xs text-surface-400 mt-1 truncate max-w-[200px]">
                        {debt.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Amount + Actions */}
                <div className="flex items-center gap-2">
                  <p
                    className={`font-bold text-sm whitespace-nowrap ${
                      debt.direction === "RECEIVABLE"
                        ? "text-emerald-300"
                        : "text-red-300"
                    }`}
                  >
                    {debt.direction === "RECEIVABLE" ? "+" : "-"}
                    {currency === "TRY" ? "₺" : currency}
                    {formatMoney(debt.amount)}
                  </p>

                  {/* Actions (hover) */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!debt.is_settled && (
                      <button
                        onClick={() => setSettleConfirm(debt)}
                        className="p-1.5 rounded-lg hover:bg-emerald-500/15 transition-colors"
                        title={
                          debt.direction === "RECEIVABLE"
                            ? "Tahsil edildi"
                            : "Odendi"
                        }
                      >
                        <Check size={14} className="text-emerald-300" />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteConfirm(debt)}
                      className="p-1.5 rounded-lg hover:bg-red-500/15 transition-colors"
                      title="Sil"
                    >
                      <Trash2 size={14} className="text-red-300" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateDebtModal
          businessId={businessId}
          currency={currency}
          isAdmin={isAdmin}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchData();
            // BUG fix: alacaklar/verecekler widget'larını invalidate et
            triggerRefresh();
          }}
        />
      )}

      {/* Settle Confirmation */}
      {settleConfirm && (
        <ConfirmModal
          title={
            settleConfirm.direction === "RECEIVABLE"
              ? "Tahsil Edildi"
              : "Odendi"
          }
          message={`${settleConfirm.counterparty} - ${formatMoney(
            settleConfirm.amount
          )} TL borcu ${
            settleConfirm.direction === "RECEIVABLE"
              ? "tahsil edildi"
              : "odendi"
          } olarak isaretlensin mi?`}
          confirmLabel={
            settleConfirm.direction === "RECEIVABLE"
              ? "Tahsil Edildi"
              : "Odendi"
          }
          confirmColor="emerald"
          onCancel={() => setSettleConfirm(null)}
          onConfirm={() => handleSettle(settleConfirm.id)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <ConfirmModal
          title="Borcu Sil"
          message={`${deleteConfirm.counterparty} - ${formatMoney(
            deleteConfirm.amount
          )} TL kaydi silinsin mi? Bu islem geri alinamaz.`}
          confirmLabel="Sil"
          confirmColor="red"
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => handleDelete(deleteConfirm.id)}
        />
      )}
    </div>
  );
}

// ── Confirm Modal ───────────────────────────────────────────
function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmColor,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor: "red" | "emerald";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="glass-card shadow-xl p-6 max-w-sm w-full">
        <h3 className="text-lg font-semibold text-white mb-2">
          {title}
        </h3>
        <p className="text-surface-300 text-sm mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-xl text-sm font-medium transition-colors"
          >
            Iptal
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 text-white rounded-xl text-sm font-medium transition-colors ${
              confirmColor === "red"
                ? "bg-red-600 hover:bg-red-500"
                : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create Debt Modal ───────────────────────────────────────
function CreateDebtModal({
  businessId,
  currency,
  isAdmin,
  onClose,
  onSuccess,
}: {
  businessId: string;
  currency: string;
  isAdmin: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [direction, setDirection] = useState<"RECEIVABLE" | "PAYABLE">(
    "RECEIVABLE"
  );
  const [counterparty, setCounterparty] = useState("");
  /** v1.5.4: counterpart normalize ref. Combobox seçimine bağlı; null → free-text. */
  const [counterpartId, setCounterpartId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [instrumentType, setInstrumentType] = useState("NAKIT");
  const [customInstrument, setCustomInstrument] = useState("");
  /** v1.6.5+: RECEIVABLE için ayrı tip seçimi (instrument_type'tan bağımsız). */
  const [receivableType, setReceivableType] = useState<ReceivableType>("NAKIT");
  const [receivableTypeOther, setReceivableTypeOther] = useState("");
  // v1.6.22 (WP-5): çek özel alanlar (yalnız receivable_type=CEK iken anlamlı)
  const [chequeDueDate, setChequeDueDate] = useState("");
  const [chequeCollectorBank, setChequeCollectorBank] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  // v1.6.22 (WP-5): hatırlatma alanları (her debt için opsiyonel)
  const [reminderDate, setReminderDate] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<FileUploadInfo[]>([]);
  const [adminOnly, setAdminOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveInstrument =
    instrumentType === "DIGER" ? customInstrument : instrumentType;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!counterparty.trim()) {
      setError("Karsi taraf adi zorunludur");
      return;
    }
    if (!amount || parseMoneyInput(amount) <= 0) {
      setError("Gecerli bir tutar girin");
      return;
    }
    if (!effectiveInstrument.trim()) {
      setError("Borc tipi zorunludur");
      return;
    }

    // v1.6.5+: RECEIVABLE için receivable_type + DIGER zorunlu metin kontrolü.
    if (direction === "RECEIVABLE" && receivableType === "DIGER" && !receivableTypeOther.trim()) {
      setError("'Diger' seciliyse alacak tipini belirtin");
      return;
    }

    setSubmitting(true);
    try {
      // v1.6.5+: RECEIVABLE iken receivable_type + receivable_type_other gönder;
      // instrument_type backend'de hala @NotBlank — aynı değeri eşle (DIGER ise
      // customInstrument metnini kullan; receivableType ALTIN ise "ALTIN" literal'i).
      const isReceivable = direction === "RECEIVABLE";
      const debt = await api.post<{ id: string }>(`/businesses/${businessId}/debts`, {
        direction,
        counterparty: counterparty.trim(),
        counterpart_id: counterpartId,
        amount: parseMoneyInput(amount),
        currency,
        instrument_type: isReceivable
          ? (receivableType === "DIGER"
              ? (receivableTypeOther.trim() || "DIGER")
              : receivableType)
          : effectiveInstrument.trim(),
        receivable_type: isReceivable ? receivableType : null,
        receivable_type_other: isReceivable && receivableType === "DIGER"
          ? receivableTypeOther.trim()
          : null,
        due_date: dueDate || null,
        // v1.6.22 (WP-5): çek alanları (yalnız RECEIVABLE+CEK iken gönder)
        cheque_due_date: isReceivable && receivableType === "CEK" ? (chequeDueDate || null) : null,
        cheque_collector_bank: isReceivable && receivableType === "CEK"
          ? (chequeCollectorBank.trim() || null) : null,
        cheque_no: isReceivable && receivableType === "CEK"
          ? (chequeNo.trim() || null) : null,
        // v1.6.22 (WP-5): hatırlatma alanları (her debt için)
        reminder_date: reminderDate || null,
        reminder_note: reminderNote.trim() || null,
        description: description.trim() || null,
        document_url: uploadedFiles.length > 0 ? `/files/${uploadedFiles[0].id}` : null,
        admin_only: adminOnly,
      });

      // Dosyaları borç ile ilişkilendir
      if (uploadedFiles.length > 0 && debt?.id) {
        for (const f of uploadedFiles) {
          try {
            await api.patch(`/files/${f.id}/link`, {
              entity_type: "debt",
              entity_id: debt.id,
            });
          } catch {}
        }
      }
      toast.success("Borç eklendi");
      onSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="glass-card shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-700">
          <h3 className="text-lg font-semibold text-white">
            Yeni Borc / Alacak
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-600 transition-colors"
          >
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Direction Toggle */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="label !mb-0">Tur</label>
              {/* v1.6.23.8 (DGR perspective): tooltip ile convention netleştir. */}
              <span
                className="text-[10px] text-surface-400 cursor-help group relative"
                title="Alacak = bu kişi/firma DGR'ye para verecek (alacağız, +).
Verecek = DGR bu kişi/firmaya para verecek (vereceğiz, −)."
              >
                ⓘ
                <span className="absolute left-0 top-5 hidden group-hover:block z-10 w-64 p-2 rounded-lg bg-surface-900 border border-surface-600 text-[11px] text-surface-200 shadow-lg">
                  <b>Alacak (+)</b>: bu kişi/firma DGR'ye para verecek (alacağız).
                  <br />
                  <b>Verecek (−)</b>: DGR bu kişi/firmaya para verecek (vereceğiz).
                </span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection("RECEIVABLE")}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border transition-colors ${
                  direction === "RECEIVABLE"
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                    : "bg-surface-700 border-surface-600 text-surface-400"
                }`}
              >
                <ArrowDownLeft size={16} />
                Alacak (+)
              </button>
              <button
                type="button"
                onClick={() => setDirection("PAYABLE")}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border transition-colors ${
                  direction === "PAYABLE"
                    ? "bg-red-500/15 border-red-500/40 text-red-300"
                    : "bg-surface-700 border-surface-600 text-surface-400"
                }`}
              >
                <ArrowUpRight size={16} />
                Verecek (−)
              </button>
            </div>
          </div>

          {/* Counterparty — v1.5.4: combobox (autocomplete + inline create) */}
          <CounterpartCombobox
            label={direction === "RECEIVABLE" ? "Kimden Alinacak" : "Kime Verilecek"}
            value={counterpartId}
            textValue={counterparty}
            onChange={(id, text) => {
              setCounterpartId(id);
              setCounterparty(text);
            }}
            defaultNewRole={direction === "RECEIVABLE" ? "CUSTOMER" : "SUPPLIER"}
            placeholder="Karsi firma sec, ad gir veya yeni olustur"
          />
          <p className="text-[10px] text-surface-400 -mt-2">
            Var olan karsi firmadan sec → cari hesabi otomatik takip edilir.
            Yoksa adi yaz veya yeni olustur.
          </p>

          {/* Amount */}
          <div>
            <label className="label">Tutar ({currency})</label>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
              className="input"
              placeholder="0"
            />
          </div>

          {/* v1.6.5+: Alacak Tipi — sadece RECEIVABLE direction'da. */}
          {direction === "RECEIVABLE" ? (
            <div>
              <label className="label">Alacak Tipi</label>
              <div className="flex flex-wrap gap-2">
                {RECEIVABLE_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setReceivableType(opt)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      receivableType === opt
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                        : "bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-300"
                    }`}
                  >
                    {receivableTypeLabel(opt)}
                  </button>
                ))}
              </div>
              {receivableType === "DIGER" && (
                <input
                  type="text"
                  value={receivableTypeOther}
                  onChange={(e) => setReceivableTypeOther(e.target.value)}
                  maxLength={120}
                  className="input mt-2"
                  placeholder="Alacak tipini girin (orn. doviz, hisse, vs.)"
                />
              )}
            </div>
          ) : (
            <div>
              <label className="label">Borc Tipi</label>
              <div className="flex flex-wrap gap-2">
                {[...INSTRUMENT_OPTIONS, "DIGER"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setInstrumentType(opt)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      instrumentType === opt
                        ? "bg-brand-500/15 border-brand-500/40 text-brand-300"
                        : "bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-300"
                    }`}
                  >
                    {opt === "CEK"
                      ? "Cek"
                      : opt === "SENET"
                      ? "Senet"
                      : opt === "NAKIT"
                      ? "Nakit"
                      : "Diger"}
                  </button>
                ))}
              </div>
              {instrumentType === "DIGER" && (
                <input
                  type="text"
                  value={customInstrument}
                  onChange={(e) => setCustomInstrument(e.target.value)}
                  className="input mt-2"
                  placeholder="Borc tipini girin"
                />
              )}
            </div>
          )}

          {/* Due Date */}
          <div>
            <label className="label">Vade Tarihi (Opsiyonel)</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="input"
            />
          </div>

          {/* v1.6.22 (WP-5): Çek özel alanları — yalnız RECEIVABLE + CEK iken */}
          {direction === "RECEIVABLE" && receivableType === "CEK" && (
            <div className="space-y-2 p-3 rounded-xl border border-blue-500/30 bg-blue-500/5">
              <p className="text-xs font-medium text-blue-300">Çek Bilgileri</p>
              <div>
                <label className="label text-xs">Çek Vadesi</label>
                <input
                  type="date"
                  value={chequeDueDate}
                  onChange={(e) => setChequeDueDate(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label text-xs">Tahsil Bankası</label>
                <input
                  type="text"
                  value={chequeCollectorBank}
                  onChange={(e) => setChequeCollectorBank(e.target.value)}
                  className="input"
                  maxLength={120}
                  placeholder="orn. Akbank Kadıköy"
                />
              </div>
              <div>
                <label className="label text-xs">Çek No</label>
                <input
                  type="text"
                  value={chequeNo}
                  onChange={(e) => setChequeNo(e.target.value)}
                  className="input"
                  maxLength={64}
                  placeholder="seri no"
                />
              </div>
            </div>
          )}

          {/* v1.6.22 (WP-5): Hatırlatma alanları (her debt için opsiyonel) */}
          <div className="space-y-2 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
            <p className="text-xs font-medium text-amber-300">🔔 Hatırlatma (Opsiyonel)</p>
            <div>
              <label className="label text-xs">Hatırlatma Tarihi</label>
              <input
                type="date"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label text-xs">Hatırlatma Notu</label>
              <input
                type="text"
                value={reminderNote}
                onChange={(e) => setReminderNote(e.target.value)}
                className="input"
                placeholder="orn. Vadeden 3 gun once tahsile ver"
              />
            </div>
            <p className="text-[10px] text-amber-300/70">
              Cron her sabah 09:00'da bu tarihe gelen hatırlatmaları bildirim olarak yollar.
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="label">Aciklama (Opsiyonel)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input min-h-[80px] resize-none"
              placeholder="Not ekleyin..."
            />
          </div>

          {/* Document Upload */}
          <div>
            <label className="label">
              <span className="flex items-center gap-1.5">
                <FileImage size={14} />
                Belge / Fotograf (Opsiyonel)
              </span>
            </label>
            <InlineFileUpload
              category="debt_doc"
              entityType="business"
              entityId={businessId}
              uploadedFiles={uploadedFiles}
              onUploaded={(f) => setUploadedFiles((prev) => [...prev, f])}
              onRemoveFile={(fid) => {
                setUploadedFiles((prev) => prev.filter((fl) => fl.id !== fid));
                api.delete(`/files/${fid}`).catch(() => {});
              }}
            />
          </div>

          {/* Admin Only (only for admin) */}
          {isAdmin && (
            <div className="flex items-center justify-between p-3 bg-surface-700 border border-surface-600 rounded-xl">
              <div>
                <p className="text-sm font-medium text-surface-200">
                  Sadece Admin Gorsun
                </p>
                <p className="text-xs text-surface-400">
                  Bu kayit diger kullanicilara gizli olacak
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdminOnly(!adminOnly)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  adminOnly ? "bg-brand-600" : "bg-surface-300"
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

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full"
          >
            {submitting ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </form>
      </div>
    </div>
  );
}

"use client";

/**
 * v1.7.0-beta (Bankalar WP TODO 2a4198b2 + c5ca0689): Transfer formu —
 * AddTransactionModal'ın 3. sekmesinden ve Son İşlemler widget'ından
 * (⇄ shortcut) tetiklenir.
 *
 * <p>v1.7.x (Transfer UX): Hedef hesap artık manuel input. Backend
 * external mode'da yalnız OUT tx oluşturur (kaynak bakiye düşer; paired
 * IN yok). Gelir/gider raporlarına yansımaz (kind=TRANSFER filter).</p>
 *
 * <p>Backend: {@code POST /transfers} body {to_external_name, ...}.
 * business_id JWT'den çözülür. Eligible kaynak hesaplar
 * (CHECKING/SAVINGS/CASH_HOLDER) listede; MAIN_CASH ve SUB_CASH dışta.</p>
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, AlertTriangle, ArrowLeftRight } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { cn, formatCurrency, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { BankAccountListItem, TransferDto } from "@/types";
import { DarkSelect } from "@/components/shared/DarkSelect";

interface Props {
  /** Modal compact mod (modal içinde render edilirken). */
  compact?: boolean;
  /** Submit başarılı sonrası — modal kapat + cache invalidate. */
  onSuccess?: (transfer: TransferDto) => void;
  onCancel?: () => void;
  /** Source hesap önceden seçili (Son İşlemler shortcut'ı için). */
  preselectedFromId?: string;
}

export function TransferForm({ compact = false, onSuccess, onCancel, preselectedFromId }: Props) {
  const { triggerRefresh } = useAppStore();

  const [accounts, setAccounts] = useState<BankAccountListItem[]>([]);
  const [loadingAccs, setLoadingAccs] = useState(true);
  const [fromId, setFromId] = useState<string>(preselectedFromId ?? "");
  // v1.7.x (Transfer UX): hedef = serbest metin (kişi adı / IBAN / banka)
  const [toExternalName, setToExternalName] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // WP e4dc5271 (Beta v1.4) TODO 8c2d953d: Hızlı işlemlere kaydet (TRANSFER)
  const [saveAsQuickAction, setSaveAsQuickAction] = useState(false);
  const [quickActionName, setQuickActionName] = useState("");

  useEffect(() => {
    api.get<BankAccountListItem[]>("/bank-accounts")
      .then((r) => setAccounts(r || []))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Hesap listesi yüklenemedi");
        logger.error("api", "transfer-form bank-accounts fetch failed", undefined, err);
      })
      .finally(() => setLoadingAccs(false));
  }, []);

  // Eligible: CHECKING/SAVINGS/CASH_HOLDER. MAIN_CASH ve SUB_CASH dışta.
  const eligible = useMemo(
    () => accounts.filter((a) =>
      a.is_active &&
      (a.type === "CHECKING" || a.type === "SAVINGS" || a.type === "CASH_HOLDER"),
    ),
    [accounts],
  );

  const fromAcc = useMemo(() => eligible.find((a) => a.id === fromId) || null, [eligible, fromId]);

  // Bakiye uyarı önizleme
  const parsedAmount = useMemo(() => parseMoneyInput(amount), [amount]);
  const balanceWarn = !!(fromAcc && parsedAmount > 0 && parsedAmount > (fromAcc.current_balance ?? 0));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWarning(null);
    if (!fromId) { setError("Kaynak hesabı seç"); return; }
    const trimmedTarget = toExternalName.trim();
    if (!trimmedTarget) { setError("Hedef alıcı bilgisini gir"); return; }
    if (!parsedAmount || parsedAmount <= 0) { setError("Tutar pozitif olmalı"); return; }
    setSubmitting(true);
    try {
      const dto = await api.post<TransferDto>("/transfers", {
        from_bank_account_id: fromId,
        to_external_name: trimmedTarget,
        amount: parsedAmount,
        date,
        description: description.trim() || null,
      });

      // WP e4dc5271 (Beta v1.4): Hızlı işlem olarak kaydet (TRANSFER)
      if (saveAsQuickAction && quickActionName.trim() && fromAcc) {
        try {
          await api.post("/quick-actions", {
            business_id: fromAcc.business_id,
            name: quickActionName.trim(),
            tx_template: {
              kind: "TRANSFER",
              direction: "expense", // transfer kaynak hesaptan çıkış
              amount: parsedAmount,
              payment_method: "HESAPDAN",
              from_bank_account_id: fromId,
              to_external_name: trimmedTarget,
              description: description.trim() || null,
            },
          });
        } catch (qaErr) {
          logger.warn("api", "quick-action save failed (transfer succeeded)", { err: String(qaErr) });
        }
      }

      triggerRefresh();
      if (dto.low_balance_warning) setWarning(dto.low_balance_warning);
      toast.success("Transfer tamamlandı");
      onSuccess?.(dto);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transfer oluşturulamadı");
      logger.error("api", "transfer create failed", { fromId, target: trimmedTarget, parsedAmount }, err);
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", compact && "space-y-3")}>
      {/* Info satırı — transfer semantiği (v1.7.x: external-only) */}
      <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-200 text-xs flex items-start gap-2">
        <ArrowLeftRight size={12} className="mt-0.5 shrink-0" />
        <span>
          Hesabınızdan <strong>dış hedefe</strong> çıkış. Kaynak hesap bakiyesi düşer;
          gelir/gider raporlarına yansımaz (sadece bakiye hareketi).
        </span>
      </div>

      {/* From */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">Kaynak Hesap *</label>
        {loadingAccs ? (
          <div className="h-10 v2-sunken rounded-xl animate-pulse" />
        ) : (
          <DarkSelect
            required
            value={fromId}
            onChange={setFromId}
            placeholder="Hesap seç"
            searchable={eligible.length > 6}
            options={eligible.map((a) => ({
              value: a.id,
              label: `${a.name} · ${a.bank_name || a.type}`,
              meta: formatCurrency(a.current_balance ?? 0, a.currency || "TRY"),
            }))}
            addOption={{
              label: "+ Yeni Banka Hesabı Ekle",
              onClick: () => { window.location.href = "/dashboard/hesaplar"; },
            }}
          />
        )}
        {fromAcc && (
          <p className="mt-1 text-[10px] text-[rgb(var(--v2-muted))] flex items-center gap-2 flex-wrap">
            <span>Bakiye: {formatCurrency(fromAcc.current_balance ?? 0, fromAcc.currency || "TRY")}</span>
            {fromAcc.owner_my_company_name && (
              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300">
                🏢 {fromAcc.owner_my_company_name}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Hedef göstergesi */}
      <div className="flex justify-center -my-1">
        <ArrowRight size={16} className="text-[rgb(var(--v2-muted))]" />
      </div>

      {/* To — v1.7.x: serbest metin */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">
          Hedef (Alıcı) *
        </label>
        <input
          type="text"
          value={toExternalName}
          onChange={(e) => setToExternalName(e.target.value)}
          placeholder="Kişi adı, IBAN veya banka hesabı"
          required
          maxLength={200}
          className="field field-sm py-2.5"
        />
        <p className="mt-1 text-[10px] text-[rgb(var(--v2-muted))]">
          Sistem dışı hedef — yalnız bakiye hareketi olarak kaydedilir.
        </p>
      </div>

      {/* Amount */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">Tutar *</label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
            placeholder="0"
            required
            className="field py-3 text-2xl font-bold pr-16"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--v2-muted))] font-medium">
            {fromAcc?.currency || "TRY"}
          </span>
        </div>
        {balanceWarn && (
          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1">
            <AlertTriangle size={10} />
            Bakiye yetersiz; transfer yine yapılır, kaynak hesap negatife düşer.
          </p>
        )}
      </div>

      {/* Date */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">Tarih *</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="field field-sm py-2.5"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">Açıklama</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Opsiyonel — iki tx'in de aynı açıklaması olur"
          className="field field-sm py-2.5"
        />
      </div>

      {/* WP e4dc5271 (Beta v1.4) TODO 8c2d953d: Hızlı işlemlere kaydet */}
      <div className="rounded-xl v2-sunken p-3 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={saveAsQuickAction}
            onChange={(e) => setSaveAsQuickAction(e.target.checked)}
            className="checkbox cursor-pointer"
          />
          <span className="text-sm font-medium text-[rgb(var(--v2-ink))]">
            ⚡ Bu transferi hızlı işlemlere kaydet
          </span>
        </label>
        {saveAsQuickAction && (
          <div className="pl-6 space-y-1">
            <input
              type="text"
              value={quickActionName}
              onChange={(e) => setQuickActionName(e.target.value)}
              placeholder='Örn: "Aylık Kira Ödemesi"'
              maxLength={100}
              className="field-sm"
            />
            <p className="text-[10px] text-[rgb(var(--v2-muted))]">
              Sonraki sefer tek tıkla aynı transferi tekrar oluştur.
            </p>
          </div>
        )}
      </div>

      {warning && (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-200 text-xs">
          {warning}
        </div>
      )}
      {error && (
        <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="btn-secondary flex-1 py-2.5 text-sm"
          >
            Vazgeç
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || (saveAsQuickAction && !quickActionName.trim())}
          className="v2-btn v2-btn--ink flex-1 py-2.5 text-sm gap-2 inline-flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          <ArrowLeftRight size={14} />
          Transfer Et
        </button>
      </div>
    </form>
  );
}

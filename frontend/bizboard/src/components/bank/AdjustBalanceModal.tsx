"use client";

/**
 * Bankalar WP (bakiye düzeltme): Banka / Alt Kasa / Kişide tutulan nakit
 * bakiyesinin ADMIN tarafından doğrudan düzeltilmesi (mutabakat).
 *
 * <p><b>STRICT finansal kural:</b> Bu düzeltme bir gelir/gider DEĞİLDİR — fark
 * Transaction olarak yaratılmaz, gelir/gider raporlarına yansımaz. Yalnız
 * cached bakiye gerçek banka ekstresiyle eşitlenir. Açıklama zorunlu; her
 * düzeltme backend'de audit log'a yazılır.</p>
 *
 * <p>Sadece <b>admin</b> kullanıcıya gösterilir (parent buton da admin-gated).
 * Modal {@code createPortal(document.body)} ile render edilir — AddTransactionModal
 * deseni: ata {@code .v2-card} backdrop-filter'ı fixed konumu bozar, portal
 * ile overlay her zaman viewport'a göre tam-ekran ortalı kalır.</p>
 *
 * <p>Aggregate tipler (MAIN_CASH/SUB_CASH) kendi bakiyesini tutmaz — değeri üye
 * hesapların toplamıdır. Bu tiplerde backend 409 döner; bu yüzden parent bu
 * tipler için aksiyonu açmaz ama defansif olarak modal yine de net hata gösterir.</p>
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Scale, AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { BankAccountListItem } from "@/types";

interface Props {
  /** null ise modal kapalı. */
  account: BankAccountListItem | null;
  onClose: () => void;
  /** Başarılı düzeltme sonrası — parent listeyi refresh etmeli. */
  onAdjusted?: () => void;
}

export function AdjustBalanceModal({ account, onClose, onAdjusted }: Props) {
  const open = !!account;
  const currency = account?.currency || "TRY";

  const [newBalanceStr, setNewBalanceStr] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SSR-safe portal: yalnız client mount sonrası.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Açıldığında formu hesabın mevcut bakiyesiyle prefill et.
  useEffect(() => {
    if (account) {
      setNewBalanceStr(String(account.current_balance ?? 0));
      setDescription("");
      setError(null);
      setSubmitting(false);
    }
  }, [account]);

  // Esc → kapat
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const oldBalance = account?.current_balance ?? 0;
  const parsedNew = useMemo(() => {
    const n = Number(newBalanceStr.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }, [newBalanceStr]);
  const diff = parsedNew !== null ? parsedNew - oldBalance : null;

  const descTrimmed = description.trim();
  const valid =
    parsedNew !== null &&
    descTrimmed.length >= 3 &&
    diff !== null &&
    diff !== 0;

  async function submit() {
    if (!account || !valid || parsedNew === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/bank-accounts/${account.id}/adjust-balance`, {
        new_balance: parsedNew,
        description: descTrimmed,
      });
      toast.success("Bakiye düzeltildi");
      onAdjusted?.();
      onClose();
    } catch (err) {
      let msg = "Bakiye düzeltilemedi";
      if (err instanceof ApiError) {
        if (err.status === 403) msg = "Bu işlem için yönetici yetkisi gerekiyor.";
        else if (err.status === 404) msg = "Hesap bulunamadı veya erişim yok.";
        else if (err.message) msg = err.message;
      }
      setError(msg);
      logger.error("api", "bank-account adjust-balance failed", { id: account.id }, err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !mounted || !account) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="v2-card w-full max-w-md max-h-[92vh] overflow-hidden flex flex-col"
      >
        <div className="modal-header">
          <h3 className="modal-title flex items-center gap-2">
            <Scale size={16} className="text-accent-strong dark:text-accent" />
            Bakiyeyi Düzelt
          </h3>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
            aria-label="Kapat">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Hesap özeti */}
          <div className="rounded-xl v2-sunken p-3">
            <p className="text-sm font-semibold text-[rgb(var(--v2-ink))] truncate">{account.name}</p>
            <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">
              {account.type}
              {account.business_name ? ` · ${account.business_name}` : ""}
              {account.type === "CASH_HOLDER" && account.holder_person_name
                ? ` · ${account.holder_person_name}`
                : ""}
            </p>
          </div>

          {/* Mevcut bakiye (salt-okunur) */}
          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-muted))] mb-1.5">
              Mevcut Bakiye
            </label>
            <div className="field cursor-not-allowed select-none text-[rgb(var(--v2-ink))] font-mono">
              {formatCurrency(oldBalance, currency)}
            </div>
          </div>

          {/* Yeni bakiye */}
          <div>
            <label htmlFor="adjust-new-balance" className="block text-xs font-medium text-[rgb(var(--v2-muted))] mb-1.5">
              Yeni Bakiye <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                id="adjust-new-balance"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={newBalanceStr}
                onChange={(e) => setNewBalanceStr(e.target.value)}
                className={cn("field pr-12 font-mono", parsedNew === null && newBalanceStr !== "" && "field-error")}
                placeholder="0.00"
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[rgb(var(--v2-muted))] pointer-events-none">
                {currency}
              </span>
            </div>
          </div>

          {/* Fark önizlemesi */}
          {diff !== null && (
            <div
              className={cn(
                "rounded-xl border p-3 flex items-center justify-between gap-2",
                diff === 0
                  ? "v2-sunken text-[rgb(var(--v2-muted))]"
                  : diff > 0
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                  : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300",
              )}
            >
              <span className="text-xs font-medium">Fark</span>
              <span className="text-sm font-semibold font-mono">
                {diff > 0 ? "+" : ""}
                {formatCurrency(diff, currency)}
              </span>
            </div>
          )}

          {/* Açıklama (zorunlu) */}
          <div>
            <label htmlFor="adjust-desc" className="block text-xs font-medium text-[rgb(var(--v2-muted))] mb-1.5">
              Açıklama / Gerekçe <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <textarea
              id="adjust-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={1000}
              className="field resize-none"
              placeholder="Örn. Banka ekstresiyle mutabakat — sisteme girilmemiş faiz işlemi."
            />
            <p className="text-[10px] text-[rgb(var(--v2-muted))] mt-1">
              Gerekçesiz bakiye değişikliği yapılamaz. Bu düzeltme audit kaydına yazılır.
            </p>
          </div>

          {/* STRICT uyarı: gelir/gider'e yansımaz */}
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2">
            <ShieldAlert size={15} className="text-amber-300 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-200 leading-relaxed">
              Bu düzeltme bir <strong>gelir/gider oluşturmaz</strong>. Fark, raporlara
              veya kasa gelir-gider akışına yansımaz — yalnızca hesabın bakiyesi gerçek
              değerle eşitlenir (mutabakat).
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-sm p-3 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="modal-footer justify-end">
          <button type="button" onClick={onClose} disabled={submitting} className="btn-secondary !px-4 !py-2 text-sm">
            Vazgeç
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || submitting}
            className="v2-btn v2-btn--ink !px-4 !py-2 text-sm gap-2"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Bakiyeyi Düzelt
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

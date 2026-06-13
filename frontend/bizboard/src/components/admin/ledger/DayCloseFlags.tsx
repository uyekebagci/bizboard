"use client";

/**
 * (Düşük öncelik) Gün-kapanışı admin bayrakları + backfill/migrate.
 *
 * <p>{@code AdminDayCloseController} uçları: global backdate-flag toggle,
 * per-business enforce-flag toggle, CLOSE_SYNC dayopen-backfill (dry-run/gerçek)
 * ve CashClosing→DayClose migrate (dry-run/gerçek). Backfill/migrate destructive
 * (gerçek modda) → onay modalı page tarafından sarılır; burada sadece tetikleyici
 * callback'leri expose edilir.</p>
 */

import { useEffect, useState } from "react";
import { Flag, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import {
  getBackdateFlag,
  getEnforceFlag,
  setBackdateFlag,
  setEnforceFlag,
} from "@/lib/api/admin-ledger";
import type { Business } from "@/types";
import { Toggle } from "./Toggle";

export function DayCloseFlags({
  businesses,
  selectedBusinessId,
  onSelectBusiness,
  onRunBackfill,
  onRunMigrate,
}: {
  businesses: Business[];
  selectedBusinessId: string;
  onSelectBusiness: (id: string) => void;
  onRunBackfill: (dryRun: boolean) => void;
  onRunMigrate: (dryRun: boolean) => void;
}) {
  const [backdate, setBackdate] = useState<boolean | null>(null);
  const [enforce, setEnforce] = useState<boolean | null>(null);
  const [savingBackdate, setSavingBackdate] = useState(false);
  const [savingEnforce, setSavingEnforce] = useState(false);

  useEffect(() => {
    getBackdateFlag()
      .then((f) => setBackdate(f.enabled))
      .catch((e) => toast.error(getErrorMessage(e)));
  }, []);

  useEffect(() => {
    if (!selectedBusinessId) {
      setEnforce(null);
      return;
    }
    setEnforce(null);
    getEnforceFlag(selectedBusinessId)
      .then((f) => setEnforce(f.enabled))
      .catch((e) => toast.error(getErrorMessage(e)));
  }, [selectedBusinessId]);

  async function toggleBackdate(next: boolean) {
    setSavingBackdate(true);
    try {
      const f = await setBackdateFlag(next);
      setBackdate(f.enabled);
      toast.success(`Backdate ${f.enabled ? "açıldı" : "kapatıldı"}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSavingBackdate(false);
    }
  }

  async function toggleEnforce(next: boolean) {
    if (!selectedBusinessId) return;
    setSavingEnforce(true);
    try {
      const f = await setEnforceFlag(selectedBusinessId, next);
      setEnforce(f.enabled);
      toast.success(`Gün-açılışı zorunluluğu ${f.enabled ? "açıldı" : "kapatıldı"}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSavingEnforce(false);
    }
  }

  return (
    <div className="v2-card p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <ShieldCheck size={18} className="text-accent-strong dark:text-accent" />
        <h2 className="text-sm font-bold text-[rgb(var(--v2-ink))]">
          Gün-Kapanışı Bayrakları
        </h2>
      </div>

      {/* Global backdate flag */}
      <div className="flex items-center justify-between gap-3 py-2.5 border-b border-[rgb(var(--v2-border))]">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[rgb(var(--v2-ink))] inline-flex items-center gap-1.5">
            <Flag size={14} /> Backdate (geçmiş tarih kapanışı)
          </div>
          <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">
            §4.1 global kapı — kapalıyken geçmiş-tarihli kapanış engellenir.
          </p>
        </div>
        {backdate == null ? (
          <Loader2 size={16} className="animate-spin text-[rgb(var(--v2-muted))]" />
        ) : (
          <Toggle
            checked={backdate}
            disabled={savingBackdate}
            onChange={toggleBackdate}
            ariaLabel="Backdate bayrağı"
          />
        )}
      </div>

      {/* Per-business enforce flag */}
      <div className="py-3 border-b border-[rgb(var(--v2-border))]">
        <label
          htmlFor="dc-flag-business"
          className="block text-[11px] font-medium text-[rgb(var(--v2-muted))] mb-1.5"
        >
          İşletme (enforce bayrağı için)
        </label>
        <select
          id="dc-flag-business"
          value={selectedBusinessId}
          onChange={(e) => onSelectBusiness(e.target.value)}
          className="input w-full mb-3"
        >
          <option value="">— İşletme seçin —</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        {selectedBusinessId && (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-[rgb(var(--v2-ink))]">
                Gün-açılışı zorunluluğu
              </div>
              <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">
                Açıkken işlem girişi için gün-açılışı şart (per-business).
              </p>
            </div>
            {enforce == null ? (
              <Loader2 size={16} className="animate-spin text-[rgb(var(--v2-muted))]" />
            ) : (
              <Toggle
                checked={enforce}
                disabled={savingEnforce}
                onChange={toggleEnforce}
                ariaLabel="Gün-açılışı zorunluluğu"
              />
            )}
          </div>
        )}
      </div>

      {/* Backfill / migrate buttons */}
      <div className="pt-4 space-y-3">
        <FlagRunGroup
          title="Gün-açılışı backfill (CLOSE_SYNC)"
          hint="Idempotent + reversible. Önce dry-run önerilir."
          onDry={() => onRunBackfill(true)}
          onReal={() => onRunBackfill(false)}
        />
        <FlagRunGroup
          title="CashClosing → DayClose migrate"
          hint="Idempotent + reversible. Önce dry-run önerilir."
          onDry={() => onRunMigrate(true)}
          onReal={() => onRunMigrate(false)}
        />
      </div>
    </div>
  );
}

function FlagRunGroup({
  title,
  hint,
  onDry,
  onReal,
}: {
  title: string;
  hint: string;
  onDry: () => void;
  onReal: () => void;
}) {
  return (
    <div className="v2-sunken rounded-xl p-3">
      <div className="text-sm font-medium text-[rgb(var(--v2-ink))]">{title}</div>
      <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5 mb-2.5">{hint}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDry}
          className="text-xs px-3 py-1.5 rounded-lg v2-card text-[rgb(var(--v2-ink))] hover:opacity-80 transition-opacity font-medium"
        >
          Dry-run
        </button>
        <button
          type="button"
          onClick={onReal}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors font-semibold"
        >
          Gerçek çalıştır
        </button>
      </div>
    </div>
  );
}

export default DayCloseFlags;

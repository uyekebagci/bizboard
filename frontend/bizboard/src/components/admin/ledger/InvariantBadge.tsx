"use client";

/**
 * Invariant durum rozeti — Σ=0 ledger sağlık göstergesi.
 *
 * <p>{@code ok=true} → yeşil "Dengeli", aksi halde kırmızı "Sapma var" + mismatch
 * sayısı. Yüklenirken spinner, hata olunca uyarı. Detay: checked/matched +
 * unbalanced entry + ilk birkaç mismatch satırı.</p>
 */

import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Scale } from "lucide-react";
import type { InvariantReport } from "@/lib/api/admin-ledger";

export function InvariantBadge({
  report,
  loading,
  error,
  onRefresh,
}: {
  report: InvariantReport | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const ok = report?.ok ?? false;

  return (
    <div className="v2-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <Scale size={18} className="text-accent-strong dark:text-accent" />
          <h2 className="text-sm font-bold text-[rgb(var(--v2-ink))]">
            Bakiye Invariant (Σ=0)
          </h2>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg v2-sunken text-[rgb(var(--v2-ink))] hover:opacity-80 disabled:opacity-50 transition-opacity"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Yenile
        </button>
      </div>

      {loading && !report ? (
        <div className="py-6 flex justify-center">
          <Loader2 size={18} className="animate-spin text-[rgb(var(--v2-muted))]" />
        </div>
      ) : error ? (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : report ? (
        <>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
                ok
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-500/15 text-red-600 dark:text-red-400"
              }`}
            >
              {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              {ok ? "Dengeli" : "Sapma var"}
            </span>
            <span className="text-xs text-[rgb(var(--v2-muted))]">
              {report.matched}/{report.checked} hesap eşleşti · {report.unbalancedEntries}{" "}
              dengesiz entry · {report.mismatchCount} sapma
            </span>
          </div>

          {report.mismatches.length > 0 && (
            <div className="mt-4 v2-sunken rounded-xl overflow-hidden">
              <ul className="divide-y divide-[rgb(var(--v2-border))] max-h-56 overflow-y-auto">
                {report.mismatches.slice(0, 20).map((m, i) => (
                  <li key={`${m.accountId}-${i}`} className="px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[rgb(var(--v2-ink))] truncate">
                        {m.accountName || m.accountId}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-[rgb(var(--v2-muted))]">
                        {m.type}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[rgb(var(--v2-muted))] tabular-nums">
                      snapshot {m.snapshot} → türetilmiş {m.derived}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

export default InvariantBadge;

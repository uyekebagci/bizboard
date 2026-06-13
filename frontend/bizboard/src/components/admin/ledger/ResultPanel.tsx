"use client";

/**
 * Aksiyon sonuç paneli — son çalıştırılan ledger işleminin çıktısını gösterir.
 * Bilinen alanlar için etiketli grid, bilinmeyen rapor şekilleri için JSON
 * fallback. Yeşil (başarı) çerçeve, başlık + dismiss.
 */

import { CheckCircle2, X } from "lucide-react";

export interface ActionResult {
  title: string;
  /** Anahtar→değer (etiketli gösterim). */
  fields?: Record<string, string | number | boolean | null | undefined>;
  /** Etiketlenmemiş ham obje (JSON gösterimi). */
  raw?: unknown;
}

export function ResultPanel({
  result,
  onDismiss,
}: {
  result: ActionResult;
  onDismiss: () => void;
}) {
  const entries = result.fields ? Object.entries(result.fields) : [];

  return (
    <div className="v2-card p-5 border-l-4 border-l-emerald-500">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-[rgb(var(--v2-ink))] inline-flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-500" />
          {result.title}
        </h3>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 -mr-1 -mt-1 rounded-lg text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))] hover:bg-[rgb(var(--v2-sunken))] transition-colors"
          aria-label="Sonucu kapat"
        >
          <X size={16} />
        </button>
      </div>

      {entries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {entries.map(([k, v]) => (
            <div key={k}>
              <p className="text-[10px] uppercase tracking-wide text-[rgb(var(--v2-muted))]">
                {k}
              </p>
              <p className="text-base font-bold text-[rgb(var(--v2-ink))] mt-0.5 tabular-nums">
                {formatVal(v)}
              </p>
            </div>
          ))}
        </div>
      )}

      {result.raw != null && entries.length === 0 && (
        <pre className="v2-sunken rounded-xl p-3 text-[11px] text-[rgb(var(--v2-ink))] overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
          {JSON.stringify(result.raw, null, 2)}
        </pre>
      )}
    </div>
  );
}

function formatVal(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Evet" : "Hayır";
  return String(v);
}

export default ResultPanel;

"use client";

/**
 * Ledger v2 (Faz B, §5): Banka ekstresi PDF ÖNİZLEME / DÜZENLEME ekranı.
 *
 * <p>Akış: kullanıcı PDF yükler → backend parse-only döner (DB'ye YAZILMAZ) →
 * bu modal satırları gösterir/düzenletir → kullanıcı tek tek [Ekle] veya
 * [Tümünü Ekle] ile seçtiklerini partiye ekler; [Çıkar] ile listeden atar.
 * Eklenen satır partide PARSED olur (ledger'a/kasaya GİRMEZ — kategorile→
 * postala onayı sayfada devam eder). Çift tema (Daxa v2).</p>
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X, Plus, Trash2, Loader2, CheckCircle2, AlertTriangle, Copy, Layers,
} from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { BankStatementParseResult, BankStatementPreviewLine } from "@/types";

/** Önizleme satırının yerel durumu (eklenmeden önce düzenlenebilir). */
type RowState = "pending" | "added" | "removed";

interface EditableRow extends BankStatementPreviewLine {
  /** Stabil yerel anahtar (parse sırası). */
  key: number;
  state: RowState;
}

interface Props {
  result: BankStatementParseResult;
  /** Seçilen satırları partiye ekler (tek elemanlı veya toplu). Eklenen sayıyı döndürür. */
  onAdd: (lines: BankStatementPreviewLine[]) => Promise<number>;
  onClose: () => void;
}

export function BankStatementPreviewModal({ result, onAdd, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, dialogRef);

  const [rows, setRows] = useState<EditableRow[]>(() =>
    (result.lines ?? []).map((l, i) => ({
      ...l,
      key: i,
      // Çift satır varsayılan olarak "çıkar" önerilir (kullanıcı geri alabilir).
      state: l.is_duplicate ? "removed" : "pending",
    })),
  );
  const [busyKey, setBusyKey] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // ESC → kapat (modal-genel konvansiyon).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pending = useMemo(() => rows.filter((r) => r.state === "pending"), [rows]);
  const addedCount = useMemo(() => rows.filter((r) => r.state === "added").length, [rows]);

  function patchRow(key: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function toPayload(r: EditableRow): BankStatementPreviewLine {
    return {
      parsed_date: r.parsed_date,
      channel: r.channel,
      raw_text: r.raw_text,
      parsed_counterpart: r.parsed_counterpart,
      parsed_amount: r.parsed_amount,
      direction: r.direction,
      parsed_balance: r.parsed_balance,
      chain_ok: r.chain_ok,
      // Düzenlenmiş satırda hash değişebilir; backend boşsa yeniden hesaplar.
      // Açıklama/tutar/bakiye değiştiyse stale hash göndermemek için temizliyoruz.
      dedupe_hash: null,
      is_duplicate: r.is_duplicate,
    };
  }

  async function addOne(row: EditableRow) {
    if (!isValid(row)) { toast.info("Tutar sıfır olamaz"); return; }
    setBusyKey(row.key);
    try {
      const n = await onAdd([toPayload(row)]);
      if (n > 0) {
        patchRow(row.key, { state: "added" });
        toast.success("Satır eklendi");
      } else {
        // Backend dedupe ile atladı (parti içinde zaten var).
        patchRow(row.key, { state: "added" });
        toast.info("Satır zaten partide var — atlandı");
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setBusyKey(null);
    }
  }

  async function addAll() {
    const toAdd = pending.filter(isValid);
    if (toAdd.length === 0) { toast.info("Eklenecek satır yok"); return; }
    setBulkBusy(true);
    try {
      const n = await onAdd(toAdd.map(toPayload));
      setRows((prev) =>
        prev.map((r) => (r.state === "pending" && isValid(r) ? { ...r, state: "added" } : r)),
      );
      toast.success(`${n} satır eklendi`);
    } catch (err) {
      toast.error(err);
    } finally {
      setBulkBusy(false);
    }
  }

  const chainWarn = !result.chain_consistent || result.flagged_count > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bank-preview-title"
    >
      <div ref={dialogRef} className="v2-card shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="modal-header">
          <div className="min-w-0">
            <h3 id="bank-preview-title" className="text-lg font-semibold text-[rgb(var(--v2-ink))]">
              Ekstre Önizleme
            </h3>
            <p className="text-xs text-[rgb(var(--v2-muted))]">
              {result.parsed_count} hareket okundu — eklemek istediklerinizi seçin
            </p>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Özet bandı */}
        <div className="px-5 pt-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {result.opening_balance != null && (
              <span className="px-2 py-1 rounded-lg bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))]">
                Devreden bakiye: <span className="font-semibold num text-[rgb(var(--v2-ink))]">{formatCurrency(result.opening_balance, "TRY")}</span>
              </span>
            )}
            <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              {pending.length} bekleyen
            </span>
            {addedCount > 0 && (
              <span className="px-2 py-1 rounded-lg bg-[rgb(var(--accent))]/15 text-accent">
                {addedCount} eklendi
              </span>
            )}
            {result.duplicate_count > 0 && (
              <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-center gap-1">
                <Copy size={11} /> {result.duplicate_count} çift
              </span>
            )}
          </div>

          {chainWarn && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/25">
              <AlertTriangle size={15} className="text-red-700 dark:text-red-300 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-700 dark:text-red-300">
                Bakiye zinciri bazı satırlarda tutmadı — bu satırlar
                <span className="font-semibold"> işaretli</span> gelir ve eklenince
                <span className="font-semibold"> açıklanamayan (FLAGGED)</span> olur.
                Tutar/açıklama parse hatalıysa eklemeden önce düzeltin.
              </p>
            </div>
          )}
        </div>

        {/* Satır tablosu */}
        <div className="px-5 py-3 overflow-y-auto flex-1">
          <div className="v2-card divide-y divide-[rgb(var(--v2-border))]">
            {rows.length === 0 ? (
              <p className="p-4 text-sm text-[rgb(var(--v2-muted))]">Okunan hareket yok.</p>
            ) : (
              rows.map((r) => (
                <PreviewRow key={r.key} row={r}
                  busy={busyKey === r.key}
                  onPatch={(patch) => patchRow(r.key, patch)}
                  onAdd={() => addOne(r)}
                  onRemove={() => patchRow(r.key, { state: "removed" })}
                  onRestore={() => patchRow(r.key, { state: "pending" })} />
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer flex items-center justify-between gap-3">
          <p className="text-[11px] text-[rgb(var(--v2-muted))]">
            Eklenen satırlar partide görünür; kategorile → postala adımı orada devam eder.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">
              {addedCount > 0 ? "Bitti" : "İptal"}
            </button>
            <button onClick={addAll} disabled={bulkBusy || pending.length === 0}
              className="v2-btn v2-btn--accent px-4 py-2 text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50">
              {bulkBusy ? <Loader2 size={15} className="animate-spin" /> : <Layers size={15} />}
              Tümünü Ekle ({pending.filter(isValid).length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Tek önizleme satırı: düzenlenebilir (açıklama/tutar/karşı taraf) + Ekle/Çıkar. */
function PreviewRow({ row, busy, onPatch, onAdd, onRemove, onRestore }: {
  row: EditableRow;
  busy: boolean;
  onPatch: (patch: Partial<EditableRow>) => void;
  onAdd: () => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  const added = row.state === "added";
  const removed = row.state === "removed";
  const negative = row.parsed_amount < 0;

  return (
    <div className={cn("p-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3",
      added && "opacity-60", removed && "opacity-40")}>
      {/* Sol: tarih + bakiye + uyarılar */}
      <div className="sm:w-28 shrink-0">
        <p className="text-xs text-[rgb(var(--v2-ink))]">{row.parsed_date ?? "—"}</p>
        {row.parsed_balance != null && (
          <p className="text-[10px] text-[rgb(var(--v2-muted))] num">
            Bakiye: {formatCurrency(row.parsed_balance, "TRY")}
          </p>
        )}
        <div className="flex flex-wrap gap-1 mt-1">
          {!row.chain_ok && (
            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/25">
              Zincir?
            </span>
          )}
          {row.is_duplicate && (
            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
              Çift
            </span>
          )}
        </div>
      </div>

      {/* Orta: düzenlenebilir alanlar */}
      <div className="flex-1 min-w-0 grid grid-cols-12 gap-2">
        <input
          type="text"
          value={row.raw_text ?? ""}
          onChange={(e) => onPatch({ raw_text: e.target.value })}
          disabled={added || removed}
          className="field field-sm py-1.5 col-span-12 text-xs disabled:opacity-60"
          placeholder="Açıklama"
        />
        <input
          type="text"
          value={row.parsed_counterpart ?? ""}
          onChange={(e) => onPatch({ parsed_counterpart: e.target.value })}
          disabled={added || removed}
          className="field field-sm py-1.5 col-span-7 text-xs disabled:opacity-60"
          placeholder="Karşı taraf"
        />
        <div className={cn("col-span-5 flex items-center rounded-lg border px-2",
          negative ? "border-red-500/30" : "border-emerald-500/30",
          (added || removed) && "opacity-60")}>
          <span className={cn("text-xs font-semibold shrink-0",
            negative ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300")}>
            {negative ? "−" : "+"}
          </span>
          <input
            type="number"
            step="0.01"
            value={Math.abs(row.parsed_amount)}
            onChange={(e) => {
              const mag = Math.abs(parseFloat(e.target.value) || 0);
              onPatch({ parsed_amount: negative ? -mag : mag });
            }}
            disabled={added || removed}
            className="w-full bg-transparent outline-none text-xs num text-[rgb(var(--v2-ink))] py-1.5 text-right disabled:opacity-60"
          />
        </div>
      </div>

      {/* Sağ: aksiyonlar */}
      <div className="flex sm:flex-col items-center justify-end gap-1.5 sm:w-24 shrink-0">
        {added ? (
          <span className="text-[10px] uppercase px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 flex items-center gap-1">
            <CheckCircle2 size={12} /> Eklendi
          </span>
        ) : removed ? (
          <button onClick={onRestore}
            className="text-[11px] px-2 py-1.5 rounded-lg bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]">
            Geri al
          </button>
        ) : (
          <>
            <button onClick={onAdd} disabled={busy} title="Bu satırı ekle"
              className="v2-btn v2-btn--accent px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1 disabled:opacity-50 w-full justify-center">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Ekle
            </button>
            <button onClick={onRemove} disabled={busy} title="Önizlemeden çıkar"
              className="px-2.5 py-1.5 rounded-lg bg-[rgb(var(--v2-sunken))] hover:bg-[rgb(var(--v2-border))] text-red-700 dark:text-red-300 flex items-center gap-1 text-xs w-full justify-center">
              <Trash2 size={13} /> Çıkar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Tutar sıfır olamaz (backend de reddeder). */
function isValid(r: BankStatementPreviewLine): boolean {
  return typeof r.parsed_amount === "number" && r.parsed_amount !== 0 && !Number.isNaN(r.parsed_amount);
}

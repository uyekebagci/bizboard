"use client";

/**
 * Ledger öneri uçları — SALT-OKUNUR (dry-run). Her öneri tipi ayrı sekme/aksiyon
 * altında listelenir; backend STRICT olduğu için commit YOK, yalnız görüntüleme.
 */

import { useState } from "react";
import { Lightbulb, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import {
  getDuplicateCategorySuggestions,
  getFirmBankSuggestions,
  getOperatorCategorySuggestions,
  getTypoMergeSuggestions,
  SUGGESTION_LABELS,
  type DuplicateCategorySuggestion,
  type FirmBankSuggestion,
  type OperatorCategorySuggestion,
  type SuggestionKind,
  type TypoMergeSuggestion,
} from "@/lib/api/admin-ledger";

type AnySuggestion =
  | FirmBankSuggestion
  | TypoMergeSuggestion
  | OperatorCategorySuggestion
  | DuplicateCategorySuggestion;

const KINDS: SuggestionKind[] = [
  "firm-bank",
  "typo-merge",
  "operator-categories",
  "duplicate-categories",
];

export function SuggestionsSection() {
  const [active, setActive] = useState<SuggestionKind | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AnySuggestion[]>([]);

  async function load(kind: SuggestionKind) {
    setActive(kind);
    setLoading(true);
    setItems([]);
    try {
      let data: AnySuggestion[];
      switch (kind) {
        case "firm-bank":
          data = await getFirmBankSuggestions();
          break;
        case "typo-merge":
          data = await getTypoMergeSuggestions();
          break;
        case "operator-categories":
          data = await getOperatorCategorySuggestions();
          break;
        case "duplicate-categories":
          data = await getDuplicateCategorySuggestions();
          break;
      }
      setItems(data);
    } catch (e) {
      toast.error(getErrorMessage(e));
      setActive(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="v2-card p-5">
      <div className="flex items-center gap-2.5 mb-1">
        <Lightbulb size={18} className="text-accent-strong dark:text-accent" />
        <h2 className="text-sm font-bold text-[rgb(var(--v2-ink))]">Öneriler</h2>
      </div>
      <p className="text-[11px] text-[rgb(var(--v2-muted))] mb-4">
        Salt-okunur (dry-run) — DB&apos;ye dokunmaz, otomatik uygulama yok. İncele,
        elle karar ver.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => load(kind)}
            disabled={loading}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
              active === kind
                ? "bg-accent/16 text-accent-strong dark:text-accent"
                : "v2-sunken text-[rgb(var(--v2-ink))] hover:opacity-80"
            }`}
          >
            {SUGGESTION_LABELS[kind]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 size={18} className="animate-spin text-[rgb(var(--v2-muted))]" />
        </div>
      ) : active && items.length === 0 ? (
        <p className="text-sm text-[rgb(var(--v2-muted))] py-4 text-center">
          Bu kategoride öneri yok.
        </p>
      ) : active ? (
        <SuggestionList kind={active} items={items} />
      ) : (
        <p className="text-sm text-[rgb(var(--v2-muted))] py-4 text-center">
          Listelemek için yukarıdan bir öneri tipi seçin.
        </p>
      )}
    </div>
  );
}

function SuggestionList({
  kind,
  items,
}: {
  kind: SuggestionKind;
  items: AnySuggestion[];
}) {
  return (
    <div className="v2-sunken rounded-xl overflow-hidden">
      <ul className="divide-y divide-[rgb(var(--v2-border))] max-h-72 overflow-y-auto text-xs">
        {items.map((it, i) => (
          <li key={i} className="px-3 py-2.5">
            <SuggestionRow kind={kind} item={it} />
          </li>
        ))}
      </ul>
      <div className="px-3 py-1.5 text-[10px] text-[rgb(var(--v2-muted))] border-t border-[rgb(var(--v2-border))]">
        {items.length} öneri
      </div>
    </div>
  );
}

function SuggestionRow({
  kind,
  item,
}: {
  kind: SuggestionKind;
  item: AnySuggestion;
}) {
  if (kind === "firm-bank") {
    const s = item as FirmBankSuggestion;
    return (
      <div>
        <div className="font-medium text-[rgb(var(--v2-ink))] truncate">
          {s.originalName}
        </div>
        <div className="text-[rgb(var(--v2-muted))] mt-0.5">
          firma: <span className="text-[rgb(var(--v2-ink))]">{s.suggestedFirm || "—"}</span>{" "}
          · banka: <span className="text-[rgb(var(--v2-ink))]">{s.suggestedBank || "—"}</span>
        </div>
      </div>
    );
  }
  if (kind === "typo-merge") {
    const s = item as TypoMergeSuggestion;
    return (
      <div>
        <div className="font-medium text-[rgb(var(--v2-ink))]">{s.canonical}</div>
        <div className="text-[rgb(var(--v2-muted))] mt-0.5">
          {s.variants.length} varyant: {s.variants.join(", ")}
        </div>
      </div>
    );
  }
  if (kind === "operator-categories") {
    const s = item as OperatorCategorySuggestion;
    return (
      <div>
        <div className="font-medium text-[rgb(var(--v2-ink))] truncate">
          {s.categoryName}
        </div>
        <div className="text-[rgb(var(--v2-muted))] mt-0.5">
          → {s.suggestedTargetType}: {s.suggestedTargetName || "—"} · {s.txCount} işlem
        </div>
      </div>
    );
  }
  const s = item as DuplicateCategorySuggestion;
  return (
    <div>
      <div className="font-medium text-[rgb(var(--v2-ink))] truncate">
        {s.normalizedName}
      </div>
      <div className="text-[rgb(var(--v2-muted))] mt-0.5">
        {s.count} mükerrer · {s.names}
      </div>
    </div>
  );
}

export default SuggestionsSection;

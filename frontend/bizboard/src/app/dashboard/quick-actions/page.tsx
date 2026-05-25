"use client";

/**
 * WP e4dc5271 (Beta v1.4) TODO 82ace2f9 + 6989b84b: Hızlı İşlemler yönetim sayfası.
 *
 * <p>Liste + grid görünümü, arama + tip filtresi, drag-drop sıralama,
 * duplicate, sil, yeniden adlandır.</p>
 *
 * <p>Manuel ekleme spec'te opsiyonel — bu MVP'de skip. Kullanıcı tx
 * formundan toggle ile şablon oluşturur.</p>
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Zap, Search, X, Trash2, Pencil, Copy, GripVertical,
  LayoutGrid, List as ListIcon, ArrowDownLeft, ArrowUpRight, CreditCard,
  ArrowLeftRight, AlertTriangle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, cn } from "@/lib/utils";
import { useBusinesses } from "@/hooks/useBusinesses";
import { useAppStore } from "@/lib/store";
import type { QuickActionListItem, QuickActionTemplate } from "@/types";
import { QuickActionExecuteModal } from "@/components/business/dashboard/QuickActionExecuteModal";
import { DarkSelect } from "@/components/shared/DarkSelect";

type ViewMode = "list" | "grid";
const VIEW_KEY = "quickActions.viewMode";

type TypeFilter = "ALL" | "INCOME" | "EXPENSE" | "TRANSFER" | "POS";

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "ALL", label: "Tümü" },
  { key: "INCOME", label: "Gelir" },
  { key: "EXPENSE", label: "Gider" },
  { key: "POS", label: "POS" },
  { key: "TRANSFER", label: "Transfer" },
];

export default function QuickActionsManagePage() {
  const router = useRouter();
  const { triggerRefresh } = useAppStore();
  const { businesses, isLoading: bizLoading } = useBusinesses();

  const [selectedBiz, setSelectedBiz] = useState<string>("");
  const [items, setItems] = useState<QuickActionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [view, setView] = useState<ViewMode>("list");
  const [executeTarget, setExecuteTarget] = useState<QuickActionListItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // İlk işletme seçimi + localStorage view
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(VIEW_KEY) as ViewMode | null;
    if (stored === "list" || stored === "grid") setView(stored);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_KEY, view);
    }
  }, [view]);
  useEffect(() => {
    if (businesses && businesses.length > 0 && !selectedBiz) {
      setSelectedBiz(businesses[0].id);
    }
  }, [businesses, selectedBiz]);

  async function refresh() {
    if (!selectedBiz) return;
    setLoading(true);
    try {
      const r = await api.get<QuickActionListItem[]>(
        `/quick-actions?business_id=${selectedBiz}`,
      );
      setItems(r || []);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Liste yüklenemedi");
      logger.error("api", "quick-actions list fetch failed", { selectedBiz }, err);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, [selectedBiz]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((qa) => {
      const t = qa.tx_template;
      if (typeFilter !== "ALL") {
        if (typeFilter === "INCOME" && t.direction !== "income") return false;
        if (typeFilter === "EXPENSE" && t.direction !== "expense") return false;
        if (typeFilter === "TRANSFER" && t.kind !== "TRANSFER") return false;
        if (typeFilter === "POS" && t.payment_method !== "POS") return false;
      }
      if (q && !qa.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, typeFilter]);

  async function handleDelete(qa: QuickActionListItem) {
    if (!confirm(`"${qa.name}" silinsin mi?`)) return;
    setBusyId(qa.id);
    try {
      await api.delete(`/quick-actions/${qa.id}`);
      await refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Silinemedi");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRename(qa: QuickActionListItem) {
    const newName = prompt("Yeni ad:", qa.name);
    if (!newName || newName.trim() === qa.name) return;
    setBusyId(qa.id);
    try {
      await api.patch(`/quick-actions/${qa.id}`, { name: newName.trim() });
      await refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Yeniden adlandırma başarısız");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDuplicate(qa: QuickActionListItem) {
    setBusyId(qa.id);
    try {
      // İsim çakışmasını önlemek için " (Kopya)" eki + numaralama
      let candidate = `${qa.name} (Kopya)`;
      let i = 2;
      while (items.some((it) => it.name === candidate)) {
        candidate = `${qa.name} (Kopya ${i})`;
        i++;
      }
      await api.post("/quick-actions", {
        business_id: qa.business_id,
        name: candidate,
        tx_template: qa.tx_template,
        icon: qa.icon,
        color: qa.color,
      });
      await refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Kopya oluşturulamadı");
    } finally {
      setBusyId(null);
    }
  }

  // Drag-drop reorder
  async function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = items.findIndex((it) => it.id === dragId);
    const toIdx = items.findIndex((it) => it.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;

    // Optimistic reorder
    const next = [...items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    // order_index'leri 0..N-1 yeniden ata
    const reordered = next.map((it, i) => ({ ...it, order_index: i }));
    setItems(reordered);
    setDragId(null);
    setDragOverId(null);

    // Backend'e yansıt — sıralama değişen tüm item'ları PATCH et
    try {
      await Promise.all(
        reordered.map((it, i) =>
          items[i]?.id !== it.id || items[i]?.order_index !== i
            ? api.patch(`/quick-actions/${it.id}`, { order_index: i })
            : null,
        ),
      );
    } catch (err) {
      // Revert on failure
      await refresh();
      alert(err instanceof ApiError ? err.message : "Sıralama kaydedilemedi");
    }
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
          >
            <ArrowLeft size={20} className="text-surface-300" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white inline-flex items-center gap-2">
              <Zap size={18} className="text-amber-400" />
              Hızlı İşlemler
            </h1>
            <p className="text-xs text-surface-400">
              Sık kullandığın tx şablonlarını yönet — drag-drop ile sırala, sağ klikle düzenle.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl bg-surface-700 p-1">
          <button
            onClick={() => setView("list")}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              view === "list" ? "bg-surface-500 text-white" : "text-surface-400 hover:text-white",
            )}
            title="Liste"
          >
            <ListIcon size={14} />
          </button>
          <button
            onClick={() => setView("grid")}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              view === "grid" ? "bg-surface-500 text-white" : "text-surface-400 hover:text-white",
            )}
            title="Grid"
          >
            <LayoutGrid size={14} />
          </button>
        </div>
      </div>

      {/* Business selector + search + filter */}
      <section className="space-y-2.5">
        {businesses && businesses.length > 1 && (
          <div>
            <label className="text-[10px] uppercase text-surface-400 mb-1 block">İşletme</label>
            <DarkSelect
              value={selectedBiz}
              onChange={setSelectedBiz}
              placeholder={bizLoading ? "Yükleniyor..." : "Seçin"}
              searchable={businesses.length > 6}
              options={businesses.map((b) => ({ value: b.id, label: b.name }))}
            />
          </div>
        )}

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ada göre ara..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface-800 border border-surface-600 rounded-xl text-white placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-surface-700"
            >
              <X size={12} className="text-surface-400" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                typeFilter === f.key
                  ? "bg-brand-600 border-brand-500 text-white"
                  : "bg-surface-700 border-surface-600 text-surface-300 hover:text-white",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Liste / Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-surface-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <Zap size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-sm text-surface-300 font-medium">
            {items.length === 0 ? "Henüz hızlı işlem yok" : "Filtreyle eşleşen yok"}
          </p>
          {items.length === 0 && (
            <p className="text-[11px] text-surface-400 mt-2">
              Yeni işlem oluştururken &quot;Hızlı işlemlere kaydet&quot; toggle&apos;ını işaretle.
            </p>
          )}
        </div>
      ) : view === "list" ? (
        <ListView
          items={filtered}
          busyId={busyId}
          dragId={dragId}
          dragOverId={dragOverId}
          setDragId={setDragId}
          setDragOverId={setDragOverId}
          onDrop={handleDrop}
          onExecute={(qa) => setExecuteTarget(qa)}
          onRename={handleRename}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />
      ) : (
        <GridView
          items={filtered}
          busyId={busyId}
          onExecute={(qa) => setExecuteTarget(qa)}
          onRename={handleRename}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />
      )}

      {executeTarget && (
        <QuickActionExecuteModal
          quickAction={executeTarget}
          onClose={() => setExecuteTarget(null)}
          onSuccess={() => {
            setExecuteTarget(null);
            void refresh();
            triggerRefresh();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

function ListView({
  items, busyId, dragId, dragOverId, setDragId, setDragOverId, onDrop,
  onExecute, onRename, onDuplicate, onDelete,
}: {
  items: QuickActionListItem[];
  busyId: string | null;
  dragId: string | null;
  dragOverId: string | null;
  setDragId: (id: string | null) => void;
  setDragOverId: (id: string | null) => void;
  onDrop: (id: string) => void;
  onExecute: (qa: QuickActionListItem) => void;
  onRename: (qa: QuickActionListItem) => void;
  onDuplicate: (qa: QuickActionListItem) => void;
  onDelete: (qa: QuickActionListItem) => void;
}) {
  return (
    <ul className="card divide-y divide-surface-700">
      {items.map((qa) => {
        const tpl = qa.tx_template;
        const style = cardStyle(tpl);
        const Icon = style.icon;
        const isDragging = dragId === qa.id;
        const isOver = dragOverId === qa.id;
        return (
          <li
            key={qa.id}
            draggable
            onDragStart={(e) => {
              setDragId(qa.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragId && dragId !== qa.id) setDragOverId(qa.id);
            }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(qa.id);
            }}
            onDragEnd={() => { setDragId(null); setDragOverId(null); }}
            className={cn(
              "px-3 py-2.5 flex items-center gap-2.5 transition-colors",
              isDragging && "opacity-40",
              isOver && "bg-brand-500/10",
            )}
          >
            <GripVertical size={14} className="text-surface-500 cursor-move shrink-0" />
            <Icon size={14} className={cn("shrink-0", style.iconClass)} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{qa.name}</p>
              <p className="text-[11px] text-surface-400 truncate">
                {summaryBadge(tpl)}
                {qa.last_used_at && (
                  <> · {qa.usage_count} kez kullanıldı</>
                )}
              </p>
            </div>
            <p className={cn("text-sm font-semibold shrink-0", style.amountClass)}>
              {tpl.amount != null ? formatCurrency(tpl.amount, "TRY") : "—"}
            </p>
            <button
              type="button"
              onClick={() => onExecute(qa)}
              disabled={busyId === qa.id}
              className="px-2.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold disabled:opacity-50"
            >
              Yarat
            </button>
            <RowMenu
              onRename={() => onRename(qa)}
              onDuplicate={() => onDuplicate(qa)}
              onDelete={() => onDelete(qa)}
            />
          </li>
        );
      })}
    </ul>
  );
}

function RowMenu({
  onRename, onDuplicate, onDelete,
}: {
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-1.5 rounded-md hover:bg-surface-700 text-surface-400 hover:text-surface-200"
      >
        <Pencil size={13} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-44 rounded-lg border border-surface-600 bg-surface-800 shadow-xl py-1">
            <button onClick={() => { onRename(); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-700 inline-flex items-center gap-2">
              <Pencil size={11} /> Yeniden Adlandır
            </button>
            <button onClick={() => { onDuplicate(); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-700 inline-flex items-center gap-2">
              <Copy size={11} /> Kopyala
            </button>
            <button onClick={() => { onDelete(); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 inline-flex items-center gap-2">
              <Trash2 size={11} /> Sil
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function GridView({
  items, busyId, onExecute, onRename, onDuplicate, onDelete,
}: {
  items: QuickActionListItem[];
  busyId: string | null;
  onExecute: (qa: QuickActionListItem) => void;
  onRename: (qa: QuickActionListItem) => void;
  onDuplicate: (qa: QuickActionListItem) => void;
  onDelete: (qa: QuickActionListItem) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((qa) => {
        const tpl = qa.tx_template;
        const style = cardStyle(tpl);
        const Icon = style.icon;
        return (
          <div
            key={qa.id}
            className={cn(
              "rounded-xl border-2 bg-surface-800/60 p-3",
              style.borderClass,
            )}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <Icon size={16} className={style.iconClass} />
              <RowMenu
                onRename={() => onRename(qa)}
                onDuplicate={() => onDuplicate(qa)}
                onDelete={() => onDelete(qa)}
              />
            </div>
            <p className="text-xs font-semibold text-white truncate" title={qa.name}>{qa.name}</p>
            <p className={cn("text-base font-bold mt-0.5", style.amountClass)}>
              {tpl.amount != null ? formatCurrency(tpl.amount, "TRY") : "—"}
            </p>
            <p className="text-[10px] text-surface-400 mt-1 truncate">
              {summaryBadge(tpl)}
            </p>
            {qa.usage_count > 0 && (
              <p className="text-[10px] text-surface-500 mt-0.5">{qa.usage_count} kez</p>
            )}
            <button
              type="button"
              onClick={() => onExecute(qa)}
              disabled={busyId === qa.id}
              className={cn(
                "mt-2 w-full py-1.5 rounded-md text-[11px] font-semibold transition-all disabled:opacity-50",
                style.btnClass,
              )}
            >
              Yarat
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────── style helpers (widget ile aynı) ───────────────────

function cardStyle(tpl: QuickActionTemplate) {
  if (tpl.kind === "TRANSFER") {
    return {
      icon: ArrowLeftRight,
      iconClass: "text-purple-300",
      amountClass: "text-purple-200",
      borderClass: "border-purple-500/40",
      btnClass: "bg-purple-600/80 hover:bg-purple-600 text-white",
    };
  }
  if (tpl.direction === "income" && tpl.payment_method === "POS") {
    return {
      icon: CreditCard,
      iconClass: "text-blue-300",
      amountClass: "text-blue-200",
      borderClass: "border-blue-500/40",
      btnClass: "bg-blue-600/80 hover:bg-blue-600 text-white",
    };
  }
  if (tpl.direction === "income") {
    return {
      icon: ArrowDownLeft,
      iconClass: "text-emerald-300",
      amountClass: "text-emerald-200",
      borderClass: "border-emerald-500/40",
      btnClass: "bg-emerald-600/80 hover:bg-emerald-600 text-white",
    };
  }
  return {
    icon: ArrowUpRight,
    iconClass: "text-rose-300",
    amountClass: "text-rose-200",
    borderClass: "border-rose-500/40",
    btnClass: "bg-rose-600/80 hover:bg-rose-600 text-white",
  };
}

function summaryBadge(tpl: QuickActionTemplate): string {
  if (tpl.kind === "TRANSFER") return "Transfer";
  const parts: string[] = [];
  if (tpl.direction === "income") parts.push("Gelir");
  if (tpl.direction === "expense") parts.push("Gider");
  if (tpl.payment_method) parts.push(tpl.payment_method);
  if (tpl.applied_our_commission_rate != null) {
    parts.push(`%${tpl.applied_our_commission_rate}`);
  }
  return parts.join(" · ") || "—";
}

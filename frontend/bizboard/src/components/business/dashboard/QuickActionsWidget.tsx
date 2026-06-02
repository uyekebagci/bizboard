"use client";

/**
 * WP e4dc5271 (Beta v1.4) TODO 6ae21ec4: Hızlı İşlemler widget.
 *
 * <p>Pozisyon: Konsolide Net + Bugünün Kasa Durumu (Row 1) ALTINDA.
 * Her business kendi quick action listesini gösterir (user-scope).
 * Max 8 kart widget'ta görünür; sıralama order_index ASC + last_used_at DESC.
 * 9+ varsa "Tümünü Yönet" linki /dashboard/quick-actions'a gider.</p>
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Zap, ChevronRight, MoreVertical, ArrowDownLeft, ArrowUpRight,
  CreditCard, ArrowLeftRight, Loader2, Trash2, Pencil,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { QuickActionListItem, QuickActionTemplate } from "@/types";
import { QuickActionExecuteModal } from "./QuickActionExecuteModal";

interface Props {
  businessId: string;
}

const MAX_VISIBLE = 8;

export function QuickActionsWidget({ businessId }: Props) {
  const { triggerRefresh } = useAppStore();
  const [items, setItems] = useState<QuickActionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executeTarget, setExecuteTarget] = useState<QuickActionListItem | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api.get<QuickActionListItem[]>(
        `/quick-actions?business_id=${businessId}`,
      );
      setItems(r || []);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Liste yüklenemedi");
      logger.error("api", "quick-actions fetch failed", { businessId }, err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, [businessId]);

  async function handleDelete(qa: QuickActionListItem) {
    if (!confirm(`"${qa.name}" hızlı işlemi silinsin mi?`)) return;
    setBusyId(qa.id);
    try {
      await api.delete(`/quick-actions/${qa.id}`);
      toast.info("Hızlı işlem silindi");
      await refresh();
    } catch (err) {
      logger.error("api", "quick-action delete failed", { id: qa.id }, err);
      toast.error(err);
    } finally {
      setBusyId(null);
      setMenuOpenId(null);
    }
  }

  async function handleRename(qa: QuickActionListItem) {
    const newName = prompt("Yeni ad:", qa.name);
    if (!newName || newName.trim() === qa.name) {
      setMenuOpenId(null);
      return;
    }
    setBusyId(qa.id);
    try {
      await api.patch(`/quick-actions/${qa.id}`, { name: newName.trim() });
      toast.success("Hızlı işlem güncellendi");
      await refresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusyId(null);
      setMenuOpenId(null);
    }
  }

  // Görüntülenecek max 8 (zaten backend sıralı; basitçe slice)
  const visible = items.slice(0, MAX_VISIBLE);

  return (
    <section className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-white">Hızlı İşlemler</h2>
          {items.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
              {items.length}/12
            </span>
          )}
        </div>
        {items.length > MAX_VISIBLE && (
          <Link
            href="/dashboard/quick-actions"
            className="text-xs text-brand-400 hover:text-brand-300 inline-flex items-center gap-1"
          >
            Tümünü Yönet <ChevronRight size={12} />
          </Link>
        )}
      </div>

      <div className="p-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-surface-500" />
          </div>
        ) : error ? (
          <p className="text-xs text-red-300 py-2">{error}</p>
        ) : visible.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {visible.map((qa) => (
              <QuickActionCard
                key={qa.id}
                qa={qa}
                busy={busyId === qa.id}
                menuOpen={menuOpenId === qa.id}
                onMenuToggle={() => setMenuOpenId(menuOpenId === qa.id ? null : qa.id)}
                onMenuClose={() => setMenuOpenId(null)}
                onClick={() => setExecuteTarget(qa)}
                onRename={() => handleRename(qa)}
                onDelete={() => handleDelete(qa)}
                onManage={() => { window.location.href = "/dashboard/quick-actions"; }}
              />
            ))}
          </div>
        )}
      </div>

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
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="text-center py-6 px-3">
      <Zap size={28} className="mx-auto text-surface-500 mb-2" />
      <p className="text-sm text-surface-300 font-medium">
        Henüz hızlı işlem yok
      </p>
      <p className="text-[11px] text-surface-400 mt-1 leading-relaxed">
        Yeni işlem oluştururken &quot;Hızlı işlemlere kaydet&quot; seçeneğini işaretleyin.
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────

function QuickActionCard({
  qa, busy, menuOpen, onMenuToggle, onMenuClose, onClick, onRename, onDelete, onManage,
}: {
  qa: QuickActionListItem;
  busy: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
  onManage: () => void;
}) {
  const tpl = qa.tx_template;
  const style = cardStyle(tpl);
  const Icon = style.icon;
  const amountLabel = tpl.amount != null
    ? formatCurrency(tpl.amount, "TRY")
    : "—";

  return (
    <div
      className={cn(
        "relative rounded-xl border-2 bg-surface-800/60 p-3 transition-all hover:bg-surface-800",
        style.borderClass,
      )}
    >
      {/* Menu */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onMenuToggle(); }}
        className="absolute top-1.5 right-1.5 p-1 rounded-md hover:bg-surface-700/60 text-surface-400 hover:text-surface-200"
        aria-label="Menü"
      >
        <MoreVertical size={12} />
      </button>
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => { e.stopPropagation(); onMenuClose(); }}
          />
          <div className="absolute right-1.5 top-7 z-20 w-36 rounded-lg border border-surface-600 bg-surface-800 shadow-xl py-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRename(); }}
              className="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-700 inline-flex items-center gap-1.5"
            >
              <Pencil size={11} /> Yeniden Adlandır
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onManage(); }}
              className="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-700 inline-flex items-center gap-1.5"
            >
              <Pencil size={11} /> Düzenle
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="w-full text-left px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 inline-flex items-center gap-1.5"
            >
              <Trash2 size={11} /> Sil
            </button>
          </div>
        </>
      )}

      <div className="flex items-start gap-2 mb-2">
        <Icon size={16} className={style.iconClass} />
      </div>
      <p className="text-xs font-semibold text-white truncate" title={qa.name}>
        {qa.name}
      </p>
      <p className={cn("text-sm font-bold mt-0.5", style.amountClass)}>
        {amountLabel}
      </p>
      <p className="text-[10px] text-surface-400 mt-1 truncate">
        {summaryBadge(tpl)}
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={cn(
          "mt-2 w-full py-1.5 rounded-md text-[11px] font-semibold transition-all disabled:opacity-50",
          style.btnClass,
        )}
      >
        {busy ? "..." : "Yarat"}
      </button>
    </div>
  );
}

/** Renk + ikon kuralı — direction × payment_method. */
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
  // expense
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
  if (tpl.payment_method) parts.push(tpl.payment_method);
  if (tpl.applied_our_commission_rate != null) {
    parts.push(`%${tpl.applied_our_commission_rate} komisyon`);
  }
  return parts.join(" · ") || "—";
}

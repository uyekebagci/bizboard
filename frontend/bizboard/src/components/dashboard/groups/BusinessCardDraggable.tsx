"use client";

/**
 * v1.6.12: dnd-kit ile draggable business card. Eski {@link BusinessGrid}'in
 * görsel kalıbını korur (gelir / gider / net kâr blokları).
 */

import { useDraggable } from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { LayoutGrid, TrendingUp, TrendingDown, Pin, GripVertical, X } from "lucide-react";
import { formatCurrency, statusColor, getBusinessStatus, cn } from "@/lib/utils";
import type { Business, PortfolioSummary } from "@/types";

interface Props {
  business: Business;
  portfolio?: PortfolioSummary | null;
  /** Bu kart bir grubun içindeyse grupId — dnd payload'ında source olarak kullanılır. */
  fromGroupId?: string | null;
  /** "Bu gruptan çıkar" aksiyonu — null ise gizli (grupsuz bucket için). */
  onRemoveFromGroup?: () => void;
}

export function BusinessCardDraggable({ business, portfolio, fromGroupId, onRemoveFromGroup }: Props) {
  const router = useRouter();

  // dnd-kit draggable kimliği: "biz:{businessId}:{fromGroupId|null}"
  // — drop target groupId'sini ayırt etmek için from'u payload'da taşıyoruz.
  const dragId = `biz:${business.id}:${fromGroupId ?? "none"}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: { kind: "business", businessId: business.id, fromGroupId: fromGroupId ?? null },
  });

  const portfolioBiz = portfolio?.businesses?.find((b) => b.business_id === business.id);
  const income = portfolioBiz?.income ?? 0;
  const expense = portfolioBiz?.expense ?? 0;
  const fixedCost = portfolioBiz?.fixed_cost ?? 0;
  const netProfit = (portfolioBiz?.profit ?? 0) - fixedCost;
  const status = getBusinessStatus({ netProfit, trend: 0 });
  const sc = statusColor(status);
  const color = business.color || "#4c6ef5";

  // Redesign PR-2: gelir/gider bar oranı (mockup gibi). Salt görsel — veri portfolyodan.
  const barMax = Math.max(income, expense + fixedCost, 1);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "glass-card glass-hover p-5 group relative",
        isDragging && "opacity-50 ring-2 ring-brand-400 rotate-1",
      )}
    >
      {/* Drag handle — kart üst-solda */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 p-1 rounded-md text-surface-500 hover:text-surface-100 hover:bg-surface-700 transition-colors cursor-grab active:cursor-grabbing"
        aria-label="Surukle"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={14} />
      </button>

      {/* Remove from group (grup içindeyse) */}
      {onRemoveFromGroup && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemoveFromGroup(); }}
          className="absolute top-2 right-2 p-1 rounded-md text-surface-500 hover:text-red-400 hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-all"
          aria-label="Gruptan cikar"
          title="Gruptan cikar"
        >
          <X size={14} />
        </button>
      )}

      <button
        onClick={() => router.push(`/business/${business.id}`)}
        className="w-full text-left pt-3"
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${color}15` }}
            >
              <LayoutGrid size={20} style={{ color }} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-surface-100 text-sm leading-tight truncate">
                {business.name}
              </h3>
              <p className="text-[11px] text-surface-400 capitalize truncate">
                {business.business_type_name || "Isletme"}
              </p>
            </div>
          </div>
          <span className={cn("status-dot mt-1 shrink-0", sc.dot)} />
        </div>

        {/* Redesign PR-2: gelir/gider gradient barları (mockup). */}
        <div className="space-y-2.5 mt-4">
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-emerald-300 font-semibold flex items-center gap-1">
                <TrendingUp size={12} /> Gelir
              </span>
              <span className="num font-semibold text-emerald-300">{formatCurrency(income)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-700/60 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                style={{ width: `${(income / barMax) * 100}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-rose-300 font-semibold flex items-center gap-1">
                <TrendingDown size={12} /> Gider
              </span>
              <span className="num font-semibold text-rose-300">{formatCurrency(expense + fixedCost)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-700/60 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-400"
                style={{ width: `${((expense + fixedCost) / barMax) * 100}%` }} />
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-surface-700/60 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-[12px] text-surface-400">Net Kar</span>
            {fixedCost > 0 && <Pin size={8} className="text-surface-400" />}
          </div>
          <p className={cn(
            "num text-base font-bold",
            netProfit > 0 ? "text-emerald-300" : netProfit < 0 ? "text-rose-300" : "text-surface-100"
          )}>
            {formatCurrency(netProfit, business.currency)}
          </p>
        </div>
      </button>
    </div>
  );
}

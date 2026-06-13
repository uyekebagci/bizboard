"use client";

// ══════════════════════════════════════════════════════════
// Envanter Satırı (liste satiri)
// (R3 god-component bolme: page.tsx'ten cikarildi)
// ══════════════════════════════════════════════════════════

import { memo } from "react";
import { MapPin, User, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InventoryItem } from "@/types";
import { getCategoryDef, STATUS_LABELS, UNIT_LABELS } from "./constants";

// Performans (perf/frontend-quickwins): satır React.memo'ya alındı. Parent
// (inventory page) arama/filtre yazarken liste sık re-render oluyor; satır
// prop'ları (item/showBusiness) ile `onSelect` referansı stabil olduğunda
// değişmeyen satırlar yeniden render edilmez. Görünüm/davranış birebir aynı.
//
// `onSelect(item)` imzası: parent tek bir useCallback handler verir; her satır
// için ayrı inline closure üretilmez → referans stabilitesi memo'yu etkin kılar.
function InventoryRowBase({
  item,
  onSelect,
  showBusiness,
}: {
  item: InventoryItem;
  onSelect: (item: InventoryItem) => void;
  showBusiness: boolean;
}) {
  const catDef = getCategoryDef(item.category);
  const Icon = catDef.icon;
  const statusCfg = STATUS_LABELS[item.status] || STATUS_LABELS.ACTIVE;
  // Akıllı reorder eşiği (backend hesabı). (WP f4fe6d82)
  const isLowStock = item.needs_reorder;

  return (
    <div onClick={() => onSelect(item)} className="flex items-center gap-3 p-4 hover:bg-surface-700 transition-colors cursor-pointer group">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", catDef.bg)}>
        <Icon size={18} className={catDef.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-surface-100 truncate">{item.name}</p>
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border", statusCfg.bg, statusCfg.color)}>
            {statusCfg.label}
          </span>
          {isLowStock && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 border border-red-500/30 text-red-300">Sipariş Gerekli</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-surface-400 flex-wrap">
          {item.brand && <span>{item.brand}{item.model ? ` ${item.model}` : ""}</span>}
          {item.serial_number && <span>· SN: {item.serial_number}</span>}
          {item.location && <span>· <MapPin size={10} className="inline" /> {item.location}</span>}
          {item.assigned_to && <span>· <User size={10} className="inline" /> {item.assigned_to}</span>}
          {showBusiness && item.business_name && <span className="text-brand-300">· {item.business_name}</span>}
        </div>
        {item.category === "CONSUMABLE" && item.current_stock != null && (
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <span className={cn("text-xs font-medium", isLowStock ? "text-red-300" : "text-surface-300")}>
              Stok: {item.current_stock} {UNIT_LABELS[item.unit || ""] || item.unit || ""}
            </span>
            {item.minimum_stock != null && <span className="text-[10px] text-surface-400">(min: {item.minimum_stock})</span>}
            {item.effective_reorder_point != null && (
              <span className="text-[10px] text-surface-400">· reorder: {item.effective_reorder_point}</span>
            )}
            {isLowStock && item.suggested_order_quantity != null && item.suggested_order_quantity > 0 && (
              <span className="text-[10px] text-amber-500 font-medium">· öneri: +{item.suggested_order_quantity} sipariş</span>
            )}
          </div>
        )}
      </div>
      <ChevronRight size={16} className="text-surface-300 group-hover:text-surface-400 transition-colors shrink-0" />
    </div>
  );
}

export const InventoryRow = memo(InventoryRowBase);

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Truck, Wrench, Building, Package, AlertTriangle,
  ChevronRight, ExternalLink, Loader2, ShieldAlert,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import type { InventorySummary } from "@/types";

interface Props {
  businessId: string;
  currency: string;
}

const CATEGORY_CONFIG = [
  { key: "heavy_vehicle_count", label: "Agir Arac / Is Makinesi", icon: Truck, color: "text-orange-300", bg: "bg-orange-500/15" },
  { key: "light_equipment_count", label: "Hafif Ekipman", icon: Wrench, color: "text-blue-300", bg: "bg-blue-500/15" },
  { key: "site_setup_count", label: "Santiye Kurulum", icon: Building, color: "text-teal-300", bg: "bg-teal-500/15" },
  { key: "consumable_count", label: "Sarf Malzeme", icon: Package, color: "text-purple-300", bg: "bg-purple-500/15" },
] as const;

export function InventoryModule({ businessId, currency }: Props) {
  const router = useRouter();
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<InventorySummary>(`/businesses/${businessId}/inventory/summary`)
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessId]);

  if (loading) {
    return (
      <div className="glass-card p-6 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-surface-400" />
      </div>
    );
  }

  if (!summary || summary.total_items === 0) {
    return (
      <div className="glass-card p-6 text-center">
        <Package size={32} className="text-surface-300 mx-auto mb-2" />
        <p className="text-surface-500 text-sm">Henuz envanter kalemi yok</p>
        <p className="text-surface-400 text-xs mt-1">
          Envanter sayfasindan ekipman ve malzeme ekleyin
        </p>
        <button
          onClick={() => router.push(`/dashboard/inventory?business=${businessId}`)}
          className="mt-3 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          Envanter Sayfasi
        </button>
      </div>
    );
  }

  const alerts = summary.broken_count + summary.in_repair_count + summary.low_stock_count + summary.warranty_expiring_count;

  return (
    <div className="space-y-4">
      {/* Özet Kartları */}
      <div className="grid grid-cols-2 gap-2">
        {CATEGORY_CONFIG.map((cat) => {
          const count = summary[cat.key as keyof InventorySummary] as number;
          if (count === 0) return null;
          const Icon = cat.icon;
          return (
            <div key={cat.key} className={cn("p-3 rounded-xl border border-surface-200", cat.bg)}>
              <div className="flex items-center gap-2">
                <Icon size={16} className={cat.color} />
                <span className="text-xs font-medium text-surface-600">{cat.label}</span>
              </div>
              <p className={cn("text-xl font-bold mt-1", cat.color)}>{count}</p>
            </div>
          );
        })}
      </div>

      {/* Uyarılar */}
      {alerts > 0 && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className="text-amber-300" />
            <span className="text-xs font-bold text-amber-400">Dikkat Gerektiren</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {summary.broken_count > 0 && (
              <span className="text-xs text-amber-300">
                <ShieldAlert size={12} className="inline mr-1" />
                {summary.broken_count} arizali
              </span>
            )}
            {summary.in_repair_count > 0 && (
              <span className="text-xs text-amber-300">
                <Wrench size={12} className="inline mr-1" />
                {summary.in_repair_count} tamirde
              </span>
            )}
            {summary.low_stock_count > 0 && (
              <span className="text-xs text-red-300">
                <Package size={12} className="inline mr-1" />
                {summary.low_stock_count} dusuk stok
              </span>
            )}
            {summary.warranty_expiring_count > 0 && (
              <span className="text-xs text-amber-300">
                {summary.warranty_expiring_count} garanti bitmek uzere
              </span>
            )}
          </div>
        </div>
      )}

      {/* Toplam Değer + Yönlendirme */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-surface-500">Toplam: {summary.total_items} kalem</p>
          {summary.total_value > 0 && (
            <p className="text-xs text-surface-400">Deger: {formatCurrency(summary.total_value)}</p>
          )}
        </div>
        <button
          onClick={() => router.push(`/dashboard/inventory?business=${businessId}`)}
          className="flex items-center gap-1 text-sm font-medium text-brand-300 hover:text-brand-300 transition-colors"
        >
          Tum Envanter
          <ExternalLink size={14} />
        </button>
      </div>
    </div>
  );
}

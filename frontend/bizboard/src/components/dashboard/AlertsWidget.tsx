"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Package, Shield, Wrench, Calendar, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import type { Business } from "@/types";

interface AlertItem {
  icon: typeof AlertTriangle;
  color: string;
  bg: string;
  title: string;
  detail: string;
}

interface Props {
  businesses: Business[];
}

interface InventorySummary {
  totalItems: number;
  brokenCount: number;
  lowStockCount: number;
  warrantyExpiringCount: number;
}

interface EmployeeSummary {
  total_employees: number;
  active_employees: number;
}

export function AlertsWidget({ businesses }: Props) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function gather() {
      const items: AlertItem[] = [];

      try {
        // Envanter uyarıları
        const invResults = await Promise.all(
          businesses.map((b) =>
            api.get<InventorySummary>(`/businesses/${b.id}/inventory/summary`).catch(() => null)
          )
        );
        let totalBroken = 0, totalLowStock = 0, totalWarranty = 0;
        for (const r of invResults) {
          if (r) {
            totalBroken += r.brokenCount || 0;
            totalLowStock += r.lowStockCount || 0;
            totalWarranty += r.warrantyExpiringCount || 0;
          }
        }
        if (totalBroken > 0) {
          items.push({
            icon: Wrench,
            color: "text-red-600",
            bg: "bg-red-50",
            title: `${totalBroken} arizali ekipman`,
            detail: "Onarim veya degisim gerekiyor",
          });
        }
        if (totalLowStock > 0) {
          items.push({
            icon: Package,
            color: "text-amber-600",
            bg: "bg-amber-50",
            title: `${totalLowStock} kalem dusuk stok`,
            detail: "Minimum stok seviyesinin altinda",
          });
        }
        if (totalWarranty > 0) {
          items.push({
            icon: Shield,
            color: "text-orange-600",
            bg: "bg-orange-50",
            title: `${totalWarranty} garanti sona eriyor`,
            detail: "30 gun icinde garanti bitecek",
          });
        }

        // Personel - aktif olmayan
        const empResults = await Promise.all(
          businesses.map((b) =>
            api.get<EmployeeSummary>(`/businesses/${b.id}/employees/summary`).catch(() => null)
          )
        );
        let totalInactive = 0;
        for (const r of empResults) {
          if (r && r.total_employees > r.active_employees) {
            totalInactive += r.total_employees - r.active_employees;
          }
        }
        if (totalInactive > 0) {
          items.push({
            icon: Users,
            color: "text-blue-600",
            bg: "bg-blue-50",
            title: `${totalInactive} pasif personel`,
            detail: "Aktif olmayan personel kaydi",
          });
        }
      } catch { }

      setAlerts(items);
      setLoading(false);
    }

    if (businesses.length > 0) gather();
    else setLoading(false);
  }, [businesses]);

  if (loading) return null;
  if (alerts.length === 0) return null;

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
          <AlertTriangle size={16} className="text-amber-600" />
        </div>
        <h3 className="text-sm font-bold text-white">Dikkat Gerektiren</h3>
        <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
          {alerts.length}
        </span>
      </div>

      <div className="space-y-2">
        {alerts.map((alert, i) => {
          const Icon = alert.icon;
          return (
            <div key={i} className={cn("flex items-start gap-3 p-2.5 rounded-xl", alert.bg)}>
              <Icon size={16} className={cn("mt-0.5 shrink-0", alert.color)} />
              <div>
                <p className="text-sm font-medium text-white">{alert.title}</p>
                <p className="text-[11px] text-surface-400">{alert.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

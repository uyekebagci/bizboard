"use client";

import {
  HardHat, Truck, UtensilsCrossed, Car, Store, Home,
  Briefcase, LayoutGrid, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Business } from "@/types";

const iconMap: Record<string, LucideIcon> = {
  "hard-hat": HardHat,
  truck: Truck,
  "utensils-crossed": UtensilsCrossed,
  car: Car,
  store: Store,
  home: Home,
  briefcase: Briefcase,
  "layout-grid": LayoutGrid,
};

interface Props {
  business: Business;
}

export function BusinessHeader({ business }: Props) {
  // v1.6.2: BusinessType FK kaldırıldı, serbest metin tipi var; ikon default.
  const Icon = LayoutGrid;
  const color = business.color || "#4c6ef5";

  return (
    <div className="card p-5">
      <div className="flex items-center gap-4">
        {/* Icon */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon size={28} style={{ color }} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-surface-100 truncate">
            {business.name}
          </h1>
          <p className="text-sm text-surface-400 capitalize mt-0.5">
            {business.business_type_name || "İşletme"}
          </p>
        </div>
      </div>

      {/* Description */}
      {business.description && (
        <p className="text-sm text-surface-300 mt-3 leading-relaxed">
          {business.description}
        </p>
      )}

      {/* Team indicator */}
      {business.members && business.members.length > 0 && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-surface-700">
          <Users size={16} className="text-surface-400" />
          <span className="text-xs text-surface-400">
            {business.members.length} ekip üyesi
          </span>
        </div>
      )}
    </div>
  );
}

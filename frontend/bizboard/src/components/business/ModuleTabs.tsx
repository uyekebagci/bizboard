"use client";

import { useState } from "react";
import {
  Wallet, Package, Users, FolderKanban, FileText,
  CalendarCheck, CarFront, UtensilsCrossed, UserCircle,
  Landmark, StickyNote, Plus, X, Check, Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { Business, ModuleType } from "@/types";
import { DebtModule } from "@/components/business/DebtModule";
import { NotesModule } from "@/components/business/NotesModule";
import { DocumentsModule } from "@/components/business/DocumentsModule";
import { PersonnelModule } from "@/components/business/PersonnelModule";
import { VehicleModule } from "@/components/business/VehicleModule";
import { InventoryModule } from "@/components/business/InventoryModule";
import { FinanceModule } from "@/components/business/FinanceModule";

const moduleConfig: Record<
  ModuleType,
  { label: string; icon: LucideIcon }
> = {
  finance: { label: "Finans", icon: Wallet },
  inventory: { label: "Envanter", icon: Package },
  staff: { label: "Personel", icon: Users },
  projects: { label: "Projeler", icon: FolderKanban },
  documents: { label: "Belgeler", icon: FileText },
  reservations: { label: "Rezervasyonlar", icon: CalendarCheck },
  vehicles: { label: "Araclar", icon: CarFront },
  menu: { label: "Menu", icon: UtensilsCrossed },
  crm: { label: "Musteriler", icon: UserCircle },
  debt: { label: "Borclar", icon: Landmark },
  notes: { label: "Notlar", icon: StickyNote },
};

const allModules = Object.keys(moduleConfig) as ModuleType[];

interface Props {
  business: Business;
}

export function ModuleTabs({ business }: Props) {
  const { profile, triggerRefresh } = useAppStore();
  const isAdmin = profile?.role === "admin";

  const enabledModules =
    business.modules?.filter((m) => m.is_enabled) ?? [];

  const [activeTab, setActiveTab] = useState<ModuleType>(
    enabledModules[0]?.module || "finance"
  );
  const [showAddModal, setShowAddModal] = useState(false);

  if (enabledModules.length === 0 && !isAdmin) {
    return null;
  }

  function renderContent() {
    switch (activeTab) {
      case "finance":
        return <FinanceModule businessId={business.id} currency={business.currency} />;
      case "debt":
        return <DebtModule businessId={business.id} currency={business.currency} />;
      case "documents":
        return <DocumentsModule businessId={business.id} />;
      case "staff":
        return <PersonnelModule businessId={business.id} currency={business.currency} />;
      case "vehicles":
        return <VehicleModule businessId={business.id} currency={business.currency} />;
      case "inventory":
        return <InventoryModule businessId={business.id} currency={business.currency} />;
      case "notes":
        return <NotesModule businessId={business.id} />;
      default:
        return (
          <div className="card p-6 text-center">
            <p className="text-surface-400 text-sm">
              {moduleConfig[activeTab]?.label} modul icerigi burada gorunecek.
            </p>
            <p className="text-surface-400 text-xs mt-1">
              Module ozel veriler ve islemler burada yer alacak.
            </p>
          </div>
        );
    }
  }

  return (
    <div>
      {/* Scrollable Tab Bar */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
        {enabledModules.map((mod) => {
          const config = moduleConfig[mod.module];
          if (!config) return null;

          const Icon = config.icon;
          const isActive = activeTab === mod.module;

          return (
            <button
              key={mod.module}
              onClick={() => setActiveTab(mod.module)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                isActive
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-surface-700 text-surface-300 hover:bg-surface-600"
              )}
            >
              <Icon size={16} />
              {config.label}
            </button>
          );
        })}

        {/* Admin-only: Modul Ekle butonu */}
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap
                       border-2 border-dashed border-surface-300 text-surface-400
                       hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 transition-all"
          >
            <Plus size={16} />
            Modul Ekle
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {enabledModules.length > 0 ? renderContent() : (
          <div className="card p-6 text-center">
            <p className="text-surface-400 text-sm">Henuz aktif modul yok.</p>
            <p className="text-surface-400 text-xs mt-1">Modul eklemek icin + butonuna tiklayın.</p>
          </div>
        )}
      </div>

      {/* Add/Remove Module Modal */}
      {showAddModal && (
        <ModuleManagerModal
          business={business}
          onClose={() => setShowAddModal(false)}
          onChanged={() => {
            setShowAddModal(false);
            triggerRefresh();
          }}
        />
      )}
    </div>
  );
}

function ModuleManagerModal({
  business,
  onClose,
  onChanged,
}: {
  business: Business;
  onClose: () => void;
  onChanged: () => void;
}) {
  const enabledSet = new Set(
    (business.modules ?? [])
      .filter((m) => m.is_enabled)
      .map((m) => m.module)
  );

  const [loading, setLoading] = useState<string | null>(null);
  const [localEnabled, setLocalEnabled] = useState<Set<ModuleType>>(new Set(enabledSet));
  const [changed, setChanged] = useState(false);

  async function toggleModule(mod: ModuleType) {
    setLoading(mod);
    try {
      if (localEnabled.has(mod)) {
        await api.delete(`/businesses/${business.id}/modules/${mod}`);
        setLocalEnabled((prev) => {
          const next = new Set(prev);
          next.delete(mod);
          return next;
        });
      } else {
        await api.post(`/businesses/${business.id}/modules/${mod}`, {});
        setLocalEnabled((prev) => new Set(prev).add(mod));
      }
      setChanged(true);
    } catch (err) {
      logger.error("api", "Module toggle error", undefined, err);
    } finally {
      setLoading(null);
    }
  }

  function handleClose() {
    if (changed) {
      onChanged();
    } else {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-surface-800 rounded-2xl shadow-card-hover border border-surface-600 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
              <Plus size={16} className="text-brand-600" />
            </div>
            <h3 className="text-lg font-bold text-white">Modul Yonetimi</h3>
          </div>
          <button onClick={handleClose} className="p-2 rounded-xl hover:bg-surface-700">
            <X size={20} className="text-surface-400" />
          </button>
        </div>

        {/* Module List */}
        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-surface-400 mb-3">
            Aktif etmek veya devre disi birakmak icin modullere tiklayin.
          </p>

          {allModules.map((mod) => {
            const config = moduleConfig[mod];
            const Icon = config.icon;
            const isEnabled = localEnabled.has(mod);
            const isLoading = loading === mod;

            return (
              <button
                key={mod}
                onClick={() => toggleModule(mod)}
                disabled={isLoading}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                  isEnabled
                    ? "bg-brand-50 border-brand-200 hover:bg-brand-100"
                    : "bg-surface-700 border-surface-600 hover:bg-surface-700"
                )}
              >
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                  isEnabled ? "bg-brand-100" : "bg-surface-600"
                )}>
                  <Icon size={18} className={isEnabled ? "text-brand-600" : "text-surface-400"} />
                </div>

                <span className={cn(
                  "text-sm font-medium flex-1",
                  isEnabled ? "text-brand-700" : "text-surface-300"
                )}>
                  {config.label}
                </span>

                {isLoading ? (
                  <Loader2 size={18} className="animate-spin text-surface-400" />
                ) : isEnabled ? (
                  <Check size={18} className="text-brand-600" />
                ) : (
                  <Plus size={18} className="text-surface-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-700">
          <button
            onClick={handleClose}
            className="w-full py-2.5 rounded-xl font-medium text-white bg-brand-600 hover:bg-brand-700 transition-colors"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}

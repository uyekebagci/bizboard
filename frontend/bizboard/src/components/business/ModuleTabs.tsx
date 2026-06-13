"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  Wallet, Package, Users, FolderKanban, FileText,
  CalendarCheck, CarFront, UtensilsCrossed, UserCircle,
  Landmark, StickyNote, Plus, X, Check, Loader2, Pin,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { toast } from "@/lib/toast";
import { useAppStore } from "@/lib/store";
import type { Business, ModuleType } from "@/types";

// ── Performans: modülleri code-split et (perf/frontend-quickwins) ───────────
// Önceki sürüm 8 modülü de EAGER import ediyordu → /business/[id] First Load JS
// gereksiz şişiyordu (sadece bir tab aktifken hepsi bundle'a giriyordu). Artık
// her modül `next/dynamic` ile lazy yüklenir; SADECE aktif tab'in chunk'ı
// indirilir, diğerleri tab'a tıklanınca on-demand gelir. Davranış aynen korunur.
//
// ssr:false → modüller client-only render edilir. Bu component zaten "use client"
// ve modüller içeride `createPortal` / browser API'leri (window, document)
// kullanan alt-modal'lar barındırıyor; SSR'a gerek yok ve sunucu HTML'ini
// hafifletir. Tab içeriği zaten kullanıcı etkileşimiyle (veya açılışta tek tab)
// görünür, prerender gereksinimi yok.
const loadingFallback = () => <ModuleLoadingSkeleton />;

const FinanceModule = dynamic(
  () => import("@/components/business/FinanceModule").then((m) => m.FinanceModule),
  { loading: loadingFallback, ssr: false },
);
const InventoryModule = dynamic(
  () => import("@/components/business/InventoryModule").then((m) => m.InventoryModule),
  { loading: loadingFallback, ssr: false },
);
const DebtModule = dynamic(
  () => import("@/components/business/DebtModule").then((m) => m.DebtModule),
  { loading: loadingFallback, ssr: false },
);
const PersonnelModule = dynamic(
  () => import("@/components/business/PersonnelModule").then((m) => m.PersonnelModule),
  { loading: loadingFallback, ssr: false },
);
const VehicleModule = dynamic(
  () => import("@/components/business/VehicleModule").then((m) => m.VehicleModule),
  { loading: loadingFallback, ssr: false },
);
const DocumentsModule = dynamic(
  () => import("@/components/business/DocumentsModule").then((m) => m.DocumentsModule),
  { loading: loadingFallback, ssr: false },
);
const NotesModule = dynamic(
  () => import("@/components/business/NotesModule").then((m) => m.NotesModule),
  { loading: loadingFallback, ssr: false },
);
const FixedCostsWidget = dynamic(
  () => import("@/components/business/FixedCostsWidget").then((m) => m.FixedCostsWidget),
  { loading: loadingFallback, ssr: false },
);

// Modül lazy-load fallback'i — mevcut modüllerin (FinanceModule vb.) iç
// skeleton desenini (space-y + animate-pulse + surface placeholder) taklit eder,
// böylece chunk inerken görsel zıplama olmaz.
function ModuleLoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-32 bg-surface-700 rounded-2xl" />
      <div className="h-36 bg-surface-700 rounded-2xl" />
      <div className="h-40 bg-surface-700 rounded-2xl" />
    </div>
  );
}

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
  vehicles: { label: "Araçlar", icon: CarFront },
  menu: { label: "Menü", icon: UtensilsCrossed },
  crm: { label: "Müşteriler", icon: UserCircle },
  debt: { label: "Borçlar", icon: Landmark },
  notes: { label: "Notlar", icon: StickyNote },
  fixed_costs: { label: "Sabit Masraflar", icon: Pin },
};

const allModules = Object.keys(moduleConfig) as ModuleType[];

interface Props {
  business: Business;
}

export function ModuleTabs({ business }: Props) {
  const { profile, triggerRefresh } = useAppStore();
  const isAdmin = profile?.role === "admin";

  // v1.7.0.x: Notlar (notes) modülü her zaman ilk sırada sabit ve
  // sayfa açılışında default aktif tab.
  const enabledModules = useMemo(() => {
    const all = business.modules?.filter((m) => m.is_enabled) ?? [];
    // Notes'u öne çek — diğerleri DB sırasını korur.
    return [...all].sort((a, b) => {
      if (a.module === "notes" && b.module !== "notes") return -1;
      if (a.module !== "notes" && b.module === "notes") return 1;
      return 0;
    });
  }, [business.modules]);

  // v2.2 Advanced Search: arama deep-link'i `?tab=vehicles` ile ilgili modülü
  // açabilir. Geçerli + enabled değilse default mantığa düşülür.
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ModuleType>(() => {
    const requested = searchParams.get("tab") as ModuleType | null;
    const isEnabled = (m: string) => enabledModules.some((e) => e.module === m);
    if (requested && moduleConfig[requested] && (isEnabled(requested) || isAdmin)) {
      return requested;
    }
    // Sayfa açılışında Notlar varsa onu aç; yoksa ilk enabled; o da yoksa "notes".
    const hasNotes = enabledModules.some((m) => m.module === "notes");
    if (hasNotes) return "notes";
    return enabledModules[0]?.module || "notes";
  });
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
        // WP a9da4e9d fix: işletme detay = BUSINESS scope (alacaklar notlarından ayrı).
        return <NotesModule businessId={business.id} scope="BUSINESS" />;
      case "fixed_costs":
        return <FixedCostsWidget businessId={business.id} currency={business.currency} />;
      default:
        return (
          <div className="v2-card p-6 text-center">
            <p className="text-[rgb(var(--v2-muted))] text-sm">
              {moduleConfig[activeTab]?.label} modül içeriği burada görünecek.
            </p>
            <p className="text-[rgb(var(--v2-muted))] text-xs mt-1">
              Modüle özel veriler ve işlemler burada yer alacak.
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
                       hover:border-brand-400 hover:text-brand-400 hover:bg-brand-500/10 transition-all"
          >
            <Plus size={16} />
            Modül Ekle
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {enabledModules.length > 0 ? renderContent() : (
          <div className="v2-card p-6 text-center">
            <p className="text-[rgb(var(--v2-muted))] text-sm">Henüz aktif modül yok.</p>
            <p className="text-[rgb(var(--v2-muted))] text-xs mt-1">Modül eklemek için + butonuna tıklayın.</p>
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
      toast.error(err);
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="modal-surface shadow-xl w-full max-w-md rounded-2xl">
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
              <Plus size={16} className="text-brand-400" />
            </div>
            <h3 className="text-lg font-bold text-[rgb(var(--v2-ink))]">Modül Yönetimi</h3>
          </div>
          <button onClick={handleClose} className="p-2 rounded-xl hover:bg-surface-700">
            <X size={20} className="text-surface-400" />
          </button>
        </div>

        {/* Module List */}
        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-[rgb(var(--v2-muted))] mb-3">
            Aktif etmek veya devre dışı bırakmak için modüllere tıklayın.
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
                    ? "bg-brand-500/15 border-brand-500/40 hover:bg-brand-500/25"
                    : "bg-surface-700 border-surface-600 hover:bg-surface-700"
                )}
              >
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                  isEnabled ? "bg-brand-500/20" : "bg-surface-600"
                )}>
                  <Icon size={18} className={isEnabled ? "text-brand-300" : "text-surface-400"} />
                </div>

                <span className={cn(
                  "text-sm font-medium flex-1",
                  isEnabled ? "text-brand-200" : "text-surface-300"
                )}>
                  {config.label}
                </span>

                {isLoading ? (
                  <Loader2 size={18} className="animate-spin text-surface-400" />
                ) : isEnabled ? (
                  <Check size={18} className="text-brand-300" />
                ) : (
                  <Plus size={18} className="text-surface-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[rgb(var(--v2-border))]">
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

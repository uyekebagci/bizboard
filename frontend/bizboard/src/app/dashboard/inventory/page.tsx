"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Plus, Search, X, Loader2, Truck, Wrench, Building, Package,
  AlertTriangle, MapPin, User,
  Boxes, Trash2, Save, ChevronRight, Activity, Pencil, Fuel,
  UtensilsCrossed, Monitor, ShoppingCart,
  Sofa, Camera, ExternalLink,
} from "lucide-react";
import { formatCurrency, cn, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import type { Business, InventoryItem, MaintenanceLog, FuelLog, Employee, FileUploadInfo } from "@/types";
import type { LucideIcon } from "lucide-react";
import { InlineFileUpload } from "@/components/shared/FileUploadButton";

// ══════════════════════════════════════════════════════════
// İş tipine göre envanter kategori tanımları
// ══════════════════════════════════════════════════════════

interface CategoryDef {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
}

const ALL_TAB: CategoryDef = { key: "ALL", label: "Tumu", icon: Boxes, color: "text-surface-300", bg: "bg-surface-700" };

const CONSTRUCTION_CATEGORIES: CategoryDef[] = [
  { key: "HEAVY_VEHICLE",   label: "Agir Arac / Makine", icon: Truck,          color: "text-orange-400", bg: "bg-orange-500/15" },
  { key: "LIGHT_EQUIPMENT", label: "Hafif Ekipman",       icon: Wrench,         color: "text-blue-400",   bg: "bg-blue-500/15" },
  { key: "SITE_SETUP",      label: "Santiye Kurulum",     icon: Building,       color: "text-teal-400",   bg: "bg-teal-500/15" },
  { key: "CONSUMABLE",      label: "Sarf Malzeme",        icon: Package,        color: "text-purple-400", bg: "bg-purple-500/15" },
];

const RESTAURANT_CATEGORIES: CategoryDef[] = [
  { key: "KITCHEN_EQUIPMENT", label: "Mutfak Ekipman",  icon: UtensilsCrossed, color: "text-orange-400", bg: "bg-orange-500/15" },
  { key: "FURNITURE",         label: "Mobilya / Dekor", icon: Sofa,            color: "text-teal-400",   bg: "bg-teal-500/15" },
  { key: "CONSUMABLE",        label: "Sarf Malzeme",    icon: Package,         color: "text-purple-400", bg: "bg-purple-500/15" },
];

const TECHNOLOGY_CATEGORIES: CategoryDef[] = [
  { key: "IT_EQUIPMENT", label: "Bilisim Ekipman", icon: Monitor, color: "text-blue-400",   bg: "bg-blue-500/15" },
  { key: "FURNITURE",    label: "Ofis Mobilya",    icon: Sofa,    color: "text-teal-400",   bg: "bg-teal-500/15" },
  { key: "CONSUMABLE",   label: "Sarf Malzeme",    icon: Package, color: "text-purple-400", bg: "bg-purple-500/15" },
];

const RETAIL_CATEGORIES: CategoryDef[] = [
  { key: "STORE_EQUIPMENT", label: "Magaza Ekipman", icon: ShoppingCart, color: "text-orange-400", bg: "bg-orange-500/15" },
  { key: "CONSUMABLE",      label: "Sarf Malzeme",   icon: Package,      color: "text-purple-400", bg: "bg-purple-500/15" },
];

const GENERIC_CATEGORIES: CategoryDef[] = [
  { key: "EQUIPMENT",  label: "Ekipman",     icon: Wrench,  color: "text-blue-400",   bg: "bg-blue-500/15" },
  { key: "FURNITURE",  label: "Mobilya",     icon: Sofa,    color: "text-teal-400",   bg: "bg-teal-500/15" },
  { key: "CONSUMABLE", label: "Sarf Malzeme", icon: Package, color: "text-purple-400", bg: "bg-purple-500/15" },
];

function getCategoriesForBusinessType(category?: string): CategoryDef[] {
  switch (category) {
    case "construction": return CONSTRUCTION_CATEGORIES;
    case "restaurant":
    case "food_truck": return RESTAURANT_CATEGORIES;
    case "technology": return TECHNOLOGY_CATEGORIES;
    case "retail": return RETAIL_CATEGORIES;
    default: return GENERIC_CATEGORIES;
  }
}

const ALL_CATEGORY_MAP: Record<string, CategoryDef> = {};
[...CONSTRUCTION_CATEGORIES, ...RESTAURANT_CATEGORIES, ...TECHNOLOGY_CATEGORIES,
  ...RETAIL_CATEGORIES, ...GENERIC_CATEGORIES].forEach((c) => {
  if (!ALL_CATEGORY_MAP[c.key]) ALL_CATEGORY_MAP[c.key] = c;
});

function getCategoryDef(key: string): CategoryDef {
  return ALL_CATEGORY_MAP[key] || { key, label: key, icon: Package, color: "text-surface-300", bg: "bg-surface-700" };
}

// Yakıt takibi olan kategoriler
const FUEL_CATEGORIES = new Set(["HEAVY_VEHICLE", "LIGHT_EQUIPMENT"]);

// ══════════════════════════════════════════════════════════
// Durum ve etiket sabitleri
// ══════════════════════════════════════════════════════════

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE:   { label: "Aktif",    color: "text-green-400",  bg: "bg-green-500/10 border-green-500/30" },
  IN_STOCK: { label: "Stokta",   color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30" },
  BROKEN:   { label: "Arizali",  color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30" },
  IN_REPAIR:{ label: "Tamirde",  color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/30" },
  SCRAPPED: { label: "Hurda",    color: "text-surface-400", bg: "bg-surface-700 border-surface-600" },
};

const ENERGY_LABELS: Record<string, string> = {
  BATTERY: "Akulu", GASOLINE: "Benzinli", DIESEL: "Dizel",
  ELECTRIC_220V: "220V", ELECTRIC_380V: "380V",
};

const UNIT_LABELS: Record<string, string> = {
  PIECE: "Adet", TON: "Ton", KG: "Kg", METER: "Metre",
  CUBIC_METER: "m\u00B3", BOX: "Kutu", SET: "Set", LITRE: "Litre",
};

const STOCK_CAT_LABELS: Record<string, string> = {
  ROUGH_CONSTRUCTION: "Kaba Yapi", FINE_CONSTRUCTION: "Ince Yapi",
  SAFETY_EQUIPMENT: "ISG Malzemesi", CHEMICAL: "Kimyasal", OTHER: "Diger",
};

const MAINTENANCE_LABELS: Record<string, string> = {
  OIL_CHANGE: "Yag Degisimi", FILTER_CHANGE: "Filtre Degisimi",
  REPAIR: "Onarim", PART_REPLACEMENT: "Parca Degisimi",
  INSPECTION: "Periyodik Kontrol", OTHER: "Diger",
};

const FUEL_TYPE_LABELS: Record<string, string> = {
  DIESEL: "Dizel", GASOLINE: "Benzin", LPG: "LPG", ELECTRIC: "Elektrik", OTHER: "Diger",
};

// Hangi kategoride hangi alanlar gösterilecek
const CATEGORY_FIELDS: Record<string, string[]> = {
  HEAVY_VEHICLE: ["brand", "model", "serial_number", "company_barcode", "power_capacity", "energy_source", "assigned_to", "assigned_type", "location", "warranty_expiry", "last_maintenance_date", "purchase_price", "purchase_date"],
  LIGHT_EQUIPMENT: ["brand", "model", "serial_number", "company_barcode", "power_capacity", "energy_source", "assigned_to", "assigned_type", "location", "warranty_expiry", "last_maintenance_date", "purchase_price", "purchase_date"],
  SITE_SETUP: ["dimensions", "material_type", "module_count", "interior_details", "location", "purchase_price", "purchase_date"],
  CONSUMABLE: ["brand", "unit", "current_stock", "minimum_stock", "sku", "warehouse_location", "batch_number", "expiry_date", "stock_category", "purchase_price"],
  KITCHEN_EQUIPMENT: ["brand", "model", "serial_number", "power_capacity", "energy_source", "location", "warranty_expiry", "last_maintenance_date", "purchase_price", "purchase_date"],
  FURNITURE: ["brand", "model", "location", "purchase_price", "purchase_date"],
  IT_EQUIPMENT: ["brand", "model", "serial_number", "company_barcode", "assigned_to", "assigned_type", "location", "warranty_expiry", "purchase_price", "purchase_date"],
  STORE_EQUIPMENT: ["brand", "model", "serial_number", "location", "warranty_expiry", "purchase_price", "purchase_date"],
  EQUIPMENT: ["brand", "model", "serial_number", "power_capacity", "energy_source", "assigned_to", "assigned_type", "location", "warranty_expiry", "purchase_price", "purchase_date"],
};

function getFieldsForCategory(category: string): string[] {
  return CATEGORY_FIELDS[category] || CATEGORY_FIELDS.EQUIPMENT || [];
}

// ══════════════════════════════════════════════════════════
// Ana Sayfa
// ══════════════════════════════════════════════════════════

export default function InventoryPageWrapper() {
  return (
    <Suspense>
      <InventoryPage />
    </Suspense>
  );
}

function InventoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshKey, triggerRefresh } = useAppStore();

  const presetBusiness = searchParams.get("business") || "";

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeCategory, setActiveCategory] = useState("ALL");
  const [filterBusiness, setFilterBusiness] = useState(presetBusiness);
  const [filterStatus, setFilterStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => { fetchData(); }, [refreshKey, filterBusiness]);

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterBusiness) params.set("business_id", filterBusiness);

      const [itemsData, bizData] = await Promise.all([
        api.get<InventoryItem[]>(`/portfolio/inventory?${params.toString()}`),
        api.get<Business[]>("/businesses"),
      ]);
      setItems(itemsData || []);
      setBusinesses(bizData || []);
    } catch (err) {
      logger.error("api", "Inventory fetch error", undefined, err);
    } finally {
      setLoading(false);
    }
  }

  const selectedBiz = businesses.find((b) => b.id === filterBusiness);
  const availableCategories = useMemo(() => {
    if (selectedBiz) {
      return [ALL_TAB, ...getCategoriesForBusinessType(undefined /* v1.6.2: BusinessType.category kaldırıldı */)];
    }
    const seen = new Set<string>();
    const merged: CategoryDef[] = [ALL_TAB];
    for (const biz of businesses) {
      for (const cat of getCategoriesForBusinessType(undefined /* v1.6.2: BusinessType.category kaldırıldı */)) {
        if (!seen.has(cat.key)) { seen.add(cat.key); merged.push(cat); }
      }
    }
    return merged;
  }, [selectedBiz, businesses]);

  useEffect(() => {
    if (activeCategory !== "ALL" && !availableCategories.find((c) => c.key === activeCategory)) {
      setActiveCategory("ALL");
    }
  }, [availableCategories, activeCategory]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (activeCategory !== "ALL" && item.category !== activeCategory) return false;
      if (filterStatus && item.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = [item.name, item.brand, item.model, item.serial_number,
          item.company_barcode, item.assigned_to, item.location]
          .some((v) => v?.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [items, activeCategory, filterStatus, searchQuery]);

  const totalCount = filtered.length;
  const brokenCount = filtered.filter((i) => i.status === "BROKEN").length;
  const lowStockCount = filtered.filter((i) =>
    i.category === "CONSUMABLE" && i.current_stock != null && i.minimum_stock != null
    && i.current_stock <= i.minimum_stock
  ).length;

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors">
            <ArrowLeft size={20} className="text-surface-300" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Envanter Yonetimi</h1>
            <p className="text-xs text-surface-400">{totalCount} kalem</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition-colors"
        >
          <Plus size={16} /> Ekle
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-1.5 py-1">
        {availableCategories.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                isActive ? "bg-brand-600 text-white shadow-sm" : "bg-surface-700 text-surface-300 hover:bg-surface-600"
              )}
            >
              <Icon size={16} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Uyarı Barı */}
      {(brokenCount > 0 || lowStockCount > 0) && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2 text-xs">
          <AlertTriangle size={14} className="text-amber-600 shrink-0" />
          <div className="flex gap-3">
            {brokenCount > 0 && <span className="text-amber-400 font-medium">{brokenCount} arizali</span>}
            {lowStockCount > 0 && <span className="text-red-600 font-medium">{lowStockCount} dusuk stok</span>}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ara... (ad, marka, seri no, lokasyon)"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-sm text-white
                       placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
        </div>
        <select value={filterBusiness} onChange={(e) => setFilterBusiness(e.target.value)}
          className="px-3 py-2 rounded-xl border border-surface-600 bg-surface-800 text-xs text-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">Tum Isletmeler</option>
          {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-xl border border-surface-600 bg-surface-800 text-xs text-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">Tum Durumlar</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-surface-600 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-surface-400 text-sm">
            {items.length === 0 ? "Henuz envanter kalemi yok" : "Filtreye uygun kalem bulunamadi"}
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-surface-700">
          {filtered.map((item) => (
            <InventoryRow key={item.id} item={item} onClick={() => setDetailItem(item)} showBusiness={!filterBusiness} />
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {detailItem && (
        <InventoryDetailModal item={detailItem} onClose={() => setDetailItem(null)}
          onUpdated={() => { setDetailItem(null); triggerRefresh(); }} />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateInventoryModal businesses={businesses} presetBusinessId={filterBusiness}
          onClose={() => setShowCreateModal(false)} onCreated={() => { setShowCreateModal(false); triggerRefresh(); }} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Envanter Satırı
// ══════════════════════════════════════════════════════════

function InventoryRow({ item, onClick, showBusiness }: { item: InventoryItem; onClick: () => void; showBusiness: boolean }) {
  const catDef = getCategoryDef(item.category);
  const Icon = catDef.icon;
  const statusCfg = STATUS_LABELS[item.status] || STATUS_LABELS.ACTIVE;
  const isLowStock = item.category === "CONSUMABLE" && item.current_stock != null
    && item.minimum_stock != null && item.current_stock <= item.minimum_stock;

  return (
    <div onClick={onClick} className="flex items-center gap-3 p-4 hover:bg-surface-700 transition-colors cursor-pointer group">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", catDef.bg)}>
        <Icon size={18} className={catDef.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white truncate">{item.name}</p>
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border", statusCfg.bg, statusCfg.color)}>
            {statusCfg.label}
          </span>
          {isLowStock && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 border border-red-500/30 text-red-600">Dusuk Stok</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-surface-400 flex-wrap">
          {item.brand && <span>{item.brand}{item.model ? ` ${item.model}` : ""}</span>}
          {item.serial_number && <span>· SN: {item.serial_number}</span>}
          {item.location && <span>· <MapPin size={10} className="inline" /> {item.location}</span>}
          {item.assigned_to && <span>· <User size={10} className="inline" /> {item.assigned_to}</span>}
          {showBusiness && item.business_name && <span className="text-brand-500">· {item.business_name}</span>}
        </div>
        {item.category === "CONSUMABLE" && item.current_stock != null && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className={cn("text-xs font-medium", isLowStock ? "text-red-600" : "text-surface-300")}>
              Stok: {item.current_stock} {UNIT_LABELS[item.unit || ""] || item.unit || ""}
            </span>
            {item.minimum_stock != null && <span className="text-[10px] text-surface-400">(min: {item.minimum_stock})</span>}
          </div>
        )}
      </div>
      <ChevronRight size={16} className="text-surface-300 group-hover:text-surface-400 transition-colors shrink-0" />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Detay ve Düzenleme Modalı
// ══════════════════════════════════════════════════════════

function InventoryDetailModal({ item, onClose, onUpdated }: {
  item: InventoryItem; onClose: () => void; onUpdated: () => void;
}) {
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [showAddMaint, setShowAddMaint] = useState(false);
  const [showAddFuel, setShowAddFuel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Düzenlenebilir alanlar
  const [editName, setEditName] = useState(item.name);
  const [editStatus, setEditStatus] = useState(item.status);
  const [editBrand, setEditBrand] = useState(item.brand || "");
  const [editModel, setEditModel] = useState(item.model || "");
  const [editSerialNumber, setEditSerialNumber] = useState(item.serial_number || "");
  const [editCompanyBarcode, setEditCompanyBarcode] = useState(item.company_barcode || "");
  const [editPowerCapacity, setEditPowerCapacity] = useState(item.power_capacity || "");
  const [editEnergySource, setEditEnergySource] = useState(item.energy_source || "");
  const [editDimensions, setEditDimensions] = useState(item.dimensions || "");
  const [editMaterialType, setEditMaterialType] = useState(item.material_type || "");
  const [editModuleCount, setEditModuleCount] = useState(item.module_count?.toString() || "");
  const [editInteriorDetails, setEditInteriorDetails] = useState(item.interior_details || "");
  const [editUnit, setEditUnit] = useState(item.unit || "KG");
  const [editCurrentStock, setEditCurrentStock] = useState(item.current_stock?.toString() || "");
  const [editMinimumStock, setEditMinimumStock] = useState(item.minimum_stock?.toString() || "");
  const [editSku, setEditSku] = useState(item.sku || "");
  const [editWarehouseLocation, setEditWarehouseLocation] = useState(item.warehouse_location || "");
  const [editStockCategory, setEditStockCategory] = useState(item.stock_category || "");
  const [editAssignedTo, setEditAssignedTo] = useState(item.assigned_to || "");
  const [editAssignedType, setEditAssignedType] = useState(item.assigned_type || "");
  const [editLocation, setEditLocation] = useState(item.location || "");
  const [editWarrantyExpiry, setEditWarrantyExpiry] = useState(item.warranty_expiry || "");
  const [editPurchasePrice, setEditPurchasePrice] = useState(item.purchase_price?.toString() || "");
  const [editPurchaseDate, setEditPurchaseDate] = useState(item.purchase_date || "");
  const [editNotes, setEditNotes] = useState(item.notes || "");

  const hasFuel = FUEL_CATEGORIES.has(item.category);

  useEffect(() => {
    api.get<MaintenanceLog[]>(`/inventory/${item.id}/maintenance`).then(setLogs).catch(() => {});
    if (hasFuel) {
      api.get<FuelLog[]>(`/inventory/${item.id}/fuel-logs`).then(setFuelLogs).catch(() => {});
    }
    // Personel listesini yükle (zimmet için)
    api.get<Employee[]>(`/businesses/${item.business_id}/employees`).then(setEmployees).catch(() => {});
  }, [item.id, item.business_id]);

  const statusCfg = STATUS_LABELS[item.status] || STATUS_LABELS.ACTIVE;
  const catDef = getCategoryDef(item.category);
  const fields = getFieldsForCategory(item.category);
  const hasField = (f: string) => fields.includes(f);

  async function handleDelete() {
    setDeleting(true);
    try { await api.delete(`/inventory/${item.id}`); onUpdated(); } catch { setDeleting(false); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.put(`/inventory/${item.id}`, {
        name: editName,
        category: item.category,
        status: editStatus,
        serial_number: editSerialNumber || null,
        company_barcode: editCompanyBarcode || null,
        brand: editBrand || null,
        model: editModel || null,
        power_capacity: editPowerCapacity || null,
        energy_source: editEnergySource || null,
        dimensions: editDimensions || null,
        material_type: editMaterialType || null,
        module_count: editModuleCount ? parseInt(editModuleCount) : null,
        interior_details: editInteriorDetails || null,
        sku: editSku || null,
        unit: editUnit || null,
        minimum_stock: editMinimumStock ? parseFloat(editMinimumStock) : null,
        current_stock: editCurrentStock ? parseFloat(editCurrentStock) : null,
        warehouse_location: editWarehouseLocation || null,
        stock_category: editStockCategory || null,
        assigned_to: editAssignedTo || null,
        assigned_type: editAssignedType || null,
        location: editLocation || null,
        warranty_expiry: editWarrantyExpiry || null,
        purchase_price: editPurchasePrice ? parseMoneyInput(editPurchasePrice) : null,
        purchase_date: editPurchaseDate || null,
        notes: editNotes || null,
      });
      onUpdated();
    } catch {
      setSaving(false);
    }
  }

  const inputCls = "w-full px-3 py-2 rounded-xl border border-surface-600 bg-surface-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

  // Toplam yakıt maliyeti
  const totalFuelCost = fuelLogs.reduce((sum, l) => sum + (l.cost || 0), 0);
  const totalFuelLiters = fuelLogs.reduce((sum, l) => sum + (l.amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-surface-800 rounded-2xl shadow-card-hover border border-surface-600 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-700">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", catDef.bg)}>
              <catDef.icon size={16} className={catDef.color} />
            </div>
            {editing ? (
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                className="text-lg font-bold text-white border-b-2 border-brand-500 outline-none bg-transparent min-w-0" />
            ) : (
              <h3 className="text-lg font-bold text-white truncate">{item.name}</h3>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!editing && (
              <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg hover:bg-brand-50 transition-colors">
                <Pencil size={16} className="text-brand-600" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-600">
              <X size={18} className="text-surface-400" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Durum */}
          {editing ? (
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1">Durum</label>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className={inputCls}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className={cn("px-2 py-1 rounded-lg text-xs font-medium border", statusCfg.bg, statusCfg.color)}>{statusCfg.label}</span>
              <span className="px-2 py-1 rounded-lg text-xs font-medium bg-surface-700 text-surface-300">{catDef.label}</span>
            </div>
          )}

          {/* Kimlik */}
          {(hasField("brand") || hasField("serial_number")) && (
            <DetailSection title="Kimlik Bilgileri">
              {editing ? (
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  {hasField("brand") && <EditField label="Marka" value={editBrand} onChange={setEditBrand} />}
                  {hasField("model") && <EditField label="Model" value={editModel} onChange={setEditModel} />}
                  {hasField("serial_number") && <EditField label="Seri No" value={editSerialNumber} onChange={setEditSerialNumber} />}
                  {hasField("company_barcode") && <EditField label="Barkod/QR" value={editCompanyBarcode} onChange={setEditCompanyBarcode} />}
                </div>
              ) : (
                <>
                  {hasField("brand") && <DetailRow label="Marka" value={item.brand} />}
                  {hasField("model") && <DetailRow label="Model" value={item.model} />}
                  {hasField("serial_number") && <DetailRow label="Seri No" value={item.serial_number} />}
                  {hasField("company_barcode") && <DetailRow label="Barkod/QR" value={item.company_barcode} />}
                </>
              )}
            </DetailSection>
          )}

          {/* Teknik */}
          {(hasField("power_capacity") || hasField("energy_source")) && (
            editing ? (
              <DetailSection title="Teknik Ozellikler">
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  {hasField("power_capacity") && <EditField label="Guc Kapasitesi" value={editPowerCapacity} onChange={setEditPowerCapacity} />}
                  {hasField("energy_source") && (
                    <div>
                      <label className="block text-[10px] text-surface-400 uppercase tracking-wider mb-1">Enerji Kaynagi</label>
                      <select value={editEnergySource} onChange={(e) => setEditEnergySource(e.target.value)} className={inputCls}>
                        <option value="">Seciniz</option>
                        {Object.entries(ENERGY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </DetailSection>
            ) : (item.power_capacity || item.energy_source) ? (
              <DetailSection title="Teknik Ozellikler">
                <DetailRow label="Guc Kapasitesi" value={item.power_capacity} />
                <DetailRow label="Enerji Kaynagi" value={item.energy_source ? ENERGY_LABELS[item.energy_source] || item.energy_source : null} />
              </DetailSection>
            ) : null
          )}

          {/* Fiziksel */}
          {hasField("dimensions") && (
            editing ? (
              <DetailSection title="Fiziksel Ozellikler">
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  <EditField label="Ebatlar" value={editDimensions} onChange={setEditDimensions} />
                  <EditField label="Malzeme Tipi" value={editMaterialType} onChange={setEditMaterialType} />
                  {hasField("module_count") && <EditField label="Modul Sayisi" value={editModuleCount} onChange={setEditModuleCount} type="number" />}
                </div>
                {hasField("interior_details") && (
                  <div className="col-span-2">
                    <label className="block text-[10px] text-surface-400 uppercase tracking-wider mb-1">Ic Donanim</label>
                    <textarea value={editInteriorDetails} onChange={(e) => setEditInteriorDetails(e.target.value)}
                      rows={2} className={inputCls + " resize-none"} />
                  </div>
                )}
              </DetailSection>
            ) : (item.dimensions || item.material_type || item.module_count || item.interior_details) ? (
              <DetailSection title="Fiziksel Ozellikler">
                <DetailRow label="Ebatlar" value={item.dimensions} />
                <DetailRow label="Malzeme Tipi" value={item.material_type} />
                <DetailRow label="Modul Sayisi" value={item.module_count?.toString()} />
                <DetailRow label="Ic Donanim" value={item.interior_details} />
              </DetailSection>
            ) : null
          )}

          {/* Stok */}
          {hasField("current_stock") && (
            editing ? (
              <DetailSection title="Stok Bilgileri">
                <div className="col-span-2 grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-surface-400 uppercase tracking-wider mb-1">Birim</label>
                    <select value={editUnit} onChange={(e) => setEditUnit(e.target.value)} className={inputCls}>
                      {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <EditField label="Mevcut Stok" value={editCurrentStock} onChange={setEditCurrentStock} type="number" />
                  <EditField label="Min. Stok" value={editMinimumStock} onChange={setEditMinimumStock} type="number" />
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  {hasField("sku") && <EditField label="SKU" value={editSku} onChange={setEditSku} />}
                  {hasField("warehouse_location") && <EditField label="Depo/Raf" value={editWarehouseLocation} onChange={setEditWarehouseLocation} />}
                  {hasField("stock_category") && (
                    <div>
                      <label className="block text-[10px] text-surface-400 uppercase tracking-wider mb-1">Kategori</label>
                      <select value={editStockCategory} onChange={(e) => setEditStockCategory(e.target.value)} className={inputCls}>
                        <option value="">Seciniz</option>
                        {Object.entries(STOCK_CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </DetailSection>
            ) : (
              <DetailSection title="Stok Bilgileri">
                <DetailRow label="SKU" value={item.sku} />
                <DetailRow label="Mevcut Stok" value={item.current_stock != null ? `${item.current_stock} ${UNIT_LABELS[item.unit || ""] || item.unit || ""}` : null} />
                <DetailRow label="Minimum Stok" value={item.minimum_stock != null ? `${item.minimum_stock} ${UNIT_LABELS[item.unit || ""] || item.unit || ""}` : null} />
                <DetailRow label="Malzeme Kategorisi" value={item.stock_category ? STOCK_CAT_LABELS[item.stock_category] || item.stock_category : null} />
                <DetailRow label="Depo/Raf" value={item.warehouse_location} />
                <DetailRow label="Parti No" value={item.batch_number} />
                <DetailRow label="Son Kullanma" value={item.expiry_date} />
              </DetailSection>
            )
          )}

          {/* Zimmet ve Lokasyon */}
          {(hasField("assigned_to") || hasField("location")) && (
            editing ? (
              <DetailSection title="Zimmet ve Lokasyon">
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  {hasField("assigned_to") && (
                    <div>
                      <label className="block text-[10px] text-surface-400 uppercase tracking-wider mb-1">Zimmetli Personel</label>
                      <select value={editAssignedTo} onChange={(e) => setEditAssignedTo(e.target.value)} className={inputCls}>
                        <option value="">Seciniz</option>
                        {employees.filter(e => e.is_active).map((emp) => (
                          <option key={emp.id} value={emp.full_name}>{emp.full_name}{emp.position ? ` (${emp.position})` : ""}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {hasField("assigned_type") && (
                    <div>
                      <label className="block text-[10px] text-surface-400 uppercase tracking-wider mb-1">Zimmet Tipi</label>
                      <select value={editAssignedType} onChange={(e) => setEditAssignedType(e.target.value)} className={inputCls}>
                        <option value="">Seciniz</option>
                        <option value="PERSONNEL">Personel</option>
                        <option value="SUBCONTRACTOR">Taseron</option>
                      </select>
                    </div>
                  )}
                  {hasField("location") && <EditField label="Lokasyon" value={editLocation} onChange={setEditLocation} />}
                </div>
              </DetailSection>
            ) : (item.assigned_to || item.location) ? (
              <DetailSection title="Zimmet ve Lokasyon">
                <DetailRow label="Zimmetli" value={item.assigned_to} />
                <DetailRow label="Zimmet Tipi" value={item.assigned_type === "PERSONNEL" ? "Personel" : item.assigned_type === "SUBCONTRACTOR" ? "Taseron" : item.assigned_type} />
                <DetailRow label="Lokasyon" value={item.location} />
              </DetailSection>
            ) : null
          )}

          {/* Bakım / Satın Alma */}
          {(hasField("warranty_expiry") || hasField("purchase_price")) && (
            editing ? (
              <DetailSection title="Bakim / Satin Alma">
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  {hasField("warranty_expiry") && <EditField label="Garanti Bitis" value={editWarrantyExpiry} onChange={setEditWarrantyExpiry} type="date" />}
                  {hasField("purchase_price") && <EditField label="Fiyat" value={editPurchasePrice} onChange={setEditPurchasePrice} money />}
                  {hasField("purchase_date") && <EditField label="Satin Alma Tarihi" value={editPurchaseDate} onChange={setEditPurchaseDate} type="date" />}
                </div>
              </DetailSection>
            ) : (
              <DetailSection title="Bakim / Satin Alma">
                {hasField("warranty_expiry") && <DetailRow label="Garanti Bitis" value={item.warranty_expiry} warn={item.warranty_expiry ? new Date(item.warranty_expiry) < new Date() : false} />}
                {hasField("last_maintenance_date") && <DetailRow label="Son Bakim" value={item.last_maintenance_date} />}
                {hasField("purchase_price") && <DetailRow label="Satin Alma Fiyati" value={item.purchase_price ? formatCurrency(item.purchase_price) : null} />}
                {hasField("purchase_date") && <DetailRow label="Satin Alma Tarihi" value={item.purchase_date} />}
              </DetailSection>
            )
          )}

          {/* Notlar */}
          {editing ? (
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1">Notlar</label>
              <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} className={inputCls + " resize-none"} />
            </div>
          ) : item.notes ? (
            <div className="p-3 bg-surface-700 rounded-xl">
              <p className="text-[10px] text-surface-400 uppercase tracking-wider mb-1">Notlar</p>
              <p className="text-sm text-surface-200">{item.notes}</p>
            </div>
          ) : null}

          {/* ── Bakım Geçmişi ── */}
          {!editing && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-surface-200 flex items-center gap-1"><Activity size={14} /> Bakim Gecmisi</h4>
                <button onClick={() => setShowAddMaint(true)}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1">
                  <Plus size={12} /> Kayit Ekle
                </button>
              </div>
              {logs.length === 0 ? (
                <p className="text-xs text-surface-400 p-3 bg-surface-700 rounded-xl">Henuz bakim kaydi yok</p>
              ) : (
                <div className="space-y-1.5">
                  {logs.map((log) => (
                    <div key={log.id} className="p-3 bg-surface-700 rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-surface-200">{MAINTENANCE_LABELS[log.maintenance_type] || log.maintenance_type}</span>
                        <span className="text-[10px] text-surface-400">{log.date}</span>
                      </div>
                      {log.description && <p className="text-xs text-surface-300 mt-0.5">{log.description}</p>}
                      <div className="flex gap-3 mt-0.5 text-[10px] text-surface-400">
                        {log.cost != null && <span>Maliyet: {formatCurrency(log.cost)}</span>}
                        {log.performed_by && <span>Yapan: {log.performed_by}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Yakıt Masrafı (sadece araç kategorileri) ── */}
          {!editing && hasFuel && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-surface-200 flex items-center gap-1">
                  <Fuel size={14} /> Yakit Masrafi
                  {fuelLogs.length > 0 && (
                    <span className="text-[10px] font-normal text-surface-400 ml-1">
                      ({formatCurrency(totalFuelCost)} / {totalFuelLiters.toFixed(1)} L)
                    </span>
                  )}
                </h4>
                <button onClick={() => setShowAddFuel(true)}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1">
                  <Plus size={12} /> Kayit Ekle
                </button>
              </div>
              {fuelLogs.length === 0 ? (
                <p className="text-xs text-surface-400 p-3 bg-surface-700 rounded-xl">Henuz yakit kaydi yok</p>
              ) : (
                <div className="space-y-1.5">
                  {fuelLogs.map((log) => (
                    <div key={log.id} className="p-3 bg-orange-50/50 border border-orange-100 rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-surface-200">
                          {FUEL_TYPE_LABELS[log.fuel_type] || log.fuel_type} — {log.amount} L
                        </span>
                        <span className="text-[10px] text-surface-400">{log.date}</span>
                      </div>
                      <div className="flex gap-3 mt-0.5 text-[10px] text-surface-400 flex-wrap">
                        <span className="text-orange-600 font-medium">{formatCurrency(log.cost)}</span>
                        {log.amount > 0 && <span>{formatCurrency(log.cost / log.amount)}/L</span>}
                        {log.odometer_km != null && <span>KM: {log.odometer_km}</span>}
                        {log.station && <span>Istasyon: {log.station}</span>}
                      </div>
                      {log.notes && <p className="text-xs text-surface-400 mt-0.5">{log.notes}</p>}
                      {log.receipt_url && (
                        <a href={log.receipt_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1 text-[10px] text-brand-600 hover:text-brand-700">
                          <Camera size={10} /> Fis Goruntule
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Alt Butonlar */}
          <div className="flex gap-3 pt-2">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-xl text-sm font-medium transition-colors">Vazgec</button>
                <button onClick={handleSave} disabled={saving || !editName}
                  className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
                </button>
              </>
            ) : (
              <>
                <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-xl text-sm font-medium transition-colors">Kapat</button>
                <button onClick={handleDelete} disabled={deleting}
                  className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Sil
                </button>
              </>
            )}
          </div>
        </div>

        {/* Sub-modals */}
        {showAddMaint && (
          <AddMaintenanceModal itemId={item.id} onClose={() => setShowAddMaint(false)}
            onAdded={(log) => { setLogs((prev) => [log, ...prev]); setShowAddMaint(false); }} />
        )}
        {showAddFuel && (
          <AddFuelLogModal itemId={item.id} onClose={() => setShowAddFuel(false)}
            onAdded={(log) => { setFuelLogs((prev) => [log, ...prev]); setShowAddFuel(false); }} />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Yardımcı Bileşenler
// ══════════════════════════════════════════════════════════

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">{title}</h4>
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  );
}

function DetailRow({ label, value, warn }: { label: string; value: string | null | undefined; warn?: boolean }) {
  if (!value) return null;
  return (
    <div className="p-2 bg-surface-700 rounded-lg">
      <p className="text-[10px] text-surface-400 uppercase tracking-wider">{label}</p>
      <p className={cn("text-sm font-medium", warn ? "text-red-600" : "text-white")}>{value}</p>
    </div>
  );
}

function EditField({ label, value, onChange, type = "text", money = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; money?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] text-surface-400 uppercase tracking-wider mb-1">{label}</label>
      <input type={money ? "text" : type} inputMode={money ? "numeric" : undefined} value={value}
        onChange={(e) => onChange(money ? formatMoneyInput(e.target.value) : e.target.value)}
        step={!money && type === "number" ? "0.01" : undefined}
        className="w-full px-3 py-2 rounded-xl border border-surface-600 bg-surface-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Bakım Ekleme Modalı
// ══════════════════════════════════════════════════════════

function AddMaintenanceModal({ itemId, onClose, onAdded }: {
  itemId: string; onClose: () => void; onAdded: (log: MaintenanceLog) => void;
}) {
  const [type, setType] = useState("INSPECTION");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [performedBy, setPerformedBy] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const log = await api.post<MaintenanceLog>(`/inventory/${itemId}/maintenance`, {
        maintenance_type: type, description: description || null,
        cost: cost ? parseMoneyInput(cost) : null, date, performed_by: performedBy || null,
      });
      onAdded(log);
    } catch { setSaving(false); }
  }

  const inputCls = "w-full px-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-surface-800 rounded-2xl shadow-card-hover border border-surface-600 w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h3 className="text-lg font-bold text-white">Bakim Kaydi Ekle</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-600"><X size={20} className="text-surface-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">Bakim Tipi</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
              {Object.entries(MAINTENANCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">Tarih</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">Aciklama</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls + " resize-none"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1">Maliyet (TRY)</label>
              <input type="text" inputMode="numeric" value={cost} onChange={(e) => setCost(formatMoneyInput(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1">Yapan</label>
              <input type="text" value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-medium text-surface-200 bg-surface-700 hover:bg-surface-600 transition-colors">Vazgec</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 transition-colors flex items-center justify-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Yakıt Kaydı Ekleme Modalı
// ══════════════════════════════════════════════════════════

function AddFuelLogModal({ itemId, onClose, onAdded }: {
  itemId: string; onClose: () => void; onAdded: (log: FuelLog) => void;
}) {
  const [fuelType, setFuelType] = useState("DIESEL");
  const [amount, setAmount] = useState("");
  const [priceRaw, setPriceRaw] = useState(""); // sadece rakamlar, max 4 hane
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [odometerKm, setOdometerKm] = useState("");
  const [station, setStation] = useState("");
  const [timeRaw, setTimeRaw] = useState(""); // sadece rakamlar, max 4 hane (HHmm)
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Fotoğraf yükleme
  const [uploadedFiles, setUploadedFiles] = useState<FileUploadInfo[]>([]);
  const [receiptUrl, setReceiptUrl] = useState("");

  // "6568" -> "65.68"
  const priceDisplay = priceRaw.length <= 2
    ? priceRaw
    : priceRaw.slice(0, priceRaw.length - 2) + "," + priceRaw.slice(priceRaw.length - 2);
  const priceValue = priceRaw.length <= 2
    ? (priceRaw ? parseInt(priceRaw, 10) : 0)
    : parseInt(priceRaw.slice(0, priceRaw.length - 2), 10) + parseInt(priceRaw.slice(priceRaw.length - 2), 10) / 100;

  const totalCost = amount && priceRaw.length === 4 ? (parseFloat(amount) * priceValue) : 0;

  // Saat: "1503" -> "15:03"
  const timeDisplay = timeRaw.length <= 2
    ? timeRaw
    : timeRaw.slice(0, 2) + ":" + timeRaw.slice(2);

  function handleTimeKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      setTimeRaw((prev) => prev.slice(0, -1));
      return;
    }
    if (!/^\d$/.test(e.key)) { e.preventDefault(); return; }
    if (timeRaw.length >= 4) { e.preventDefault(); return; }
    const next = timeRaw + e.key;
    // Saat validasyonu: ilk 2 hane 0-23, son 2 hane 0-59
    if (next.length === 1 && parseInt(next) > 2) { e.preventDefault(); return; }
    if (next.length === 2 && parseInt(next) > 23) { e.preventDefault(); return; }
    if (next.length === 3 && parseInt(next.slice(2)) > 5) { e.preventDefault(); return; }
    e.preventDefault();
    setTimeRaw(next);
  }

  function handlePriceKey(e: React.KeyboardEvent<HTMLInputElement>) {
    // Sadece rakam ve silme tuşlarına izin ver
    if (e.key === "Backspace") {
      e.preventDefault();
      setPriceRaw((prev) => prev.slice(0, -1));
      return;
    }
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
      return;
    }
    if (priceRaw.length >= 4) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    setPriceRaw((prev) => prev + e.key);
  }

  async function handleSave() {
    if (!amount || priceRaw.length !== 4) return;
    setSaving(true);
    try {
      const log = await api.post<FuelLog>(`/inventory/${itemId}/fuel-logs`, {
        fuel_type: fuelType,
        amount: parseFloat(amount),
        cost: totalCost,
        date,
        odometer_km: odometerKm ? parseFloat(odometerKm) : null,
        station: station || null,
        receipt_url: receiptUrl || (uploadedFiles.length > 0 ? uploadedFiles[0].url : null),
        notes: [timeRaw.length === 4 ? `Saat: ${timeDisplay}` : null, notes || null].filter(Boolean).join(" | ") || null,
      });
      onAdded(log);
    } catch { setSaving(false); }
  }

  const inputCls = "w-full px-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-surface-800 rounded-2xl shadow-card-hover border border-surface-600 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
              <Fuel size={16} className="text-orange-600" />
            </div>
            <h3 className="text-lg font-bold text-white">Yakit Kaydi Ekle</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-600"><X size={20} className="text-surface-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1">Yakit Tipi</label>
              <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} className={inputCls}>
                {Object.entries(FUEL_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1">Tarih</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1">Saat</label>
              <input
                type="text"
                inputMode="numeric"
                value={timeDisplay}
                onKeyDown={handleTimeKey}
                onChange={() => {}}
                placeholder="00:00"
                className={inputCls + " text-center font-mono tracking-wider"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1">Miktar (Litre) *</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} step="0.01" min="0" className={inputCls} placeholder="50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1">Litre Fiyati (TRY) *</label>
              <input
                type="text"
                inputMode="numeric"
                value={priceDisplay}
                onKeyDown={handlePriceKey}
                onChange={() => {}}
                placeholder="00,00"
                className={inputCls + " text-right font-mono tracking-wider"}
              />
            </div>
          </div>

          {/* Otomatik hesaplanan toplam */}
          {totalCost > 0 && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-between">
              <span className="text-sm font-medium text-surface-200">Toplam Tutar</span>
              <span className="text-lg font-bold text-orange-600">{formatCurrency(totalCost)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1">KM / Saat Sayaci</label>
              <input type="number" value={odometerKm} onChange={(e) => setOdometerKm(e.target.value)} step="0.1" className={inputCls} placeholder="15230" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1">Istasyon</label>
              <input type="text" value={station} onChange={(e) => setStation(e.target.value)} className={inputCls} placeholder="Shell - Kadikoy" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">Notlar</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls + " resize-none"} />
          </div>

          {/* Fiş/Fatura Fotoğrafı */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">Fis / Fatura Fotografi</label>
            <InlineFileUpload
              category="fuel_receipt"
              onUploaded={(file) => {
                setUploadedFiles((prev) => [...prev, file]);
                setReceiptUrl(file.url);
              }}
              uploadedFiles={uploadedFiles}
              onRemoveFile={(fileId) => {
                setUploadedFiles((prev) => {
                  const next = prev.filter((f) => f.id !== fileId);
                  setReceiptUrl(next.length > 0 ? next[0].url : "");
                  return next;
                });
              }}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-medium text-surface-200 bg-surface-700 hover:bg-surface-600 transition-colors">Vazgec</button>
            <button onClick={handleSave} disabled={saving || !amount || priceRaw.length !== 4}
              className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 transition-colors flex items-center justify-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Envanter Oluşturma Modalı — kategoriye göre akıllı alanlar
// ══════════════════════════════════════════════════════════

function CreateInventoryModal({ businesses, presetBusinessId, onClose, onCreated }: {
  businesses: Business[]; presetBusinessId: string; onClose: () => void; onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [businessId, setBusinessId] = useState(presetBusinessId || businesses[0]?.id || "");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [notes, setNotes] = useState("");

  // Tüm alanlar
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [companyBarcode, setCompanyBarcode] = useState("");
  const [powerCapacity, setPowerCapacity] = useState("");
  const [energySource, setEnergySource] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [materialType, setMaterialType] = useState("");
  const [moduleCount, setModuleCount] = useState("");
  const [interiorDetails, setInteriorDetails] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("KG");
  const [minimumStock, setMinimumStock] = useState("");
  const [currentStock, setCurrentStock] = useState("");
  const [warehouseLocation, setWarehouseLocation] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [stockCategory, setStockCategory] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [assignedType, setAssignedType] = useState("");
  const [location, setLocation] = useState("");
  const [warrantyExpiry, setWarrantyExpiry] = useState("");
  const [lastMaintenanceDate, setLastMaintenanceDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");

  // Personel listesi
  const [employees, setEmployees] = useState<Employee[]>([]);

  const selectedBiz = businesses.find((b) => b.id === businessId);
  const bizCategories = getCategoriesForBusinessType(undefined /* v1.6.2 */);

  useEffect(() => {
    if (bizCategories.length > 0 && !bizCategories.find((c) => c.key === category)) {
      setCategory(bizCategories[0].key);
    }
  }, [businessId, bizCategories]);

  // Personel yükle
  useEffect(() => {
    if (businessId) {
      api.get<Employee[]>(`/businesses/${businessId}/employees`).then(setEmployees).catch(() => setEmployees([]));
    }
  }, [businessId]);

  const fields = getFieldsForCategory(category);
  const hasField = (f: string) => fields.includes(f);

  const inputCls = "w-full px-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";

  async function handleSave() {
    if (!businessId || !name || !category) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/businesses/${businessId}/inventory`, {
        name, category, status,
        serial_number: hasField("serial_number") && serialNumber ? serialNumber : null,
        company_barcode: hasField("company_barcode") && companyBarcode ? companyBarcode : null,
        brand: hasField("brand") && brand ? brand : null,
        model: hasField("model") && model ? model : null,
        power_capacity: hasField("power_capacity") && powerCapacity ? powerCapacity : null,
        energy_source: hasField("energy_source") && energySource ? energySource : null,
        dimensions: hasField("dimensions") && dimensions ? dimensions : null,
        material_type: hasField("material_type") && materialType ? materialType : null,
        module_count: hasField("module_count") && moduleCount ? parseInt(moduleCount) : null,
        interior_details: hasField("interior_details") && interiorDetails ? interiorDetails : null,
        sku: hasField("sku") && sku ? sku : null,
        unit: hasField("unit") || hasField("current_stock") ? unit : null,
        minimum_stock: hasField("minimum_stock") && minimumStock ? parseFloat(minimumStock) : null,
        current_stock: hasField("current_stock") && currentStock ? parseFloat(currentStock) : null,
        warehouse_location: hasField("warehouse_location") && warehouseLocation ? warehouseLocation : null,
        batch_number: hasField("batch_number") && batchNumber ? batchNumber : null,
        expiry_date: hasField("expiry_date") && expiryDate ? expiryDate : null,
        stock_category: hasField("stock_category") && stockCategory ? stockCategory : null,
        assigned_to: hasField("assigned_to") && assignedTo ? assignedTo : null,
        assigned_type: hasField("assigned_type") && assignedType ? assignedType : null,
        location: hasField("location") && location ? location : null,
        warranty_expiry: hasField("warranty_expiry") && warrantyExpiry ? warrantyExpiry : null,
        last_maintenance_date: hasField("last_maintenance_date") && lastMaintenanceDate ? lastMaintenanceDate : null,
        purchase_price: hasField("purchase_price") && purchasePrice ? parseMoneyInput(purchasePrice) : null,
        purchase_date: hasField("purchase_date") && purchaseDate ? purchaseDate : null,
        notes: notes || null,
      });
      onCreated();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Hata olustu"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-surface-800 rounded-2xl shadow-card-hover border border-surface-600 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h3 className="text-lg font-bold text-white">Envanter Ekle</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-600"><X size={20} className="text-surface-400" /></button>
        </div>

        <div className="p-4 space-y-3">
          {/* İşletme */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">Isletme</label>
            <select value={businessId} onChange={(e) => setBusinessId(e.target.value)} className={inputCls}>
              {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {/* Kategori + Durum */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1">Kategori</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {bizCategories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1">Durum</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          {/* Ad */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">Kalem Adi *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={category === "CONSUMABLE" ? "Ornek: Cimento, Insaat Demiri" : category === "HEAVY_VEHICLE" ? "Ornek: CAT 320 Ekskavatör" : "Ad girin"}
              className={inputCls} />
          </div>

          {/* Marka / Model */}
          {hasField("brand") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-surface-200 mb-1">Marka</label>
                <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls} />
              </div>
              {hasField("model") && (
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Model</label>
                  <input type="text" value={model} onChange={(e) => setModel(e.target.value)} className={inputCls} />
                </div>
              )}
            </div>
          )}

          {/* Seri No / Barkod */}
          {(hasField("serial_number") || hasField("company_barcode")) && (
            <div className="grid grid-cols-2 gap-3">
              {hasField("serial_number") && (
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Seri No</label>
                  <input type="text" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className={inputCls} />
                </div>
              )}
              {hasField("company_barcode") && (
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Sirket Barkod/QR</label>
                  <input type="text" value={companyBarcode} onChange={(e) => setCompanyBarcode(e.target.value)} className={inputCls} />
                </div>
              )}
            </div>
          )}

          {/* Güç / Enerji Kaynağı */}
          {(hasField("power_capacity") || hasField("energy_source")) && (
            <div className="grid grid-cols-2 gap-3">
              {hasField("power_capacity") && (
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Guc Kapasitesi</label>
                  <input type="text" value={powerCapacity} onChange={(e) => setPowerCapacity(e.target.value)} placeholder="150 kVA" className={inputCls} />
                </div>
              )}
              {hasField("energy_source") && (
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Enerji Kaynagi</label>
                  <select value={energySource} onChange={(e) => setEnergySource(e.target.value)} className={inputCls}>
                    <option value="">Seciniz</option>
                    {Object.entries(ENERGY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Stok alanları (Sarf Malzeme) */}
          {hasField("current_stock") && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Birim</label>
                  <select value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls}>
                    {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Mevcut Stok</label>
                  <input type="number" value={currentStock} onChange={(e) => setCurrentStock(e.target.value)} step="0.01" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Min. Stok</label>
                  <input type="number" value={minimumStock} onChange={(e) => setMinimumStock(e.target.value)} step="0.01" className={inputCls} />
                </div>
              </div>
              {hasField("sku") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-surface-200 mb-1">Stok Kodu (SKU)</label>
                    <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} className={inputCls} />
                  </div>
                  {hasField("stock_category") && (
                    <div>
                      <label className="block text-sm font-medium text-surface-200 mb-1">Malzeme Kategorisi</label>
                      <select value={stockCategory} onChange={(e) => setStockCategory(e.target.value)} className={inputCls}>
                        <option value="">Seciniz</option>
                        {Object.entries(STOCK_CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
              {hasField("warehouse_location") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-surface-200 mb-1">Depo / Raf</label>
                    <input type="text" value={warehouseLocation} onChange={(e) => setWarehouseLocation(e.target.value)} className={inputCls} />
                  </div>
                  {hasField("batch_number") && (
                    <div>
                      <label className="block text-sm font-medium text-surface-200 mb-1">Parti No</label>
                      <input type="text" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} className={inputCls} />
                    </div>
                  )}
                </div>
              )}
              {hasField("expiry_date") && (
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Son Kullanma Tarihi</label>
                  <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputCls} />
                </div>
              )}
            </>
          )}

          {/* Fiziksel (Şantiye Kurulum) */}
          {hasField("dimensions") && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Ebatlar</label>
                  <input type="text" value={dimensions} onChange={(e) => setDimensions(e.target.value)} placeholder="3x7 metre" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Malzeme Tipi</label>
                  <input type="text" value={materialType} onChange={(e) => setMaterialType(e.target.value)} className={inputCls} />
                </div>
              </div>
              {hasField("module_count") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-surface-200 mb-1">Modul Sayisi</label>
                    <input type="number" value={moduleCount} onChange={(e) => setModuleCount(e.target.value)} className={inputCls} />
                  </div>
                </div>
              )}
              {hasField("interior_details") && (
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Ic Donanim</label>
                  <textarea value={interiorDetails} onChange={(e) => setInteriorDetails(e.target.value)} rows={2}
                    placeholder="4 yatak, 1 klima, 2 masa" className={inputCls + " resize-none"} />
                </div>
              )}
            </>
          )}

          {/* Zimmet / Lokasyon — Personel dropdown */}
          {(hasField("assigned_to") || hasField("location")) && (
            <div className="grid grid-cols-2 gap-3">
              {hasField("assigned_to") && (
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Zimmetli Personel</label>
                  <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputCls}>
                    <option value="">Seciniz</option>
                    {employees.filter(e => e.is_active).map((emp) => (
                      <option key={emp.id} value={emp.full_name}>{emp.full_name}{emp.position ? ` (${emp.position})` : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              {hasField("location") && (
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Lokasyon</label>
                  <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
                </div>
              )}
            </div>
          )}
          {hasField("assigned_type") && hasField("assigned_to") && (
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1">Zimmet Tipi</label>
              <select value={assignedType} onChange={(e) => setAssignedType(e.target.value)} className={inputCls}>
                <option value="">Seciniz</option>
                <option value="PERSONNEL">Personel</option>
                <option value="SUBCONTRACTOR">Taseron</option>
              </select>
            </div>
          )}

          {/* Garanti / Bakım / Satın Alma */}
          {(hasField("warranty_expiry") || hasField("purchase_price")) && (
            <div className="grid grid-cols-2 gap-3">
              {hasField("warranty_expiry") && (
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Garanti Bitis</label>
                  <input type="date" value={warrantyExpiry} onChange={(e) => setWarrantyExpiry(e.target.value)} className={inputCls} />
                </div>
              )}
              {hasField("last_maintenance_date") && (
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Son Bakim</label>
                  <input type="date" value={lastMaintenanceDate} onChange={(e) => setLastMaintenanceDate(e.target.value)} className={inputCls} />
                </div>
              )}
            </div>
          )}
          {hasField("purchase_price") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-surface-200 mb-1">Satin Alma Fiyati</label>
                <input type="text" inputMode="numeric" value={purchasePrice} onChange={(e) => setPurchasePrice(formatMoneyInput(e.target.value))} className={inputCls} />
              </div>
              {hasField("purchase_date") && (
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Satin Alma Tarihi</label>
                  <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={inputCls} />
                </div>
              )}
            </div>
          )}

          {/* Notlar */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">Notlar</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls + " resize-none"} />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-medium text-surface-200 bg-surface-700 hover:bg-surface-600 transition-colors">Vazgec</button>
            <button onClick={handleSave} disabled={saving || !name || !businessId}
              className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 transition-colors flex items-center justify-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

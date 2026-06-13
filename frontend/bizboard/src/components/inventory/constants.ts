// ══════════════════════════════════════════════════════════
// Envanter — paylasilan sabitler, etiketler ve yardimcilar
// (R3 god-component bolme: page.tsx'ten cikarildi, davranis korundu)
// ══════════════════════════════════════════════════════════

import {
  Truck, Wrench, Building, Package, Boxes, UtensilsCrossed,
  Monitor, ShoppingCart, Sofa,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ══════════════════════════════════════════════════════════
// İş tipine göre envanter kategori tanımları
// ══════════════════════════════════════════════════════════

export interface CategoryDef {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
}

export const ALL_TAB: CategoryDef = { key: "ALL", label: "Tümü", icon: Boxes, color: "text-surface-300", bg: "bg-surface-700" };

export const CONSTRUCTION_CATEGORIES: CategoryDef[] = [
  { key: "HEAVY_VEHICLE",   label: "Ağır Araç / Makine", icon: Truck,          color: "text-orange-400", bg: "bg-orange-500/15" },
  { key: "LIGHT_EQUIPMENT", label: "Hafif Ekipman",       icon: Wrench,         color: "text-blue-400",   bg: "bg-blue-500/15" },
  { key: "SITE_SETUP",      label: "Şantiye Kurulum",     icon: Building,       color: "text-teal-400",   bg: "bg-teal-500/15" },
  { key: "CONSUMABLE",      label: "Sarf Malzeme",        icon: Package,        color: "text-purple-400", bg: "bg-purple-500/15" },
];

export const RESTAURANT_CATEGORIES: CategoryDef[] = [
  { key: "KITCHEN_EQUIPMENT", label: "Mutfak Ekipman",  icon: UtensilsCrossed, color: "text-orange-400", bg: "bg-orange-500/15" },
  { key: "FURNITURE",         label: "Mobilya / Dekor", icon: Sofa,            color: "text-teal-400",   bg: "bg-teal-500/15" },
  { key: "CONSUMABLE",        label: "Sarf Malzeme",    icon: Package,         color: "text-purple-400", bg: "bg-purple-500/15" },
];

export const TECHNOLOGY_CATEGORIES: CategoryDef[] = [
  { key: "IT_EQUIPMENT", label: "Bilişim Ekipman", icon: Monitor, color: "text-blue-400",   bg: "bg-blue-500/15" },
  { key: "FURNITURE",    label: "Ofis Mobilya",    icon: Sofa,    color: "text-teal-400",   bg: "bg-teal-500/15" },
  { key: "CONSUMABLE",   label: "Sarf Malzeme",    icon: Package, color: "text-purple-400", bg: "bg-purple-500/15" },
];

export const RETAIL_CATEGORIES: CategoryDef[] = [
  { key: "STORE_EQUIPMENT", label: "Mağaza Ekipman", icon: ShoppingCart, color: "text-orange-400", bg: "bg-orange-500/15" },
  { key: "CONSUMABLE",      label: "Sarf Malzeme",   icon: Package,      color: "text-purple-400", bg: "bg-purple-500/15" },
];

export const GENERIC_CATEGORIES: CategoryDef[] = [
  { key: "EQUIPMENT",  label: "Ekipman",     icon: Wrench,  color: "text-blue-400",   bg: "bg-blue-500/15" },
  { key: "FURNITURE",  label: "Mobilya",     icon: Sofa,    color: "text-teal-400",   bg: "bg-teal-500/15" },
  { key: "CONSUMABLE", label: "Sarf Malzeme", icon: Package, color: "text-purple-400", bg: "bg-purple-500/15" },
];

export function getCategoriesForBusinessType(category?: string): CategoryDef[] {
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

export function getCategoryDef(key: string): CategoryDef {
  return ALL_CATEGORY_MAP[key] || { key, label: key, icon: Package, color: "text-surface-300", bg: "bg-surface-700" };
}

// Yakıt takibi olan kategoriler
export const FUEL_CATEGORIES = new Set(["HEAVY_VEHICLE", "LIGHT_EQUIPMENT"]);

// ══════════════════════════════════════════════════════════
// Durum ve etiket sabitleri
// ══════════════════════════════════════════════════════════

export const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE:   { label: "Aktif",    color: "text-green-400",  bg: "bg-green-500/10 border-green-500/30" },
  IN_STOCK: { label: "Stokta",   color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30" },
  BROKEN:   { label: "Arızalı",  color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30" },
  IN_REPAIR:{ label: "Tamirde",  color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/30" },
  SCRAPPED: { label: "Hurda",    color: "text-surface-400", bg: "bg-surface-700 border-surface-600" },
};

export const ENERGY_LABELS: Record<string, string> = {
  BATTERY: "Akülu", GASOLINE: "Benzinli", DIESEL: "Dizel",
  ELECTRIC_220V: "220V", ELECTRIC_380V: "380V",
};

export const UNIT_LABELS: Record<string, string> = {
  PIECE: "Adet", TON: "Ton", KG: "Kg", METER: "Metre",
  CUBIC_METER: "m³", BOX: "Kutu", SET: "Set", LITRE: "Litre",
};

export const STOCK_CAT_LABELS: Record<string, string> = {
  ROUGH_CONSTRUCTION: "Kaba Yapı", FINE_CONSTRUCTION: "İnce Yapı",
  SAFETY_EQUIPMENT: "İSG Malzemesi", CHEMICAL: "Kimyasal", OTHER: "Diğer",
};

export const MAINTENANCE_LABELS: Record<string, string> = {
  OIL_CHANGE: "Yağ Değişimi", FILTER_CHANGE: "Filtre Değişimi",
  REPAIR: "Onarım", PART_REPLACEMENT: "Parça Değişimi",
  INSPECTION: "Periyodik Kontrol", OTHER: "Diğer",
};

export const FUEL_TYPE_LABELS: Record<string, string> = {
  DIESEL: "Dizel", GASOLINE: "Benzin", LPG: "LPG", ELECTRIC: "Elektrik", OTHER: "Diğer",
};

// Hangi kategoride hangi alanlar gösterilecek
export const CATEGORY_FIELDS: Record<string, string[]> = {
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

export function getFieldsForCategory(category: string): string[] {
  return CATEGORY_FIELDS[category] || CATEGORY_FIELDS.EQUIPMENT || [];
}

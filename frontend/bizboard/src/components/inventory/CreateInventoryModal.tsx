"use client";

// ══════════════════════════════════════════════════════════
// Envanter Oluşturma Modalı — kategoriye göre akıllı alanlar
// (R3 god-component bolme: page.tsx'ten cikarildi)
// ══════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { X, Loader2, Save } from "lucide-react";
import { formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { Business, Employee } from "@/types";
import {
  STATUS_LABELS, ENERGY_LABELS, UNIT_LABELS, STOCK_CAT_LABELS,
  getCategoriesForBusinessType, getFieldsForCategory,
} from "./constants";

export function CreateInventoryModal({ businesses, presetBusinessId, onClose, onCreated }: {
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
  const [reorderPoint, setReorderPoint] = useState("");
  const [reorderLeadDays, setReorderLeadDays] = useState("7");
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
        reorder_point: hasField("current_stock") && reorderPoint ? parseFloat(reorderPoint) : null,
        reorder_lead_days: hasField("current_stock") && reorderLeadDays ? parseInt(reorderLeadDays) : null,
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
      toast.success("Stok eklendi");
      onCreated();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Hata olustu"));
      toast.error(err);
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Reorder Esigi (ops.)</label>
                  <input type="number" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} step="0.01" className={inputCls} placeholder="Bos = otomatik" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-200 mb-1">Temin Suresi (gun)</label>
                  <input type="number" value={reorderLeadDays} onChange={(e) => setReorderLeadDays(e.target.value)} step="1" className={inputCls} />
                </div>
              </div>
              <p className="text-xs text-surface-400 -mt-1">
                Reorder esigi bos birakilirsa min. stok + temin suresi tamponuyla otomatik hesaplanir; stok bu esigin altina dustugunde &quot;Siparis Gerekli&quot; uyarisi cikar.
              </p>
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

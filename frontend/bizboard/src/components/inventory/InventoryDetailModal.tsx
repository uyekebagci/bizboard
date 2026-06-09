"use client";

// ══════════════════════════════════════════════════════════
// Detay ve Düzenleme Modalı
// (R3 god-component bolme: page.tsx'ten cikarildi)
// ══════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import {
  X, Loader2, Trash2, Save, Activity, Pencil, Fuel, Plus, Camera,
} from "lucide-react";
import { formatCurrency, cn, parseMoneyInput } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { InventoryItem, MaintenanceLog, FuelLog, Employee } from "@/types";
import {
  STATUS_LABELS, ENERGY_LABELS, UNIT_LABELS, STOCK_CAT_LABELS,
  MAINTENANCE_LABELS, FUEL_TYPE_LABELS, FUEL_CATEGORIES,
  getCategoryDef, getFieldsForCategory,
} from "./constants";
import { DetailSection, DetailRow, EditField } from "./DetailFields";
import { AddMaintenanceModal } from "./AddMaintenanceModal";
import { AddFuelLogModal } from "./AddFuelLogModal";

export function InventoryDetailModal({ item, onClose, onUpdated }: {
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
  const [editReorderPoint, setEditReorderPoint] = useState(item.reorder_point?.toString() || "");
  const [editReorderLeadDays, setEditReorderLeadDays] = useState(item.reorder_lead_days?.toString() || "7");
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
    try { await api.delete(`/inventory/${item.id}`); toast.info("Stok silindi"); onUpdated(); } catch (err) { toast.error(err); setDeleting(false); }
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
        reorder_point: editReorderPoint ? parseFloat(editReorderPoint) : null,
        reorder_lead_days: editReorderLeadDays ? parseInt(editReorderLeadDays) : null,
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
      toast.success("Stok güncellendi");
      onUpdated();
    } catch (err) {
      toast.error(err);
      setSaving(false);
    }
  }

  const inputCls = "field field-sm py-2";

  // Toplam yakıt maliyeti
  const totalFuelCost = fuelLogs.reduce((sum, l) => sum + (l.cost || 0), 0);
  const totalFuelLiters = fuelLogs.reduce((sum, l) => sum + (l.amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="glass-card shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
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
              <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg hover:bg-brand-500/15 transition-colors">
                <Pencil size={16} className="text-brand-300" />
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
                  <EditField label="Reorder Esigi (ops.)" value={editReorderPoint} onChange={setEditReorderPoint} type="number" />
                  <EditField label="Temin Suresi (gun)" value={editReorderLeadDays} onChange={setEditReorderLeadDays} type="number" />
                </div>
                <p className="col-span-2 text-[10px] text-surface-400 -mt-1">
                  Reorder esigi bos birakilirsa min. stok + temin suresi tamponuyla otomatik hesaplanir.
                </p>
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
                <DetailRow label="Reorder Esigi" value={item.effective_reorder_point != null ? `${item.effective_reorder_point}${item.reorder_point != null ? " (manuel)" : " (oto)"}` : null} />
                <DetailRow label="Temin Suresi" value={item.reorder_lead_days != null ? `${item.reorder_lead_days} gun` : null} />
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
                  className="text-xs font-medium text-brand-300 hover:text-brand-300 flex items-center gap-1">
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
                  className="text-xs font-medium text-brand-300 hover:text-brand-300 flex items-center gap-1">
                  <Plus size={12} /> Kayit Ekle
                </button>
              </div>
              {fuelLogs.length === 0 ? (
                <p className="text-xs text-surface-400 p-3 bg-surface-700 rounded-xl">Henuz yakit kaydi yok</p>
              ) : (
                <div className="space-y-1.5">
                  {fuelLogs.map((log) => (
                    <div key={log.id} className="p-3 bg-orange-500/15 border border-orange-500/20 rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-surface-200">
                          {FUEL_TYPE_LABELS[log.fuel_type] || log.fuel_type} — {log.amount} L
                        </span>
                        <span className="text-[10px] text-surface-400">{log.date}</span>
                      </div>
                      <div className="flex gap-3 mt-0.5 text-[10px] text-surface-400 flex-wrap">
                        <span className="text-orange-300 font-medium">{formatCurrency(log.cost)}</span>
                        {log.amount > 0 && <span>{formatCurrency(log.cost / log.amount)}/L</span>}
                        {log.odometer_km != null && <span>KM: {log.odometer_km}</span>}
                        {log.station && <span>Istasyon: {log.station}</span>}
                      </div>
                      {log.notes && <p className="text-xs text-surface-400 mt-0.5">{log.notes}</p>}
                      {log.receipt_url && (
                        <a href={log.receipt_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1 text-[10px] text-brand-300 hover:text-brand-300">
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
                  className="px-4 py-2.5 bg-red-500/15 hover:bg-red-500/20 text-red-300 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
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

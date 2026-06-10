"use client";

// ══════════════════════════════════════════════════════════
// Bakım Ekleme Modalı
// (R3 god-component bolme: page.tsx'ten cikarildi)
// ══════════════════════════════════════════════════════════

import { useState } from "react";
import { X, Loader2, Save } from "lucide-react";
import { formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { MaintenanceLog } from "@/types";
import { MAINTENANCE_LABELS } from "./constants";

export function AddMaintenanceModal({ itemId, onClose, onAdded }: {
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
      toast.success("Bakım kaydedildi");
      onAdded(log);
    } catch (err) { toast.error(err); setSaving(false); }
  }

  const inputCls = "w-full px-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="glass-card shadow-xl w-full max-w-md">
        <div className="modal-header">
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

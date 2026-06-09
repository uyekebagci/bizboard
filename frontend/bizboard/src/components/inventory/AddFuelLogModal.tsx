"use client";

// ══════════════════════════════════════════════════════════
// Yakıt Kaydı Ekleme Modalı
// (R3 god-component bolme: page.tsx'ten cikarildi)
// ══════════════════════════════════════════════════════════

import { useState } from "react";
import { X, Loader2, Save, Fuel } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { FuelLog, FileUploadInfo } from "@/types";
import { InlineFileUpload } from "@/components/shared/FileUploadButton";
import { FUEL_TYPE_LABELS } from "./constants";

export function AddFuelLogModal({ itemId, onClose, onAdded }: {
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
      toast.success("Yakıt kaydedildi");
      onAdded(log);
    } catch (err) { toast.error(err); setSaving(false); }
  }

  const inputCls = "w-full px-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="glass-card shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
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

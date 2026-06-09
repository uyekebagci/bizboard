"use client";

import { useState, useEffect } from "react";
import {
  Plus, X, Loader2, Car, Fuel, Gauge, Calendar, Shield,
  ChevronRight, Trash2, Edit3, AlertTriangle, MapPin,
  Key, Settings, Hash, FileText, Building2, Clock,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { Vehicle, VehicleSummary } from "@/types";
import { DarkSelect } from "@/components/shared/DarkSelect";

function formatMoney(n: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}
function formatDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}
function formatKm(km: number | null) {
  if (!km) return "-";
  return new Intl.NumberFormat("tr-TR").format(km) + " km";
}

const FUEL_LABELS: Record<string, string> = {
  BENZIN: "Benzin", DIZEL: "Dizel", LPG: "LPG", HYBRID: "Hibrit", ELEKTRIK: "Elektrik",
};
const OWNERSHIP_LABELS: Record<string, string> = {
  OWNED: "Firma Mali", RENTED: "Kiralik", LEASED: "Leasing",
};
const OWNERSHIP_COLORS: Record<string, string> = {
  OWNED: "text-green-300 bg-green-500/10", RENTED: "text-orange-300 bg-orange-500/10", LEASED: "text-purple-300 bg-purple-500/10",
};
const VEHICLE_TYPE_LABELS: Record<string, string> = {
  BINEK: "Binek", HAFIF_TICARI: "Hafif Ticari", AGIR_TICARI: "Agir Ticari", MOTOSIKLET: "Motosiklet", DIGER: "Diger",
};
const TRANSMISSION_LABELS: Record<string, string> = {
  MANUAL: "Manuel", OTOMATIK: "Otomatik",
};
const RENTAL_PERIOD_LABELS: Record<string, string> = {
  DAILY: "Gunluk", WEEKLY: "Haftalik", MONTHLY: "Aylik", YEARLY: "Yillik",
};

interface Props {
  businessId: string;
  currency?: string;
}

export function VehicleModule({ businessId, currency = "TRY" }: Props) {
  const { refreshKey, triggerRefresh } = useAppStore();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [summary, setSummary] = useState<VehicleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Vehicle | null>(null);
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => { fetchData(); }, [businessId, refreshKey]);

  async function fetchData() {
    setLoading(true);
    try {
      const [vData, sData] = await Promise.all([
        api.get<Vehicle[]>(`/businesses/${businessId}/vehicles`),
        api.get<VehicleSummary>(`/businesses/${businessId}/vehicles/summary`),
      ]);
      setVehicles(vData || []);
      setSummary(sData || null);
    } catch (err) {
      logger.error("api", "Vehicle fetch error", undefined, err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = showInactive ? vehicles : vehicles.filter((v) => v.is_active);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-surface-600 rounded-xl" />)}
        </div>
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-surface-600 rounded-xl" />)}
      </div>
    );
  }

  return (
    <>
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="p-3 bg-teal-500/15 border border-teal-500/30 rounded-xl text-center">
            <p className="text-[10px] text-teal-300 uppercase tracking-wider font-medium">Arac</p>
            <p className="text-lg font-bold text-teal-300 mt-0.5">
              {summary.active_vehicles}
              {summary.total_vehicles !== summary.active_vehicles && (
                <span className="text-xs font-normal text-teal-400">/{summary.total_vehicles}</span>
              )}
            </p>
          </div>
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-center">
            <p className="text-[10px] text-green-300 uppercase tracking-wider font-medium">Firma Mali</p>
            <p className="text-lg font-bold text-green-300 mt-0.5">{summary.owned_count}</p>
          </div>
          <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl text-center">
            <p className="text-[10px] text-orange-300 uppercase tracking-wider font-medium">Kiralik</p>
            <p className="text-sm font-bold text-orange-300 mt-0.5">
              {summary.rented_count + summary.leased_count}
              {summary.total_monthly_rental_cost > 0 && (
                <span className="block text-[10px] font-normal text-orange-300 mt-0.5">
                  {formatMoney(summary.total_monthly_rental_cost)} {currency}/ay
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            showInactive ? "bg-surface-600 text-surface-200" : "bg-surface-700 text-surface-400"
          }`}
        >
          {showInactive ? "Tumunu Goster" : "Sadece Aktif"}
        </button>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Plus size={16} /> Arac Ekle
        </button>
      </div>

      {/* Vehicle List */}
      {filtered.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Car size={32} className="mx-auto text-surface-300 mb-2" />
          <p className="text-surface-400 text-sm">Henuz arac eklenmemis</p>
          <p className="text-surface-400 text-xs mt-1">Ilk araci eklemek icin yukaridaki butonu kullanin</p>
        </div>
      ) : (
        <div className="glass-card divide-y divide-surface-700">
          {filtered.map((v) => (
            <div
              key={v.id}
              onClick={() => setDetailTarget(v)}
              className="flex items-center gap-3 p-4 hover:bg-surface-700 transition-colors cursor-pointer group"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                v.is_active ? "bg-teal-500/15" : "bg-surface-700"
              }`}>
                <Car size={18} className={v.is_active ? "text-teal-300" : "text-surface-400"} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-bold tracking-wider ${
                    v.is_active ? "text-white" : "text-surface-400 line-through"
                  }`}>
                    {v.plate_number}
                  </p>
                  <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-full ${
                    OWNERSHIP_COLORS[v.ownership_type] || "text-surface-400 bg-surface-700"
                  }`}>
                    {OWNERSHIP_LABELS[v.ownership_type] || v.ownership_type}
                  </span>
                  {!v.is_active && (
                    <span className="px-1.5 py-0.5 bg-surface-700 text-surface-400 text-[10px] rounded-full">Pasif</span>
                  )}
                </div>
                <p className="text-xs text-surface-400 mt-0.5">
                  {[v.brand, v.model, v.model_year].filter(Boolean).join(" ") || "Detay girilmemis"}
                  {v.fuel_type && ` · ${FUEL_LABELS[v.fuel_type] || v.fuel_type}`}
                </p>
              </div>

              <div className="text-right flex-shrink-0">
                {v.ownership_type !== "OWNED" && v.monthly_rental_cost > 0 ? (
                  <>
                    <p className="text-sm font-semibold text-orange-300">{formatMoney(v.monthly_rental_cost)} {currency}/ay</p>
                    <p className="text-[10px] text-surface-400">{RENTAL_PERIOD_LABELS[v.rental_period || ""] || ""} kiralama</p>
                  </>
                ) : (
                  <p className="text-xs text-surface-400">{formatKm(v.current_km)}</p>
                )}
              </div>

              <ChevronRight size={16} className="text-surface-300 flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateVehicleModal businessId={businessId} onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchData(); triggerRefresh(); }} />
      )}
      {detailTarget && (
        <VehicleDetailModal vehicle={detailTarget} currency={currency}
          onClose={() => setDetailTarget(null)}
          onEdit={() => { setDetailTarget(null); setEditTarget(detailTarget); }}
          onToggleActive={async () => {
            try { await api.patch(`/vehicles/${detailTarget.id}/toggle-active`); toast.success("Araç durumu güncellendi"); setDetailTarget(null); fetchData(); triggerRefresh(); } catch (err) { logger.error("api", "Vehicle toggle-active failed", undefined, err); toast.error(err); }
          }}
          onDelete={() => { setDetailTarget(null); setDeleteTarget(detailTarget); }} />
      )}
      {editTarget && (
        <CreateVehicleModal businessId={businessId} vehicle={editTarget}
          onClose={() => setEditTarget(null)}
          onCreated={() => { setEditTarget(null); fetchData(); triggerRefresh(); }} />
      )}
      {deleteTarget && (
        <DeleteVehicleModal vehicle={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); fetchData(); triggerRefresh(); }} />
      )}
    </>
  );
}

// ── Vehicle Detail Modal ───────────────────────────────────
function VehicleDetailModal({
  vehicle: v, currency, onClose, onEdit, onToggleActive, onDelete,
}: {
  vehicle: Vehicle; currency: string; onClose: () => void;
  onEdit: () => void; onToggleActive: () => void; onDelete: () => void;
}) {
  // Yaklaşan tarih uyarıları
  const now = new Date();
  const warn = (d: string | null) => {
    if (!d) return false;
    const diff = (new Date(d).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 30 && diff >= 0;
  };
  const expired = (d: string | null) => {
    if (!d) return false;
    return new Date(d) < now;
  };

  function DateBadge({ date, label }: { date: string | null; label: string }) {
    if (!date) return null;
    const isExpired = expired(date);
    const isWarn = warn(date);
    return (
      <div className={`flex items-start gap-2 p-3 rounded-xl ${
        isExpired ? "bg-red-500/10 border border-red-500/30" : isWarn ? "bg-amber-500/10 border border-amber-500/30" : "bg-surface-700"
      }`}>
        <Calendar size={14} className={`mt-0.5 shrink-0 ${isExpired ? "text-red-300" : isWarn ? "text-amber-300" : "text-surface-400"}`} />
        <div>
          <p className="text-[10px] text-surface-400 uppercase tracking-wider">{label}</p>
          <p className={`text-sm font-medium ${isExpired ? "text-red-400" : isWarn ? "text-amber-400" : "text-white"}`}>
            {formatDate(date)}
            {isExpired && <span className="ml-1 text-[10px] text-red-300 font-normal">SURESI DOLDU</span>}
            {isWarn && !isExpired && <span className="ml-1 text-[10px] text-amber-300 font-normal">YAKLASAN</span>}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-surface-800 rounded-2xl shadow-card-hover border border-surface-600 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-700">
          <h3 className="text-lg font-semibold text-white">Arac Detayi</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-600 transition-colors">
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Plate & Status Banner */}
          <div className={`rounded-xl p-5 text-center ${v.is_active ? "bg-teal-500/15 border border-teal-500/30" : "bg-surface-700 border border-surface-600"}`}>
            <p className={`text-2xl font-black tracking-widest ${v.is_active ? "text-teal-800" : "text-surface-400"}`}>
              {v.plate_number}
            </p>
            <p className="text-sm text-surface-400 mt-1">
              {[v.brand, v.model, v.model_year].filter(Boolean).join(" ")}
            </p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${OWNERSHIP_COLORS[v.ownership_type] || ""}`}>
                {OWNERSHIP_LABELS[v.ownership_type] || v.ownership_type}
              </span>
              {v.vehicle_type && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-surface-700 text-surface-300">
                  {VEHICLE_TYPE_LABELS[v.vehicle_type] || v.vehicle_type}
                </span>
              )}
              {!v.is_active && (
                <span className="px-2 py-0.5 bg-surface-600 text-surface-400 text-xs rounded-full">Pasif</span>
              )}
            </div>
          </div>

          {/* Kiralama Bilgileri */}
          {v.ownership_type !== "OWNED" && (
            <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl space-y-2">
              <p className="text-xs font-bold text-orange-300 uppercase tracking-wider">Kiralama Bilgileri</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-[10px] text-orange-300">Kiralama Bedeli</p>
                  <p className="font-bold text-orange-300">{formatMoney(v.rental_cost)} {currency}/{RENTAL_PERIOD_LABELS[v.rental_period || "MONTHLY"]?.toLowerCase() || "ay"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-orange-300">Aylik Maliyet</p>
                  <p className="font-bold text-orange-300">{formatMoney(v.monthly_rental_cost)} {currency}/ay</p>
                </div>
                {v.rental_company && (
                  <div className="col-span-2">
                    <p className="text-[10px] text-orange-300">Kiralayan</p>
                    <p className="font-medium text-orange-800">{v.rental_company}</p>
                  </div>
                )}
                {(v.rental_start_date || v.rental_end_date) && (
                  <div className="col-span-2 flex gap-2 text-xs text-orange-300">
                    {v.rental_start_date && <span>Baslangic: {formatDate(v.rental_start_date)}</span>}
                    {v.rental_end_date && <span>· Bitis: {formatDate(v.rental_end_date)}</span>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Teknik Bilgiler */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-surface-400 uppercase tracking-wider">Teknik Bilgiler</p>
            <div className="grid grid-cols-2 gap-2">
              {v.fuel_type && (
                <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                  <Fuel size={14} className="text-surface-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-surface-400 uppercase tracking-wider">Yakit Tipi</p>
                    <p className="text-sm text-white font-medium">{FUEL_LABELS[v.fuel_type] || v.fuel_type}</p>
                  </div>
                </div>
              )}
              {v.transmission && (
                <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                  <Settings size={14} className="text-surface-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-surface-400 uppercase tracking-wider">Vites</p>
                    <p className="text-sm text-white font-medium">{TRANSMISSION_LABELS[v.transmission] || v.transmission}</p>
                  </div>
                </div>
              )}
              {v.engine_displacement && (
                <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                  <Hash size={14} className="text-surface-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-surface-400 uppercase tracking-wider">Motor Hacmi</p>
                    <p className="text-sm text-white font-medium">{v.engine_displacement} cc</p>
                  </div>
                </div>
              )}
              {v.horse_power && (
                <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                  <Gauge size={14} className="text-surface-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-surface-400 uppercase tracking-wider">Motor Gucu</p>
                    <p className="text-sm text-white font-medium">{v.horse_power} HP</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                <MapPin size={14} className="text-surface-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider">Kilometre</p>
                  <p className="text-sm text-white font-medium">{formatKm(v.current_km)}</p>
                </div>
              </div>
              {v.avg_fuel_consumption && (
                <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                  <Fuel size={14} className="text-surface-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-surface-400 uppercase tracking-wider">Ort. Tuketim</p>
                    <p className="text-sm text-white font-medium">{v.avg_fuel_consumption} lt/100km</p>
                  </div>
                </div>
              )}
              {v.color && (
                <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                  <Car size={14} className="text-surface-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-surface-400 uppercase tracking-wider">Renk</p>
                    <p className="text-sm text-white font-medium">{v.color}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Ruhsat & Kimlik Bilgileri */}
          {(v.chassis_number || v.engine_number || v.registration_serial || v.registration_number) && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-surface-400 uppercase tracking-wider">Ruhsat / Kimlik</p>
              <div className="grid grid-cols-2 gap-2">
                {v.chassis_number && (
                  <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl col-span-2">
                    <Key size={14} className="text-surface-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Sasi No</p>
                      <p className="text-sm text-white font-mono">{v.chassis_number}</p>
                    </div>
                  </div>
                )}
                {v.engine_number && (
                  <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl col-span-2">
                    <Settings size={14} className="text-surface-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Motor No</p>
                      <p className="text-sm text-white font-mono">{v.engine_number}</p>
                    </div>
                  </div>
                )}
                {v.registration_serial && (
                  <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                    <FileText size={14} className="text-surface-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Ruhsat Seri</p>
                      <p className="text-sm text-white font-medium">{v.registration_serial}</p>
                    </div>
                  </div>
                )}
                {v.registration_number && (
                  <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                    <FileText size={14} className="text-surface-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Ruhsat No</p>
                      <p className="text-sm text-white font-medium">{v.registration_number}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sigorta & Muayene Tarihleri */}
          {(v.traffic_insurance_expiry || v.kasko_expiry || v.inspection_expiry) && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-surface-400 uppercase tracking-wider">Sigorta & Muayene</p>
              <div className="grid grid-cols-1 gap-2">
                <DateBadge date={v.traffic_insurance_expiry} label="Trafik Sigortasi" />
                <DateBadge date={v.kasko_expiry} label="Kasko" />
                <DateBadge date={v.inspection_expiry} label="Muayene" />
              </div>
            </div>
          )}

          {/* Notlar */}
          {v.notes && (
            <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
              <FileText size={16} className="text-surface-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-surface-400 uppercase tracking-wider">Notlar</p>
                <p className="text-sm text-white whitespace-pre-wrap">{v.notes}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-xl text-sm font-medium transition-colors">
              Kapat
            </button>
            <button onClick={onEdit} className="px-4 py-2.5 bg-brand-500/15 hover:bg-brand-500/25 text-brand-300 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5">
              <Edit3 size={14} /> Duzenle
            </button>
            <button onClick={onToggleActive} className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 ${
              v.is_active ? "bg-orange-500/10 hover:bg-orange-500/20 text-orange-300" : "bg-green-500/10 hover:bg-green-500/20 text-green-300"
            }`}>
              {v.is_active ? "Pasif Yap" : "Aktif Yap"}
            </button>
            <button onClick={onDelete} className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create / Edit Vehicle Modal ────────────────────────────
function CreateVehicleModal({
  businessId, vehicle, onClose, onCreated,
}: {
  businessId: string; vehicle?: Vehicle; onClose: () => void; onCreated: () => void;
}) {
  const isEdit = !!vehicle;

  // Temel
  const [plateNumber, setPlateNumber] = useState(vehicle?.plate_number || "");
  const [brand, setBrand] = useState(vehicle?.brand || "");
  const [model, setModel] = useState(vehicle?.model || "");
  const [modelYear, setModelYear] = useState(vehicle?.model_year?.toString() || "");
  const [color, setColor] = useState(vehicle?.color || "");
  const [vehicleType, setVehicleType] = useState(vehicle?.vehicle_type || "BINEK");

  // Teknik
  const [fuelType, setFuelType] = useState(vehicle?.fuel_type || "BENZIN");
  const [engineDisplacement, setEngineDisplacement] = useState(vehicle?.engine_displacement?.toString() || "");
  const [horsePower, setHorsePower] = useState(vehicle?.horse_power?.toString() || "");
  const [transmission, setTransmission] = useState(vehicle?.transmission || "MANUAL");
  const [currentKm, setCurrentKm] = useState(vehicle?.current_km?.toString() || "");
  const [avgFuelConsumption, setAvgFuelConsumption] = useState(vehicle?.avg_fuel_consumption?.toString() || "");

  // Ruhsat
  const [chassisNumber, setChassisNumber] = useState(vehicle?.chassis_number || "");
  const [engineNumber, setEngineNumber] = useState(vehicle?.engine_number || "");
  const [registrationSerial, setRegistrationSerial] = useState(vehicle?.registration_serial || "");
  const [registrationNumber, setRegistrationNumber] = useState(vehicle?.registration_number || "");

  // Sigorta
  const [trafficInsuranceExpiry, setTrafficInsuranceExpiry] = useState(vehicle?.traffic_insurance_expiry || "");
  const [kaskoExpiry, setKaskoExpiry] = useState(vehicle?.kasko_expiry || "");
  const [inspectionExpiry, setInspectionExpiry] = useState(vehicle?.inspection_expiry || "");

  // Sahiplik
  const [ownershipType, setOwnershipType] = useState(vehicle?.ownership_type || "OWNED");
  const [rentalCost, setRentalCost] = useState(vehicle?.rental_cost?.toString() || "");
  const [rentalPeriod, setRentalPeriod] = useState(vehicle?.rental_period || "MONTHLY");
  const [rentalStartDate, setRentalStartDate] = useState(vehicle?.rental_start_date || "");
  const [rentalEndDate, setRentalEndDate] = useState(vehicle?.rental_end_date || "");
  const [rentalCompany, setRentalCompany] = useState(vehicle?.rental_company || "");

  const [notes, setNotes] = useState(vehicle?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"basic" | "tech" | "docs" | "rental">("basic");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!plateNumber.trim()) return;

    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {
      plate_number: plateNumber.trim().toUpperCase(),
      brand: brand.trim() || null,
      model: model.trim() || null,
      model_year: modelYear ? parseInt(modelYear) : null,
      color: color.trim() || null,
      vehicle_type: vehicleType,
      fuel_type: fuelType,
      engine_displacement: engineDisplacement ? parseInt(engineDisplacement) : null,
      horse_power: horsePower ? parseInt(horsePower) : null,
      transmission,
      current_km: currentKm ? parseInt(currentKm) : 0,
      avg_fuel_consumption: avgFuelConsumption ? parseFloat(avgFuelConsumption) : null,
      chassis_number: chassisNumber.trim() || null,
      engine_number: engineNumber.trim() || null,
      registration_serial: registrationSerial.trim() || null,
      registration_number: registrationNumber.trim() || null,
      traffic_insurance_expiry: trafficInsuranceExpiry || null,
      kasko_expiry: kaskoExpiry || null,
      inspection_expiry: inspectionExpiry || null,
      ownership_type: ownershipType,
      notes: notes.trim() || null,
    };

    if (ownershipType !== "OWNED") {
      body.rental_cost = rentalCost ? parseMoneyInput(rentalCost) : 0;
      body.rental_period = rentalPeriod;
      body.rental_start_date = rentalStartDate || null;
      body.rental_end_date = rentalEndDate || null;
      body.rental_company = rentalCompany.trim() || null;
    }

    try {
      if (isEdit) {
        await api.put(`/vehicles/${vehicle.id}`, body);
        toast.success("Araç güncellendi");
      } else {
        await api.post(`/businesses/${businessId}/vehicles`, body);
        toast.success("Araç eklendi");
      }
      onCreated();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Bir hata olustu"));
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  const sections = [
    { key: "basic" as const, label: "Temel" },
    { key: "tech" as const, label: "Teknik" },
    { key: "docs" as const, label: "Ruhsat/Sigorta" },
    { key: "rental" as const, label: "Sahiplik" },
  ];

  const inputCls = "w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all";
  const labelCls = "block text-sm font-medium text-surface-200 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-surface-800 rounded-2xl shadow-card-hover border border-surface-600 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h3 className="text-lg font-bold text-white">
            {isEdit ? "Arac Duzenle" : "Yeni Arac"}
          </h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-600">
            <X size={20} className="text-surface-400" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="flex border-b border-surface-700">
          {sections.map((s) => (
            <button key={s.key} onClick={() => setActiveSection(s.key)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                activeSection === s.key ? "text-brand-300 border-b-2 border-brand-600" : "text-surface-400 hover:text-surface-200"
              }`}>
              {s.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* BASIC */}
          {activeSection === "basic" && (
            <>
              <div>
                <label className={labelCls}>Plaka <span className="text-red-300">*</span></label>
                <input type="text" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)}
                  placeholder="34 ABC 123" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Marka</label>
                  <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Mercedes, BMW..." className={inputCls} /></div>
                <div><label className={labelCls}>Model</label>
                  <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Sprinter, 320i..." className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={labelCls}>Model Yili</label>
                  <input type="number" value={modelYear} onChange={(e) => setModelYear(e.target.value)} placeholder="2024" className={inputCls} /></div>
                <div><label className={labelCls}>Renk</label>
                  <input type="text" value={color} onChange={(e) => setColor(e.target.value)} placeholder="Beyaz" className={inputCls} /></div>
                <div><label className={labelCls}>Arac Tipi</label>
                  <DarkSelect value={vehicleType} onChange={setVehicleType}
                    options={Object.entries(VEHICLE_TYPE_LABELS).map(([k, l]) => ({ value: k, label: l }))} /></div>
              </div>
              <div><label className={labelCls}>Notlar</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ek bilgiler..." rows={2} className={inputCls + " resize-none"} /></div>
            </>
          )}

          {/* TECH */}
          {activeSection === "tech" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Yakit Tipi</label>
                  <DarkSelect value={fuelType} onChange={setFuelType}
                    options={Object.entries(FUEL_LABELS).map(([k, l]) => ({ value: k, label: l }))} /></div>
                <div><label className={labelCls}>Vites</label>
                  <DarkSelect value={transmission} onChange={setTransmission}
                    options={Object.entries(TRANSMISSION_LABELS).map(([k, l]) => ({ value: k, label: l }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Motor Hacmi (cc)</label>
                  <input type="number" value={engineDisplacement} onChange={(e) => setEngineDisplacement(e.target.value)} placeholder="1600" className={inputCls} /></div>
                <div><label className={labelCls}>Motor Gucu (HP)</label>
                  <input type="number" value={horsePower} onChange={(e) => setHorsePower(e.target.value)} placeholder="120" className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Kilometre</label>
                  <input type="number" value={currentKm} onChange={(e) => setCurrentKm(e.target.value)} placeholder="0" className={inputCls} /></div>
                <div><label className={labelCls}>Ort. Tuketim (lt/100km)</label>
                  <input type="number" value={avgFuelConsumption} onChange={(e) => setAvgFuelConsumption(e.target.value)} placeholder="7.5" step="0.1" className={inputCls} /></div>
              </div>
            </>
          )}

          {/* DOCS */}
          {activeSection === "docs" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Sasi No (VIN)</label>
                  <input type="text" value={chassisNumber} onChange={(e) => setChassisNumber(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Motor No</label>
                  <input type="text" value={engineNumber} onChange={(e) => setEngineNumber(e.target.value)} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Ruhsat Seri No</label>
                  <input type="text" value={registrationSerial} onChange={(e) => setRegistrationSerial(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Ruhsat No</label>
                  <input type="text" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} className={inputCls} /></div>
              </div>
              <p className="text-xs font-bold text-surface-400 uppercase tracking-wider pt-2">Tarihler</p>
              <div><label className={labelCls}>Trafik Sigortasi Bitis</label>
                <input type="date" value={trafficInsuranceExpiry} onChange={(e) => setTrafficInsuranceExpiry(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Kasko Bitis</label>
                <input type="date" value={kaskoExpiry} onChange={(e) => setKaskoExpiry(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Muayene Bitis</label>
                <input type="date" value={inspectionExpiry} onChange={(e) => setInspectionExpiry(e.target.value)} className={inputCls} /></div>
            </>
          )}

          {/* RENTAL */}
          {activeSection === "rental" && (
            <>
              <div><label className={labelCls}>Sahiplik Durumu</label>
                <DarkSelect value={ownershipType} onChange={setOwnershipType}
                  options={Object.entries(OWNERSHIP_LABELS).map(([k, l]) => ({ value: k, label: l }))} /></div>
              {ownershipType !== "OWNED" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelCls}>Kiralama Bedeli</label>
                      <input type="text" inputMode="numeric" value={rentalCost} onChange={(e) => setRentalCost(formatMoneyInput(e.target.value))}
                        placeholder="0" className={inputCls} /></div>
                    <div><label className={labelCls}>Kiralama Periyodu</label>
                      <DarkSelect value={rentalPeriod} onChange={setRentalPeriod}
                        options={Object.entries(RENTAL_PERIOD_LABELS).map(([k, l]) => ({ value: k, label: l }))} /></div>
                  </div>
                  <div><label className={labelCls}>Kiralayan Firma / Kisi</label>
                    <input type="text" value={rentalCompany} onChange={(e) => setRentalCompany(e.target.value)}
                      placeholder="Kiralama sirketi adi" className={inputCls} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelCls}>Kiralama Baslangic</label>
                      <input type="date" value={rentalStartDate} onChange={(e) => setRentalStartDate(e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>Kiralama Bitis</label>
                      <input type="date" value={rentalEndDate} onChange={(e) => setRentalEndDate(e.target.value)} className={inputCls} /></div>
                  </div>
                </>
              )}
            </>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl font-medium text-surface-200 bg-surface-700 hover:bg-surface-600 transition-colors">
              Vazgec
            </button>
            <button type="submit" disabled={saving || !plateNumber.trim()}
              className="flex-1 py-3 rounded-xl font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={18} className="animate-spin" /> Kaydediliyor...</> : isEdit ? "Guncelle" : <><Plus size={18} /> Ekle</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Vehicle Modal ───────────────────────────────────
function DeleteVehicleModal({
  vehicle, onClose, onDeleted,
}: { vehicle: Vehicle; onClose: () => void; onDeleted: () => void; }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      await api.delete(`/vehicles/${vehicle.id}`);
      toast.info("Araç silindi");
      onDeleted();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Arac silinirken bir hata olustu"));
      toast.error(err);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-surface-800 rounded-2xl shadow-card-hover border border-surface-600 w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={16} className="text-red-300" />
            </div>
            <h3 className="text-lg font-bold text-white">Araci Sil</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-600">
            <X size={20} className="text-surface-400" />
          </button>
        </div>
        <div className="p-4">
          <div className="bg-surface-700 rounded-xl p-3 mb-4">
            <p className="text-sm font-bold text-white tracking-wider">{vehicle.plate_number}</p>
            <p className="text-xs text-surface-400 mt-0.5">
              {[vehicle.brand, vehicle.model, vehicle.model_year].filter(Boolean).join(" ")}
            </p>
          </div>
          <p className="text-sm text-surface-300 mb-4">
            Bu araci silmek istediginize emin misiniz? Pasif yapmak daha guvenli bir secenektir.
          </p>
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl font-medium text-surface-200 bg-surface-700 hover:bg-surface-600 transition-colors">
              Vazgec
            </button>
            <button onClick={handleDelete} disabled={isDeleting}
              className="flex-1 py-3 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 transition-colors flex items-center justify-center gap-2">
              {isDeleting ? <><Loader2 size={18} className="animate-spin" /> Siliniyor...</> : <><Trash2 size={18} /> Sil</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

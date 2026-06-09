"use client";

/**
 * v1.6.21 (WP-4): POS cihazı yönetim sayfası — admin CRUD.
 *
 * Liste tablo: name, owner firma, bank, default rate, last_used rate, status.
 * Yeni cihaz modal, düzenle, soft-delete (is_active=false).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Plus, Pencil, Trash2, X, AlertTriangle, CreditCard,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { DarkSelect } from "@/components/shared/DarkSelect";
import type { PosDeviceListItem, MyCompany } from "@/types";

export default function PosDeviceManagementPage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const isAdmin = profile?.role === "admin";

  const [devices, setDevices] = useState<PosDeviceListItem[]>([]);
  const [myCompanies, setMyCompanies] = useState<MyCompany[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PosDeviceListItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PosDeviceListItem | null>(null);

  useEffect(() => {
    if (profile && !isAdmin) router.replace("/dashboard/pos-cihazlari");
  }, [profile, isAdmin, router]);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api.get<PosDeviceListItem[]>(
        `/pos-devices${includeInactive ? "?include_inactive=true" : ""}`,
      );
      setDevices(r || []);
      setError(null);
    } catch (err) {
      logger.error("api", "POS devices fetch failed", undefined, err);
      setError("Cihaz listesi yuklenemedi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    api.get<MyCompany[]>("/firms")
      .then((r) => setMyCompanies(r || []))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  async function handleDelete(d: PosDeviceListItem) {
    try {
      await api.delete(`/pos-devices/${d.id}`);
      toast.info("POS cihazı silindi");
      setPendingDelete(null);
      void refresh();
    } catch (err) {
      logger.error("api", "POS device delete failed", { id: d.id }, err);
      toast.error(err);
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
        >
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">POS Cihazi Yonetimi</h1>
          <p className="text-xs text-surface-400">Cihaz ekle, duzenle, pasif yap</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold"
        >
          <Plus size={16} />
          Yeni Cihaz
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5 text-surface-300">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Pasif cihazlari goster
        </label>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-surface-400" />
        </div>
      ) : devices.length === 0 ? (
        <div className="card p-8 text-center">
          <CreditCard size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Henüz POS cihazi yok</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium"
          >
            <Plus size={16} />
            İlk cihazi ekle
          </button>
        </div>
      ) : (
        <section className="card divide-y divide-surface-700">
          {devices.map((d) => (
            <div key={d.id} className={cn(
              "p-4 flex items-center justify-between gap-3",
              !d.is_active && "opacity-50",
            )}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white truncate">{d.name}</p>
                  {!d.is_active && (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-surface-700 text-surface-400 border border-surface-600">
                      PASIF
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-surface-400 truncate">
                  {d.owner_my_company_name || d.owner_counterpart_name || "Sahip firma seçilmedi"}
                  {d.bank_name && <> · {d.bank_name}</>}
                </p>
                <p className="text-[11px] text-surface-300 mt-0.5">
                  Banka: <span className="text-white">%{d.default_rate ?? "—"}</span>
                  {d.our_commission_rate != null && (
                    <> · Biz: <span className="text-white">%{d.our_commission_rate}</span></>
                  )}
                  {d.last_used_rate != null && (
                    <> · Son: <span className="text-white">%{d.last_used_rate}</span></>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setEditing(d)}
                  className="p-2 rounded-lg text-surface-300 hover:text-white hover:bg-surface-700"
                  title="Duzenle"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setPendingDelete(d)}
                  className="p-2 rounded-lg text-red-400 hover:bg-red-900/30"
                  title="Pasif yap"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {showCreate && (
        <PosDeviceFormModal
          myCompanies={myCompanies}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); void refresh(); }}
        />
      )}
      {editing && (
        <PosDeviceFormModal
          device={editing}
          myCompanies={myCompanies}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void refresh(); }}
        />
      )}
      {pendingDelete && (
        <DeleteConfirmModal
          device={pendingDelete}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => handleDelete(pendingDelete)}
        />
      )}
    </div>
  );
}

// ───────────────────── Form modal ─────────────────────

function PosDeviceFormModal({
  device, myCompanies, onClose, onSaved,
}: {
  device?: PosDeviceListItem;
  myCompanies: MyCompany[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!device;
  const [name, setName] = useState(device?.name ?? "");
  const [ownerId, setOwnerId] = useState(device?.owner_my_company_id ?? "");
  const [bankName, setBankName] = useState(device?.bank_name ?? "");
  const [defaultRate, setDefaultRate] = useState(
    device?.default_rate != null ? String(device.default_rate) : "",
  );
  // v1.7.x (POS Komisyon WP TODO 1bb4529a): cihaz default BİZİM komisyon oranımız.
  const [ourCommissionRate, setOurCommissionRate] = useState(
    device?.our_commission_rate != null ? String(device.our_commission_rate) : "",
  );
  const [active, setActive] = useState(device?.is_active ?? true);
  const [notes, setNotes] = useState(device?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("İsim zorunlu"); return; }
    // v1.7.x: client-side validation our >= bank
    const bankVal = defaultRate.trim() === "" ? null : Number(defaultRate.replace(",", "."));
    const ourVal = ourCommissionRate.trim() === "" ? null : Number(ourCommissionRate.replace(",", "."));
    if (bankVal != null && ourVal != null && ourVal < bankVal) {
      setError("Bizim komisyonumuz banka komisyonundan düşük olamaz");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        owner_my_company_id: ownerId || null,
        owner_counterpart_id: null, // v1.7.x: artık my_company kullanılıyor
        bank_name: bankName.trim() || null,
        default_rate: bankVal,
        our_commission_rate: ourVal,
        notes: notes.trim() || null,
      };
      if (isEdit && device) {
        await api.patch(`/pos-devices/${device.id}`, { ...body, is_active: active });
        toast.success("POS cihazı güncellendi");
      } else {
        await api.post("/pos-devices", body);
        toast.success("POS cihazı eklendi");
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi");
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="glass-card shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-surface-700">
          <h3 className="text-lg font-semibold text-white">
            {isEdit ? "POS Cihazini Duzenle" : "Yeni POS Cihazi"}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-700">
            <X size={18} className="text-surface-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && (
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="label">Cihaz Adi *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              maxLength={120}
              placeholder="orn. Akbank POS-1"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="label">Sahip Firma (Firmalarım)</label>
            <DarkSelect
              value={ownerId}
              onChange={setOwnerId}
              placeholder="Firma seçin"
              searchable={myCompanies.length > 6}
              options={[
                { value: "", label: "— Seçim yapma" },
                ...myCompanies.map((c) => ({
                  value: c.id,
                  label: c.legal_name,
                  meta: c.company_type,
                })),
              ]}
            />
          </div>

          <div>
            <label className="label">Banka</label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="input"
              maxLength={120}
              placeholder="orn. Akbank"
            />
          </div>

          {/* v1.7.x (POS Komisyon WP TODO 1bb4529a): iki oran */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Banka Komisyonu (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={defaultRate}
                onChange={(e) => setDefaultRate(e.target.value.replace(/[^0-9.,]/g, ""))}
                className="input"
                placeholder="orn. 1.95"
              />
            </div>
            <div>
              <label className="label">Bizim Komisyonumuz (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={ourCommissionRate}
                onChange={(e) => setOurCommissionRate(e.target.value.replace(/[^0-9.,]/g, ""))}
                className="input"
                placeholder="orn. 5.50"
              />
            </div>
          </div>
          {(() => {
            const bank = defaultRate.trim() !== "" ? Number(defaultRate.replace(",", ".")) : NaN;
            const ours = ourCommissionRate.trim() !== "" ? Number(ourCommissionRate.replace(",", ".")) : NaN;
            if (!isNaN(bank) && !isNaN(ours) && ours < bank) {
              return (
                <p className="text-[11px] text-red-300 -mt-1">
                  Bizim komisyonumuz banka komisyonundan düşük olamaz.
                </p>
              );
            }
            if (!isNaN(bank) && !isNaN(ours)) {
              const diff = ours - bank;
              return (
                <p className="text-[11px] text-emerald-300 -mt-1">
                  Bu cihaz default kâr marjı: <strong>%{diff.toFixed(2)}</strong>
                </p>
              );
            }
            return null;
          })()}

          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-surface-200">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Aktif
            </label>
          )}

          <div>
            <label className="label">Notlar</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input min-h-[60px] resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-xl text-sm font-medium"
            >
              Vazgec
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            >
              {saving ? <><Loader2 size={16} className="animate-spin" /> Kaydediliyor...</> : (isEdit ? "Guncelle" : "Olustur")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  device, onClose, onConfirm,
}: {
  device: PosDeviceListItem;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="glass-card w-full max-w-sm p-5">
        <h3 className="text-base font-semibold text-white mb-1">Cihazi pasif yap</h3>
        <p className="text-sm text-surface-300">
          <strong>{device.name}</strong> cihazı <strong>pasif</strong> yapılacak (fiziksel
          silinmez; tx referansları korunur). Tekrar aktif edilebilir.
        </p>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm"
          >
            Vazgec
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
          >
            Pasif Yap
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * v1.6.23.12 (WP 3c8401f6): Telefon takibi sayfası.
 *
 * Veriler:
 *   GET /phone-devices?business_id=&include_inactive=
 *   GET /phone-brands
 *   GET /phone-brands/{id}/models  (cascading)
 *   POST /phone-devices
 *   PATCH /phone-devices/{id}
 *   DELETE /phone-devices/{id}   (soft)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Smartphone, Plus, Loader2, X, Search, Trash2, Edit2,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type {
  PhoneDevice, PhoneBrand, PhoneModel, PhoneDeviceBank, Employee, Business,
} from "@/types";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { QuickPersonnelModal } from "@/components/phones/QuickPersonnelModal";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListSkeleton } from "@/components/shared/Skeleton";

export default function TelefonlarPage() {
  const searchParams = useSearchParams();
  const refreshKey = useAppStore((s) => s.refreshKey);
  const [devices, setDevices] = useState<PhoneDevice[]>([]);
  const [brands, setBrands] = useState<PhoneBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [pendingCounterpartId, setPendingCounterpartId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<PhoneDevice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PhoneDevice | null>(null);

  useEffect(() => {
    const cpId = searchParams?.get("counterpart_id");
    if (cpId) {
      setPendingCounterpartId(cpId);
      setShowModal(true);
    }
  }, [searchParams]);

  // Filtreler
  const [search, setSearch] = useState("");
  const [filterBrand, setFilterBrand] = useState<string>("");
  const [filterActive, setFilterActive] = useState<"active" | "all">("active");

  async function refresh() {
    setLoading(true);
    try {
      const includeInactive = filterActive === "all";
      const [devs, brs] = await Promise.all([
        api.get<PhoneDevice[]>(`/phone-devices?include_inactive=${includeInactive}`),
        api.get<PhoneBrand[]>("/phone-brands"),
      ]);
      setDevices(devs || []);
      setBrands(brs || []);
    } catch (err) {
      logger.error("api", "phone fetch failed", undefined, err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterActive, refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = devices.filter((d) => {
      if (filterBrand && d.brand_id !== filterBrand) return false;
      if (!q) return true;
      const blob = [
        d.display_label,
        d.phone_number,
        d.assigned_employee_name,
        d.assigned_counterpart_name,
        d.label_no?.toString(),
        d.notes,
        ...(d.banks || []).map((b) => b.bank_name),
      ].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(q);
    });
    // Etiket numarasına göre sırala (boş labelNo en sona).
    return [...matched].sort((a, b) => {
      const la = a.label_no ?? Number.MAX_SAFE_INTEGER;
      const lb = b.label_no ?? Number.MAX_SAFE_INTEGER;
      if (la !== lb) return la - lb;
      return a.device_number - b.device_number;
    });
  }, [devices, search, filterBrand]);

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title="Telefonlar"
        subtitle="Fiziki telefonlar + atanmış firmalar + bankacılık uygulamaları"
        icon={Smartphone}
        actions={
          <button
            onClick={() => setShowModal(true)}
            className="v2-btn v2-btn--ink v2-press text-sm"
          >
            <Plus size={14} />
            Yeni Telefon
          </button>
        }
      />

      {/* Filtreler */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            type="text"
            placeholder="Telefon / firma / banka ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-surface-100 text-sm"
          />
        </div>
        <div className="min-w-[160px]">
          <DarkSelect
            value={filterBrand}
            onChange={setFilterBrand}
            placeholder="— tüm markalar —"
            searchable={brands.length > 6}
            options={brands.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>
        <div className="min-w-[180px]">
          <DarkSelect
            value={filterActive}
            onChange={(v) => setFilterActive(v as "active" | "all")}
            options={[
              { value: "active", label: "Yalnız aktif" },
              { value: "all", label: "Tümü (pasif dahil)" },
            ]}
          />
        </div>
      </section>

      {/* Tablo */}
      {loading ? (
        <ListSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title="Telefon yok"
          description='Üstteki "Yeni Telefon" butonu ile başla.'
        />
      ) : (
        <div className="v2-table-wrap">
          <table className="v2-table w-full text-sm">
            <thead>
              <tr>
                <th>#</th>
                <th>Marka / Model</th>
                <th>Atanan Personel</th>
                <th>Telefon No</th>
                <th>Bankalar</th>
                <th>Notlar</th>
                <th className="text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr
                  key={d.id}
                  className={d.is_active ? "" : "opacity-50"}
                >
                  <td className="text-[rgb(var(--v2-ink))] font-medium">
                    {d.label_no != null
                      ? `#${d.label_no}`
                      : <span className="text-[rgb(var(--v2-muted))]">—</span>}
                  </td>
                  <td className="text-[rgb(var(--v2-ink))]">
                    {d.display_label}
                    {d.custom_model && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                        Custom
                      </span>
                    )}
                  </td>
                  <td className="text-[rgb(var(--v2-ink))]">
                    {d.assigned_employee_name || d.assigned_counterpart_name || (
                      <span className="text-[rgb(var(--v2-muted))]">—</span>
                    )}
                  </td>
                  <td className="font-mono text-[rgb(var(--v2-ink))]">
                    {d.phone_number || <span className="text-[rgb(var(--v2-muted))]">—</span>}
                  </td>
                  <td>
                    {(d.banks || []).length === 0 ? (
                      <span className="text-[rgb(var(--v2-muted))]">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {d.banks.map((b) => (
                          <span
                            key={b.bank_name}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                          >
                            {b.bank_name}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="text-[rgb(var(--v2-muted))] text-xs max-w-xs truncate">
                    {d.notes || ""}
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setEditTarget(d)}
                      className="p-1.5 rounded hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--accent))]"
                      title="Düzenle"
                    >
                      <Edit2 size={14} />
                    </button>
                    {d.is_active && (
                      <button
                        onClick={() => setDeleteTarget(d)}
                        className="p-1.5 rounded hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-status-danger"
                        title="Pasif yap"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <PhoneDeviceModal
          mode="create"
          brands={brands}
          allDevices={devices}
          preselectedCounterpartId={pendingCounterpartId}
          onClose={() => { setShowModal(false); setPendingCounterpartId(null); }}
          onSuccess={() => {
            setShowModal(false);
            setPendingCounterpartId(null);
            refresh();
          }}
        />
      )}
      {editTarget && (
        <PhoneDeviceModal
          mode="edit"
          brands={brands}
          allDevices={devices}
          existing={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => {
            setEditTarget(null);
            refresh();
          }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          device={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            setDeleteTarget(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Create / Edit Modal ────────────────────────────────────────────────

function PhoneDeviceModal({
  mode,
  brands,
  allDevices,
  existing,
  preselectedCounterpartId,
  onClose,
  onSuccess,
}: {
  mode: "create" | "edit";
  brands: PhoneBrand[];
  allDevices: PhoneDevice[];
  existing?: PhoneDevice;
  preselectedCounterpartId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [businessId, setBusinessId] = useState<string>(existing?.business_id || "");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>(existing?.assigned_employee_id || "");
  // LEGACY: counterparts sayfasından "bu firma için telefon" deep-link'i —
  // personel modeline geçtik; eski atama geriye-uyum için korunur.
  const [legacyCounterpartId] = useState<string>(
    existing?.assigned_counterpart_id || preselectedCounterpartId || ""
  );
  const [showQuickPersonnel, setShowQuickPersonnel] = useState(false);
  const [labelNo, setLabelNo] = useState<string>(
    existing?.label_no != null ? String(existing.label_no) : ""
  );
  const [labelTouched, setLabelTouched] = useState<boolean>(mode === "edit");
  const [phoneNumber, setPhoneNumber] = useState(existing?.phone_number || "");
  const [brandId, setBrandId] = useState<string>(existing?.brand_id || "");
  const [models, setModels] = useState<PhoneModel[]>([]);
  const [modelId, setModelId] = useState<string>(existing?.model_id || "");
  const [useCustom, setUseCustom] = useState<boolean>(!!existing?.custom_model);
  const [customModel, setCustomModel] = useState(existing?.custom_model || "");
  const [banks, setBanks] = useState<PhoneDeviceBank[]>(existing?.banks || []);
  const [newBankName, setNewBankName] = useState("");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Business[]>("/businesses").catch(() => []).then((bz) => {
      setBusinesses(bz || []);
      if (!businessId && bz && bz.length > 0) setBusinessId(bz[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Personel listesi — seçili işletmeye bağlı. İşletme değişince yeniden çek.
  const loadEmployees = useCallback(async (bizId: string) => {
    if (!bizId) {
      setEmployees([]);
      return;
    }
    setEmployeesLoading(true);
    try {
      const list = await api.get<Employee[]>(`/businesses/${bizId}/employees`);
      setEmployees(list || []);
    } catch {
      setEmployees([]);
    } finally {
      setEmployeesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees(businessId);
  }, [businessId, loadEmployees]);

  // İşletme değişince başka işletmeye ait seçili personeli temizle.
  useEffect(() => {
    if (employeeId && !employees.some((e) => e.id === employeeId)) {
      setEmployeeId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees]);

  // Create modunda etiket numarasını otomatik öner (kullanıcı elle değiştirmediyse).
  // Seçili işletmedeki en büyük labelNo + 1. Kullanıcı override edebilir (manuel esas).
  useEffect(() => {
    if (mode !== "create" || labelTouched || !businessId) return;
    const maxLabel = allDevices
      .filter((d) => d.business_id === businessId && d.label_no != null)
      .reduce((m, d) => Math.max(m, d.label_no as number), 0);
    setLabelNo(String(maxLabel + 1));
  }, [businessId, mode, labelTouched, allDevices]);

  // Aynı işletmede aynı etiket numarası başka cihazda var mı (soft uyarı).
  const labelDuplicate = useMemo(() => {
    const n = parseInt(labelNo, 10);
    if (!businessId || Number.isNaN(n)) return false;
    return allDevices.some(
      (d) =>
        d.business_id === businessId &&
        d.label_no === n &&
        d.id !== existing?.id
    );
  }, [labelNo, businessId, allDevices, existing?.id]);

  useEffect(() => {
    if (!brandId) {
      setModels([]);
      return;
    }
    api
      .get<PhoneModel[]>(`/phone-brands/${brandId}/models`)
      .then(setModels)
      .catch(() => setModels([]));
  }, [brandId]);

  function addBank() {
    const name = newBankName.trim();
    if (!name) return;
    if (banks.some((b) => b.bank_name.toLowerCase() === name.toLowerCase())) return;
    setBanks([...banks, { bank_name: name }]);
    setNewBankName("");
  }
  function removeBank(name: string) {
    setBanks(banks.filter((b) => b.bank_name !== name));
  }

  async function submit() {
    if (!businessId) {
      setError("İşletme seç");
      return;
    }
    if (useCustom && !customModel.trim()) {
      setError("Custom model boş olamaz");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "create") {
        const payload: Record<string, unknown> = {
          business_id: businessId,
          label_no: labelNo.trim() ? parseInt(labelNo, 10) : null,
          phone_number: phoneNumber || null,
          assigned_employee_id: employeeId || null,
          // LEGACY: counterparts sayfasından gelen deep-link ataması korunur.
          assigned_counterpart_id: legacyCounterpartId || null,
          notes: notes || null,
          banks: banks.length > 0 ? banks : null,
        };
        if (useCustom) {
          payload.custom_model = customModel.trim();
        } else {
          if (brandId) payload.brand_id = brandId;
          if (modelId) payload.model_id = modelId;
        }
        await api.post("/phone-devices", payload);
      } else if (existing) {
        const payload: Record<string, unknown> = {
          phone_number: phoneNumber,
          notes: notes,
        };
        if (labelNo.trim()) {
          payload.label_no = parseInt(labelNo, 10);
        } else {
          payload.clear_label_no = true;
        }
        if (employeeId) {
          payload.assigned_employee_id = employeeId;
        } else {
          payload.clear_assigned_employee = true;
        }
        if (useCustom) {
          payload.clear_brand = true;
          payload.clear_model = true;
          payload.custom_model = customModel.trim();
        } else {
          if (brandId) payload.brand_id = brandId;
          else payload.clear_brand = true;
          if (modelId) payload.model_id = modelId;
          else payload.clear_model = true;
          payload.custom_model = "";
        }
        await api.patch(`/phone-devices/${existing.id}`, payload);
        const existingBankNames = new Set((existing.banks || []).map((b) => b.bank_name));
        const newBankNames = new Set(banks.map((b) => b.bank_name));
        for (const b of banks) {
          if (!existingBankNames.has(b.bank_name)) {
            await api.post(`/phone-devices/${existing.id}/banks`, b);
          }
        }
        for (const b of existing.banks || []) {
          if (!newBankNames.has(b.bank_name)) {
            await api.delete(`/phone-devices/${existing.id}/banks/${encodeURIComponent(b.bank_name)}`);
          }
        }
      }
      toast.success(existing ? "Telefon güncellendi" : "Telefon eklendi");
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "İşlem başarısız");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="modal-surface rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="modal-header">
          <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))]">
            {mode === "create"
              ? "Yeni Telefon"
              : `Telefon ${existing?.label_no != null ? "#" + existing.label_no : "#" + existing?.device_number} Düzenle`}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[rgb(var(--v2-sunken))]">
            <X size={16} className="text-[rgb(var(--v2-muted))]" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2 text-xs text-status-danger bg-status-danger/10 border border-status-danger/30 rounded-lg">
              {error}
            </div>
          )}

          {/* İşletme */}
          {mode === "create" && (
            <div>
              <label className="text-xs text-[rgb(var(--v2-muted))] mb-1 block">İşletme</label>
              <DarkSelect
                value={businessId}
                onChange={setBusinessId}
                placeholder="— seç —"
                searchable={businesses.length > 6}
                options={businesses.map((b) => ({ value: b.id, label: b.name }))}
              />
            </div>
          )}

          {/* Etiket (sticker) numarası */}
          <div>
            <label className="text-xs text-[rgb(var(--v2-muted))] mb-1 block">
              Numara <span className="text-[10px] text-[rgb(var(--v2-muted))]">(telefon arkasındaki etiket)</span>
            </label>
            <input
              type="number"
              min={1}
              value={labelNo}
              onChange={(e) => { setLabelNo(e.target.value); setLabelTouched(true); }}
              placeholder="örn. 5, 17..."
              className="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-surface-100 text-sm"
            />
            {labelDuplicate && (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                Bu numara bu işletmede başka bir telefonda var — yine de kaydedebilirsin.
              </p>
            )}
          </div>

          {/* Marka / Model / Custom */}
          {!useCustom ? (
            <>
              <div>
                <label className="text-xs text-[rgb(var(--v2-muted))] mb-1 block">Marka</label>
                <DarkSelect
                  value={brandId}
                  onChange={(v) => { setBrandId(v); setModelId(""); }}
                  placeholder="— seç —"
                  searchable={brands.length > 6}
                  options={brands.map((b) => ({ value: b.id, label: b.name }))}
                />
              </div>
              {brandId && (
                <div>
                  <label className="text-xs text-[rgb(var(--v2-muted))] mb-1 block">Model</label>
                  <DarkSelect
                    value={modelId}
                    onChange={setModelId}
                    placeholder="— seç —"
                    searchable={models.length > 6}
                    options={models.map((m) => ({
                      value: m.id,
                      label: `${m.name}${m.release_year ? " (" + m.release_year + ")" : ""}`,
                    }))}
                  />
                  <button
                    type="button"
                    onClick={() => { setUseCustom(true); setBrandId(""); setModelId(""); }}
                    className="mt-1 text-[11px] text-[rgb(var(--accent))] hover:underline"
                  >
                    Listede yok? Custom model yaz
                  </button>
                </div>
              )}
              {!brandId && (
                <button
                  type="button"
                  onClick={() => setUseCustom(true)}
                  className="text-[11px] text-[rgb(var(--accent))] hover:underline"
                >
                  Marka listede yok? Custom model yaz
                </button>
              )}
            </>
          ) : (
            <div>
              <label className="text-xs text-[rgb(var(--v2-muted))] mb-1 block">
                Custom Model
                <button
                  type="button"
                  onClick={() => { setUseCustom(false); setCustomModel(""); }}
                  className="ml-2 text-[10px] text-[rgb(var(--v2-muted))] hover:underline"
                >
                  (master listeye dön)
                </button>
              </label>
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="örn. Phone (3a)"
                className="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-surface-100 text-sm"
              />
            </div>
          )}

          {/* Telefon numarası */}
          <div>
            <label className="text-xs text-[rgb(var(--v2-muted))] mb-1 block">Telefon No</label>
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="0555..."
              className="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-surface-100 text-sm"
            />
          </div>

          {/* Atanan personel */}
          <div>
            <label className="text-xs text-[rgb(var(--v2-muted))] mb-1 block">Atanan Personel</label>
            <DarkSelect
              value={employeeId}
              onChange={setEmployeeId}
              placeholder={
                !businessId
                  ? "— önce işletme seç —"
                  : employeesLoading
                    ? "Personel yükleniyor…"
                    : "— atanmamış (havuz) —"
              }
              disabled={!businessId}
              searchable={employees.length > 6}
              options={employees.map((e) => ({
                value: e.id,
                label: e.full_name,
                meta: e.position || undefined,
              }))}
              addOption={{
                label: "+ Hızlı Personel Ekle",
                onClick: () => {
                  if (!businessId) {
                    setError("Önce işletme seç");
                    return;
                  }
                  setShowQuickPersonnel(true);
                },
              }}
            />
          </div>

          {/* Bankacılıklar */}
          <div>
            <label className="text-xs text-[rgb(var(--v2-muted))] mb-1 block">Bankacılıklar</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {banks.map((b) => (
                <span
                  key={b.bank_name}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                >
                  {b.bank_name}
                  <button onClick={() => removeBank(b.bank_name)} className="hover:text-[rgb(var(--v2-ink))]">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBank())}
                placeholder="örn. Garanti, İş Bankası, Akbank..."
                className="flex-1 px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-surface-100 text-sm"
              />
              <button
                type="button"
                onClick={addBank}
                className="px-3 py-2 rounded-lg bg-surface-600 hover:bg-surface-500 text-surface-200 text-sm"
              >
                Ekle
              </button>
            </div>
          </div>

          {/* Notlar */}
          <div>
            <label className="text-xs text-[rgb(var(--v2-muted))] mb-1 block">Notlar</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-surface-100 text-sm resize-none"
            />
          </div>
        </div>
        <div className="p-4 border-t border-[rgb(var(--v2-border))] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm bg-surface-700 text-surface-300 hover:bg-surface-600 disabled:opacity-60"
          >
            İptal
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="v2-btn v2-btn--accent px-4 py-2 text-sm disabled:opacity-60"
          >
            {submitting ? "Kaydediliyor…" : mode === "create" ? "Oluştur" : "Kaydet"}
          </button>
        </div>
      </div>

      {showQuickPersonnel && businessId && (
        <QuickPersonnelModal
          businessId={businessId}
          onClose={() => setShowQuickPersonnel(false)}
          onCreated={async (newId) => {
            setShowQuickPersonnel(false);
            await loadEmployees(businessId);
            setEmployeeId(newId);
          }}
        />
      )}
    </div>
  );
}

function DeleteConfirmModal({
  device,
  onClose,
  onSuccess,
}: {
  device: PhoneDevice;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  async function confirm() {
    setSubmitting(true);
    try {
      await api.delete(`/phone-devices/${device.id}`);
      toast.info("Telefon silindi");
      onSuccess();
    } catch (err) {
      toast.error(err);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="modal-surface rounded-2xl shadow-xl w-full max-w-sm">
        <div className="p-4 border-b border-[rgb(var(--v2-border))]">
          <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))]">Telefonu pasif yap</h3>
        </div>
        <div className="p-4 text-sm text-[rgb(var(--v2-muted))]">
          <p>
            #{device.label_no ?? device.device_number} {device.display_label} pasif yapılacak. Tx referansları
            korunur (soft delete). Onaylıyor musun?
          </p>
        </div>
        <div className="p-4 border-t border-[rgb(var(--v2-border))] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm bg-surface-700 text-surface-300 hover:bg-surface-600"
          >
            İptal
          </button>
          <button
            onClick={confirm}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
          >
            {submitting ? "..." : "Pasif Yap"}
          </button>
        </div>
      </div>
    </div>
  );
}

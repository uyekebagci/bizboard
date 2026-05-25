"use client";

/**
 * v1.7.x WP 8b961444 TODO e4c245fa + 5557e062: Firma detay modal.
 *
 * <p>Default mode: READ-ONLY. [Düzenle] tıklandığında EDITABLE'a geçer.
 * Editable'da group dropdown + nested CreateGroupModal. Admin için
 * [Erişim Yönet] ve [Sil] butonları.</p>
 *
 * <p>Non-admin için modal her zaman read-only, tüm action butonları gizli.</p>
 */

import { useEffect, useMemo, useState } from "react";
import { X, Pencil, Save, Trash2, ShieldCheck, Loader2, AlertTriangle, Building2, CreditCard, Wallet } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import type { BankAccountListItem, CompanyType, MyCompany, MyCompanyGroup, PosDeviceListItem } from "@/types";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { CreateGroupModal } from "./CreateGroupModal";
import { formatCurrency } from "@/lib/utils";

const COMPANY_TYPES: { value: CompanyType; label: string }[] = [
  { value: "AS", label: "Anonim Şirket" },
  { value: "LTD", label: "Limited Şirket" },
  { value: "SAHIS", label: "Şahıs İşletmesi" },
  { value: "KOOP", label: "Kooperatif" },
  { value: "DERNEK", label: "Dernek" },
  { value: "OTHER", label: "Diğer" },
];

function typeLabel(t: CompanyType): string {
  return COMPANY_TYPES.find((c) => c.value === t)?.label ?? t;
}

interface Props {
  firm: MyCompany;
  /** Admin değilse modal read-only, edit/delete butonları gizli */
  canEdit: boolean;
  /** Admin değilse Erişim Yönet butonu gizli */
  canManageAccess: boolean;
  groups: MyCompanyGroup[];
  onClose: () => void;
  onChange: () => void;
  onManageAccess?: (firm: MyCompany) => void;
  onGroupCreated?: (g: MyCompanyGroup) => void;
}

export function FirmDetailModal({
  firm, canEdit, canManageAccess, groups, onClose, onChange, onManageAccess, onGroupCreated,
}: Props) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Form state — sadece edit mode'da kullanılır
  const [form, setForm] = useState({
    legal_name: firm.legal_name,
    tax_id: firm.tax_id ?? "",
    tax_office: firm.tax_office ?? "",
    trade_registry_no: firm.trade_registry_no ?? "",
    company_type: firm.company_type,
    activity_code: firm.activity_code ?? "",
    incorporated_at: firm.incorporated_at ?? "",
    mersis_no: firm.mersis_no ?? "",
    address: firm.address ?? "",
    contact_name: firm.contact_name ?? "",
    contact_phone: firm.contact_phone ?? "",
    contact_email: firm.contact_email ?? "",
    group_id: firm.group_id ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // v1.7.0.x: İlişkili veriler — bu firmaya bağlı banka hesapları + POS cihazları.
  const [relatedBanks, setRelatedBanks] = useState<BankAccountListItem[]>([]);
  const [relatedPosDevices, setRelatedPosDevices] = useState<PosDeviceListItem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  useEffect(() => {
    setRelatedLoading(true);
    Promise.all([
      api.get<BankAccountListItem[]>("/bank-accounts").catch(() => [] as BankAccountListItem[]),
      api.get<PosDeviceListItem[]>("/pos-devices").catch(() => [] as PosDeviceListItem[]),
    ])
      .then(([banks, devices]) => {
        setRelatedBanks((banks || []).filter((b) => b.owner_my_company_id === firm.id));
        setRelatedPosDevices((devices || []).filter((d) => d.owner_my_company_id === firm.id));
      })
      .finally(() => setRelatedLoading(false));
  }, [firm.id]);

  const totalBankBalance = useMemo(
    () => relatedBanks.reduce((sum, b) => sum + (b.current_balance ?? 0), 0),
    [relatedBanks],
  );

  // firm prop değişince form'u resetle (refresh sonrası)
  useEffect(() => {
    setForm({
      legal_name: firm.legal_name,
      tax_id: firm.tax_id ?? "",
      tax_office: firm.tax_office ?? "",
      trade_registry_no: firm.trade_registry_no ?? "",
      company_type: firm.company_type,
      activity_code: firm.activity_code ?? "",
      incorporated_at: firm.incorporated_at ?? "",
      mersis_no: firm.mersis_no ?? "",
      address: firm.address ?? "",
      contact_name: firm.contact_name ?? "",
      contact_phone: firm.contact_phone ?? "",
      contact_email: firm.contact_email ?? "",
      group_id: firm.group_id ?? "",
    });
  }, [firm]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/firms/${firm.id}`, {
        legal_name: form.legal_name,
        tax_id: form.tax_id || null,
        tax_office: form.tax_office || null,
        trade_registry_no: form.trade_registry_no || null,
        company_type: form.company_type,
        activity_code: form.activity_code || null,
        incorporated_at: form.incorporated_at || null,
        mersis_no: form.mersis_no || null,
        address: form.address || null,
        contact_name: form.contact_name || null,
        contact_phone: form.contact_phone || null,
        contact_email: form.contact_email || null,
        group_id: form.group_id || null,
      });
      onChange();
      setMode("view");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    // Form'u firma'nın güncel hâline reset et
    setForm({
      legal_name: firm.legal_name,
      tax_id: firm.tax_id ?? "",
      tax_office: firm.tax_office ?? "",
      trade_registry_no: firm.trade_registry_no ?? "",
      company_type: firm.company_type,
      activity_code: firm.activity_code ?? "",
      incorporated_at: firm.incorporated_at ?? "",
      mersis_no: firm.mersis_no ?? "",
      address: firm.address ?? "",
      contact_name: firm.contact_name ?? "",
      contact_phone: firm.contact_phone ?? "",
      contact_email: firm.contact_email ?? "",
      group_id: firm.group_id ?? "",
    });
    setMode("view");
    setError(null);
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await api.delete(`/firms/${firm.id}`);
      onChange();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Silme başarısız");
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  }

  const isReadOnly = mode === "view";

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={mode === "edit" ? handleSave : undefined}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-800 rounded-2xl border border-surface-600 w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-white truncate">
              {isReadOnly ? firm.legal_name : "Firmayı Düzenle"}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] uppercase text-surface-400 tracking-wider">
                {typeLabel(firm.company_type)}
              </span>
              {firm.group_name && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border"
                  style={{
                    color: firm.group_color || undefined,
                    borderColor: firm.group_color || undefined,
                    background: firm.group_color ? `${firm.group_color}22` : undefined,
                  }}
                >
                  {firm.group_icon && <span>{firm.group_icon}</span>}
                  {firm.group_name}
                </span>
              )}
              {firm.is_default && (
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30">
                  Default
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canEdit && isReadOnly && (
              <button type="button" onClick={() => setMode("edit")}
                className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold inline-flex items-center gap-1.5">
                <Pencil size={12} /> Düzenle
              </button>
            )}
            <button type="button" onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Grup dropdown (sadece edit mode'da) */}
          {!isReadOnly && (
            <div>
              <label className="block text-xs font-medium text-surface-200 mb-1.5">Grup</label>
              <DarkSelect
                value={form.group_id}
                onChange={(v) => setForm({ ...form, group_id: v })}
                placeholder="Gruplanmamış"
                searchable={groups.length > 6}
                options={[
                  { value: "", label: "Gruplanmamış" },
                  ...groups.map((g) => ({
                    value: g.id,
                    label: `${g.icon || "📁"} ${g.name}`,
                    meta: `${g.firm_count} firma`,
                  })),
                ]}
                addOption={{
                  label: "+ Yeni Grup Oluştur",
                  onClick: () => setShowCreateGroup(true),
                }}
              />
            </div>
          )}

          <Row label="Yasal Adı *" required={!isReadOnly}
            value={form.legal_name}
            onChange={(v) => setForm({ ...form, legal_name: v })}
            readOnly={isReadOnly} />

          <div className="grid grid-cols-2 gap-3">
            <Row label="VKN / TCKN"
              value={form.tax_id}
              onChange={(v) => setForm({ ...form, tax_id: v })}
              readOnly={isReadOnly} />
            <Row label="Vergi Dairesi"
              value={form.tax_office}
              onChange={(v) => setForm({ ...form, tax_office: v })}
              readOnly={isReadOnly} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-200 mb-1.5">Şirket Tipi</label>
              {isReadOnly ? (
                <div className="px-3 py-2.5 rounded-xl border border-surface-700 bg-surface-700/30 text-sm text-surface-300">
                  {typeLabel(form.company_type)}
                </div>
              ) : (
                <DarkSelect
                  value={form.company_type}
                  onChange={(v) => setForm({ ...form, company_type: v as CompanyType })}
                  options={COMPANY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                />
              )}
            </div>
            <Row label="Ticaret Sicil No"
              value={form.trade_registry_no}
              onChange={(v) => setForm({ ...form, trade_registry_no: v })}
              readOnly={isReadOnly} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Row label="Faaliyet Kodu"
              value={form.activity_code}
              onChange={(v) => setForm({ ...form, activity_code: v })}
              readOnly={isReadOnly} />
            <Row label="Kuruluş Tarihi"
              type="date"
              value={form.incorporated_at}
              onChange={(v) => setForm({ ...form, incorporated_at: v })}
              readOnly={isReadOnly} />
          </div>

          <Row label="MERSİS No"
            value={form.mersis_no}
            onChange={(v) => setForm({ ...form, mersis_no: v })}
            readOnly={isReadOnly} />

          <Row label="Adres" textarea
            value={form.address}
            onChange={(v) => setForm({ ...form, address: v })}
            readOnly={isReadOnly} />

          <div className="border-t border-surface-700 pt-3 space-y-3">
            <p className="text-[10px] uppercase text-surface-400 tracking-wider">İletişim</p>
            <Row label="Yetkili"
              value={form.contact_name}
              onChange={(v) => setForm({ ...form, contact_name: v })}
              readOnly={isReadOnly} />
            <div className="grid grid-cols-2 gap-3">
              <Row label="Telefon" type="tel"
                value={form.contact_phone}
                onChange={(v) => setForm({ ...form, contact_phone: v })}
                readOnly={isReadOnly} />
              <Row label="E-posta" type="email"
                value={form.contact_email}
                onChange={(v) => setForm({ ...form, contact_email: v })}
                readOnly={isReadOnly} />
            </div>
          </div>

          {/* v1.7.0.x: İlişkili veriler — yalnız read-only mode'da */}
          {isReadOnly && (
            <div className="border-t border-surface-700 pt-3 space-y-3">
              <p className="text-[10px] uppercase text-surface-400 tracking-wider">İlişkili Veriler</p>

              {relatedLoading ? (
                <div className="flex items-center gap-2 text-sm text-surface-400">
                  <Loader2 size={14} className="animate-spin" /> Yükleniyor…
                </div>
              ) : (
                <>
                  {/* Banka hesapları */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="text-xs font-semibold text-surface-200 inline-flex items-center gap-1.5">
                        <Wallet size={12} className="text-emerald-400" />
                        Banka Hesapları ({relatedBanks.length})
                      </h4>
                      {relatedBanks.length > 0 && (
                        <span className="text-[11px] text-emerald-300 font-semibold">
                          {formatCurrency(totalBankBalance, relatedBanks[0]?.currency || "TRY")}
                        </span>
                      )}
                    </div>
                    {relatedBanks.length === 0 ? (
                      <p className="text-[11px] text-surface-500 italic">
                        Bu firmaya bağlı banka hesabı yok. /dashboard/hesaplar'dan ekleyebilirsiniz.
                      </p>
                    ) : (
                      <ul className="space-y-1 max-h-40 overflow-y-auto">
                        {relatedBanks.map((b) => (
                          <li key={b.id}
                              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface-700/40 border border-surface-700 text-xs">
                            <span className="truncate text-surface-200">
                              {b.name}
                              {b.bank_name && <span className="ml-1 text-surface-400">· {b.bank_name}</span>}
                            </span>
                            <span className="text-surface-300 font-medium shrink-0">
                              {formatCurrency(b.current_balance ?? 0, b.currency || "TRY")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* POS cihazları */}
                  <div>
                    <h4 className="text-xs font-semibold text-surface-200 inline-flex items-center gap-1.5 mb-1.5">
                      <CreditCard size={12} className="text-blue-400" />
                      POS Cihazları ({relatedPosDevices.length})
                    </h4>
                    {relatedPosDevices.length === 0 ? (
                      <p className="text-[11px] text-surface-500 italic">
                        Bu firmaya bağlı POS cihazı yok.
                      </p>
                    ) : (
                      <ul className="space-y-1 max-h-40 overflow-y-auto">
                        {relatedPosDevices.map((d) => (
                          <li key={d.id}
                              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface-700/40 border border-surface-700 text-xs">
                            <span className="truncate text-surface-200">
                              {d.name}
                              {d.bank_name && <span className="ml-1 text-surface-400">· {d.bank_name}</span>}
                            </span>
                            {!d.is_active && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-600/30 text-surface-400 shrink-0">
                                Pasif
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <p className="text-[10px] text-surface-500 leading-relaxed">
                    <Building2 size={9} className="inline mr-1" />
                    POS işlemleri bu firmanın banka hesaplarına yansıtılır; transfer'ler aynı firma içinde zorunludur.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 p-4 border-t border-surface-700">
          {!isReadOnly ? (
            <>
              <button type="button" onClick={handleCancel} disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium border border-surface-600 disabled:opacity-50">
                İptal
              </button>
              <button type="submit" disabled={saving || !form.legal_name.trim()}
                className="ml-auto px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Kaydet
              </button>
            </>
          ) : (
            <>
              {canManageAccess && onManageAccess && (
                <button type="button" onClick={() => onManageAccess(firm)}
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold inline-flex items-center gap-1.5">
                  <ShieldCheck size={14} /> Erişim Yönet
                </button>
              )}
              {canEdit && !firm.is_default && (
                <button type="button" onClick={() => setConfirmDelete(true)}
                  className="ml-auto px-3 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-300 text-sm font-semibold inline-flex items-center gap-1.5 border border-red-500/30">
                  <Trash2 size={14} /> Sil
                </button>
              )}
            </>
          )}
        </div>
      </form>
    </div>

    {/* Nested: yeni grup */}
    {showCreateGroup && (
      <CreateGroupModal
        onClose={() => setShowCreateGroup(false)}
        onCreated={(g) => {
          setShowCreateGroup(false);
          // Yeni grubu form'a otomatik seç + parent'ı bilgilendir
          setForm({ ...form, group_id: g.id });
          onGroupCreated?.(g);
        }}
      />
    )}

    {/* Sil confirm */}
    {confirmDelete && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
           onClick={() => setConfirmDelete(false)}>
        <div onClick={(e) => e.stopPropagation()}
             className="bg-surface-800 rounded-2xl border border-red-500/30 max-w-sm w-full p-5">
          <h4 className="text-base font-semibold text-white mb-2">Firmayı sil</h4>
          <p className="text-sm text-surface-300 mb-4">
            <strong>{firm.legal_name}</strong> kaydını silmek istediğinden emin misin? Bu işlem geri alınamaz.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} disabled={saving}
              className="flex-1 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium">
              Vazgeç
            </button>
            <button onClick={handleDelete} disabled={saving}
              className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Sil
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function Row({
  label, value, onChange, readOnly, type = "text", textarea = false, required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  type?: string;
  textarea?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-surface-200 mb-1.5">
        {label}{required && " *"}
      </label>
      {readOnly ? (
        <div className="px-3 py-2.5 rounded-xl border border-surface-700 bg-surface-700/30 text-sm text-surface-300 min-h-[42px] whitespace-pre-wrap">
          {value || <span className="text-surface-500 italic">—</span>}
        </div>
      ) : textarea ? (
        <textarea required={required} value={value}
          onChange={(e) => onChange(e.target.value)} rows={2}
          className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
      ) : (
        <input type={type} required={required} value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
      )}
    </div>
  );
}

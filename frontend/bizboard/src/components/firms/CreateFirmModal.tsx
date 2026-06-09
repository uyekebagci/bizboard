"use client";

/**
 * v1.7.x WP 8b961444 TODO d8a04bbb: Yeni firma oluşturma modal'ı.
 * Admin-only — /dashboard/firmalarim toolbar'ından tetiklenir.
 *
 * <p>FirmDetailModal "view ↔ edit" mode tutuyor; create farklı bir akış
 * (eldeki firma yok), bu yüzden ayrı bir modal.</p>
 */

import { useState } from "react";
import { X, Loader2, Save } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { isValidTaxId } from "@/lib/taxId";
import type { CompanyType, MyCompany, MyCompanyGroup } from "@/types";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { CreateGroupModal } from "./CreateGroupModal";
import { toast } from "@/lib/toast";

const COMPANY_TYPES: { value: CompanyType; label: string }[] = [
  { value: "AS", label: "Anonim Şirket" },
  { value: "LTD", label: "Limited Şirket" },
  { value: "SAHIS", label: "Şahıs İşletmesi" },
  { value: "KOOP", label: "Kooperatif" },
  { value: "DERNEK", label: "Dernek" },
  { value: "OTHER", label: "Diğer" },
];

interface Props {
  groups: MyCompanyGroup[];
  /** İlk açılışta önseçili grup (örn. grup başlığındaki [+] butonu). */
  defaultGroupId?: string | null;
  onClose: () => void;
  onCreated: (firm: MyCompany) => void;
  onGroupCreated?: (g: MyCompanyGroup) => void;
}

export function CreateFirmModal({
  groups, defaultGroupId, onClose, onCreated, onGroupCreated,
}: Props) {
  const [form, setForm] = useState({
    legal_name: "",
    tax_id: "",
    tax_office: "",
    trade_registry_no: "",
    company_type: "LTD" as CompanyType,
    activity_code: "",
    incorporated_at: "",
    mersis_no: "",
    address: "",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    group_id: defaultGroupId ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const taxIdInvalid = form.tax_id.length > 0 && !isValidTaxId(form.tax_id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.legal_name.trim()) { setError("Firma adı zorunlu"); return; }
    if (taxIdInvalid) { setError("Geçersiz VKN (10 hane) veya TCKN (11 hane)"); return; }
    setSubmitting(true);
    try {
      const created = await api.post<MyCompany>("/firms", {
        legal_name: form.legal_name.trim(),
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
      toast.success("Firma oluşturuldu");
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Firma oluşturulamadı");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h3 className="text-base font-semibold text-white">Yeni Firma</h3>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {error}
            </div>
          )}

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

          <Row label="Yasal Adı *" required
            value={form.legal_name}
            onChange={(v) => setForm({ ...form, legal_name: v })}
            autoFocus />

          <div className="grid grid-cols-2 gap-3">
            <Row label="VKN / TCKN"
              value={form.tax_id}
              onChange={(v) => setForm({ ...form, tax_id: v })}
              invalid={taxIdInvalid} />
            <Row label="Vergi Dairesi"
              value={form.tax_office}
              onChange={(v) => setForm({ ...form, tax_office: v })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-200 mb-1.5">Şirket Tipi</label>
              <DarkSelect
                value={form.company_type}
                onChange={(v) => setForm({ ...form, company_type: v as CompanyType })}
                options={COMPANY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              />
            </div>
            <Row label="Ticaret Sicil No"
              value={form.trade_registry_no}
              onChange={(v) => setForm({ ...form, trade_registry_no: v })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Row label="Faaliyet Kodu"
              value={form.activity_code}
              onChange={(v) => setForm({ ...form, activity_code: v })} />
            <Row label="Kuruluş Tarihi" type="date"
              value={form.incorporated_at}
              onChange={(v) => setForm({ ...form, incorporated_at: v })} />
          </div>

          <Row label="MERSİS No"
            value={form.mersis_no}
            onChange={(v) => setForm({ ...form, mersis_no: v })} />

          <Row label="Adres" textarea
            value={form.address}
            onChange={(v) => setForm({ ...form, address: v })} />

          <div className="border-t border-surface-700 pt-3 space-y-3">
            <p className="text-[10px] uppercase text-surface-400 tracking-wider">İletişim</p>
            <Row label="Yetkili"
              value={form.contact_name}
              onChange={(v) => setForm({ ...form, contact_name: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Row label="Telefon" type="tel"
                value={form.contact_phone}
                onChange={(v) => setForm({ ...form, contact_phone: v })} />
              <Row label="E-posta" type="email"
                value={form.contact_email}
                onChange={(v) => setForm({ ...form, contact_email: v })} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-4 border-t border-surface-700">
          <button type="button" onClick={onClose} disabled={submitting}
            className="px-4 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium border border-surface-600 disabled:opacity-50">
            İptal
          </button>
          <button type="submit" disabled={submitting || !form.legal_name.trim() || taxIdInvalid}
            className="ml-auto px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Oluştur
          </button>
        </div>
      </form>
    </div>

    {showCreateGroup && (
      <CreateGroupModal
        onClose={() => setShowCreateGroup(false)}
        onCreated={(g) => {
          setShowCreateGroup(false);
          setForm({ ...form, group_id: g.id });
          onGroupCreated?.(g);
        }}
      />
    )}
    </>
  );
}

function Row({
  label, value, onChange, type = "text", textarea = false,
  required = false, autoFocus = false, invalid = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  textarea?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-surface-200 mb-1.5">{label}</label>
      {textarea ? (
        <textarea required={required} value={value}
          onChange={(e) => onChange(e.target.value)} rows={2}
          className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
      ) : (
        <input type={type} required={required} value={value} autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full px-3 py-2.5 rounded-xl bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 ${
            invalid ? "border border-red-500/50 focus:ring-red-500"
                    : "border border-surface-600 focus:ring-brand-500"
          }`} />
      )}
    </div>
  );
}

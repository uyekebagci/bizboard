"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Building2,
  Plus,
  Pencil,
  Trash2,
  Star,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { isValidTaxId } from "@/lib/taxId";
import type { MyCompany, CompanyType } from "@/types";

// ── company_type label ────────────────────────────────────────
const COMPANY_TYPES: { value: CompanyType; label: string }[] = [
  { value: "AS", label: "Anonim Sirket" },
  { value: "LTD", label: "Limited Sirket" },
  { value: "SAHIS", label: "Sahis Isletmesi" },
  { value: "KOOP", label: "Kooperatif" },
  { value: "DERNEK", label: "Dernek" },
  { value: "OTHER", label: "Diger" },
];

function typeLabel(t: CompanyType): string {
  return COMPANY_TYPES.find((c) => c.value === t)?.label ?? t;
}

interface FormState {
  legal_name: string;
  tax_id: string;
  tax_office: string;
  trade_registry_no: string;
  company_type: CompanyType;
  activity_code: string;
  incorporated_at: string;
  mersis_no: string;
  address: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
}

function emptyForm(): FormState {
  return {
    legal_name: "",
    tax_id: "",
    tax_office: "",
    trade_registry_no: "",
    company_type: "OTHER",
    activity_code: "",
    incorporated_at: "",
    mersis_no: "",
    address: "",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
  };
}

function formFromCompany(c: MyCompany): FormState {
  return {
    legal_name: c.legal_name,
    tax_id: c.tax_id ?? "",
    tax_office: c.tax_office ?? "",
    trade_registry_no: c.trade_registry_no ?? "",
    company_type: c.company_type,
    activity_code: c.activity_code ?? "",
    incorporated_at: c.incorporated_at ?? "",
    mersis_no: c.mersis_no ?? "",
    address: c.address ?? "",
    contact_name: c.contact_name ?? "",
    contact_phone: c.contact_phone ?? "",
    contact_email: c.contact_email ?? "",
  };
}

export default function AdminMyCompaniesPage() {
  const router = useRouter();
  const { profile } = useAppStore();

  const [companies, setCompanies] = useState<MyCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<MyCompany | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<MyCompany | null>(null);

  // ── redirect non-admin ──
  useEffect(() => {
    if (profile && profile.role !== "admin") {
      router.push("/dashboard");
    }
  }, [profile, router]);

  // ── fetch list ──
  async function fetchList() {
    setLoading(true);
    try {
      const data = await api.get<MyCompany[]>("/admin/my-companies");
      setCompanies(data || []);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, []);

  // ── delete ──
  async function handleDelete(id: string) {
    try {
      await api.delete(`/admin/my-companies/${id}`);
      toast.info("Firma silindi");
      setDeleteConfirm(null);
      fetchList();
    } catch (e) {
      setError(getErrorMessage(e));
      toast.error(e);
    }
  }

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push("/admin")}
          className="p-2 rounded-lg bg-[#2a2a2a] hover:bg-[#333] transition-colors"
        >
          <ChevronLeft size={20} className="text-yellow-400" />
        </button>
        <div className="flex items-center gap-2.5">
          <Building2 size={24} className="text-yellow-400" />
          <h1 className="text-2xl font-bold text-white">Benim Firmalarim</h1>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-semibold text-white">Firmalar</h2>
            <span className="ml-1 text-sm text-gray-500">
              ({companies.length})
            </span>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold text-sm rounded-xl transition-colors"
          >
            <Plus size={16} />
            Yeni Firma
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Yukleniyor...</div>
        ) : companies.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Henuz firma yok</div>
        ) : (
          <div className="divide-y divide-[#2a2a2a]">
            {companies.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-4 hover:bg-[#222] transition-colors group gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-white text-sm truncate">
                      {c.legal_name}
                    </h3>
                    {c.is_default && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-500/20 text-yellow-400 text-[10px] font-medium">
                        <Star size={10} />
                        Varsayilan
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md bg-[#2a2a2a] text-gray-400 text-[10px] font-medium">
                      {typeLabel(c.company_type)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 flex flex-wrap gap-3">
                    {c.tax_id && <span>VKN/TC: {c.tax_id}</span>}
                    {c.tax_office && <span>{c.tax_office}</span>}
                    {c.activity_code && <span>NACE {c.activity_code}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditing(c)}
                    className="p-2 rounded-lg hover:bg-[#333] text-gray-400 hover:text-white transition-colors"
                    title="Duzenle"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(c)}
                    disabled={c.is_default}
                    className={`p-2 rounded-lg transition-colors ${
                      c.is_default
                        ? "text-gray-700 cursor-not-allowed"
                        : "hover:bg-red-900/30 text-gray-400 hover:text-red-400"
                    }`}
                    title={
                      c.is_default
                        ? "Varsayilan firma silinemez"
                        : "Sil"
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CompanyFormModal
          title="Yeni Firma"
          initial={emptyForm()}
          onClose={() => setShowCreate(false)}
          onSubmit={async (form) => {
            await api.post("/admin/my-companies", toPayload(form));
            toast.success("Firma oluşturuldu");
            setShowCreate(false);
            fetchList();
          }}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <CompanyFormModal
          title="Firmayi Duzenle"
          initial={formFromCompany(editing)}
          onClose={() => setEditing(null)}
          onSubmit={async (form) => {
            await api.put(`/admin/my-companies/${editing.id}`, toPayload(form));
            toast.success("Firma güncellendi");
            setEditing(null);
            fetchList();
          }}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="glass-card p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-2">
              Firmayi Sil
            </h3>
            <p className="text-sm text-gray-400 mb-6">
              <strong className="text-white">{deleteConfirm.legal_name}</strong>{" "}
              kaydini silmek istediginizden emin misiniz? Bu islem geri alinamaz.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-xl bg-[#2a2a2a] hover:bg-[#333] text-gray-200 text-sm"
              >
                Iptal
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm"
              >
                Evet, Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Form modal
// ─────────────────────────────────────────────────────────────

function toPayload(form: FormState) {
  // Bos string'leri null'a cevirme — backend'in blankToNull'i zaten yapiyor,
  // ama incorporated_at ISO bos string LocalDate parse hatasi atacagindan
  // burada filtreleyelim.
  const out: Record<string, unknown> = {};
  out.legal_name = form.legal_name;
  out.tax_id = form.tax_id || null;
  out.tax_office = form.tax_office || null;
  out.trade_registry_no = form.trade_registry_no || null;
  out.company_type = form.company_type;
  out.activity_code = form.activity_code || null;
  out.incorporated_at = form.incorporated_at || null;
  out.mersis_no = form.mersis_no || null;
  out.address = form.address || null;
  out.contact_name = form.contact_name || null;
  out.contact_phone = form.contact_phone || null;
  out.contact_email = form.contact_email || null;
  return out;
}

interface FormModalProps {
  title: string;
  initial: FormState;
  onClose: () => void;
  onSubmit: (form: FormState) => Promise<void>;
}

function CompanyFormModal({ title, initial, onClose, onSubmit }: FormModalProps) {
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taxIdInvalid = form.tax_id.length > 0 && !isValidTaxId(form.tax_id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.legal_name.trim()) {
      setError("Tuzel kisi adi zorunlu");
      return;
    }
    if (taxIdInvalid) {
      setError("Gecersiz VKN (10 hane) veya TCKN (11 hane). Kontrol edip tekrar deneyin.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Kaydetme basarisiz";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="glass-card p-6 max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[#2a2a2a] text-gray-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Tuzel kisi adi *" colSpan="md:col-span-2">
            <input
              required
              value={form.legal_name}
              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Sirket tipi">
            <DarkSelect
              value={form.company_type}
              onChange={(v) => setForm({ ...form, company_type: v as CompanyType })}
              options={COMPANY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            />
          </Field>

          <Field label="VKN / TCKN">
            <input
              value={form.tax_id}
              onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
              placeholder="10 veya 11 hane"
              className={`${inputClass} ${taxIdInvalid ? "border-red-500" : ""}`}
              inputMode="numeric"
              maxLength={11}
            />
            {taxIdInvalid && (
              <p className="mt-1 text-xs text-red-400">
                Gecersiz format / checksum
              </p>
            )}
          </Field>

          <Field label="Vergi dairesi">
            <input
              value={form.tax_office}
              onChange={(e) => setForm({ ...form, tax_office: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Ticaret sicil no">
            <input
              value={form.trade_registry_no}
              onChange={(e) =>
                setForm({ ...form, trade_registry_no: e.target.value })
              }
              className={inputClass}
            />
          </Field>

          <Field label="MERSIS no">
            <input
              value={form.mersis_no}
              onChange={(e) => setForm({ ...form, mersis_no: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="NACE faaliyet kodu">
            <input
              value={form.activity_code}
              onChange={(e) =>
                setForm({ ...form, activity_code: e.target.value })
              }
              placeholder="orn. 47.11"
              className={inputClass}
            />
          </Field>

          <Field label="Kurulus tarihi">
            <input
              type="date"
              value={form.incorporated_at}
              onChange={(e) =>
                setForm({ ...form, incorporated_at: e.target.value })
              }
              className={inputClass}
            />
          </Field>

          <Field label="Adres" colSpan="md:col-span-2">
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
              className={inputClass}
            />
          </Field>

          <Field label="Iletisim ad-soyad">
            <input
              value={form.contact_name}
              onChange={(e) =>
                setForm({ ...form, contact_name: e.target.value })
              }
              className={inputClass}
            />
          </Field>

          <Field label="Telefon">
            <input
              value={form.contact_phone}
              onChange={(e) =>
                setForm({ ...form, contact_phone: e.target.value })
              }
              className={inputClass}
            />
          </Field>

          <Field label="E-posta" colSpan="md:col-span-2">
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) =>
                setForm({ ...form, contact_email: e.target.value })
              }
              className={inputClass}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#2a2a2a] hover:bg-[#333] text-gray-200 text-sm"
          >
            Iptal
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold text-sm"
          >
            {submitting ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-[#2a2a2a] border border-[#333] text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors";

function Field({
  label,
  colSpan,
  children,
}: {
  label: string;
  colSpan?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={colSpan ?? ""}>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

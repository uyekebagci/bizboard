"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users, Plus, Pencil, Trash2, X, Search, ArrowRight,
  CircleUserRound, Package, RefreshCw, ArrowLeft,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import { isValidTaxId } from "@/lib/taxId";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { Counterpart, CounterpartRole, Business } from "@/types";
import { DarkSelect } from "@/components/shared/DarkSelect";

// ── Role helpers ─────────────────────────────────────────
const ROLES: { value: CounterpartRole; label: string; badge: string; icon: typeof CircleUserRound }[] = [
  { value: "CUSTOMER", label: "Musteri", badge: "bg-green-500/20 text-green-400", icon: CircleUserRound },
  { value: "SUPPLIER", label: "Tedarikci", badge: "bg-blue-500/20 text-blue-400", icon: Package },
  { value: "BOTH", label: "Her ikisi", badge: "bg-purple-500/20 text-purple-400", icon: RefreshCw },
  { value: "OTHER", label: "Diger", badge: "bg-surface-600/40 text-surface-300", icon: Users },
];

function roleMeta(r: CounterpartRole) {
  return ROLES.find((x) => x.value === r) ?? ROLES[3];
}

interface FormState {
  name: string;
  tax_id: string;
  tax_office: string;
  role: CounterpartRole;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  address: string;
  payment_terms_days: string; // string form input; number'a parse'lanır
  notes: string;
}

function emptyForm(): FormState {
  return {
    name: "",
    tax_id: "",
    tax_office: "",
    role: "CUSTOMER",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    address: "",
    payment_terms_days: "0",
    notes: "",
  };
}

function formFromCp(c: Counterpart): FormState {
  return {
    name: c.name,
    tax_id: c.tax_id ?? "",
    tax_office: c.tax_office ?? "",
    role: c.role,
    contact_name: c.contact_name ?? "",
    contact_phone: c.contact_phone ?? "",
    contact_email: c.contact_email ?? "",
    address: c.address ?? "",
    payment_terms_days: String(c.payment_terms_days ?? 0),
    notes: c.notes ?? "",
  };
}

export default function CounterpartsPage() {
  const router = useRouter();
  const [list, setList] = useState<Counterpart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<CounterpartRole | "ALL">("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Counterpart | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Counterpart | null>(null);

  // v1.7.x bug-fix: counterpart create için business_id zorunlu (backend).
  // Sayfa açılırken kullanıcının erişebildiği business'ları çek; tek varsa
  // otomatik seç, çoksa modal'da dropdown göster.
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>("");

  // v1.7.x: business filter + grup görünümü (default: birden fazla business
  // varsa business-bazlı gruplama, tek varsa düz liste).
  const [businessFilter, setBusinessFilter] = useState<string>("ALL");
  const [groupBy, setGroupBy] = useState<"business" | "none">("business");

  useEffect(() => {
    api.get<Business[]>("/businesses")
      .then((r) => {
        setBusinesses(r || []);
        if ((r || []).length === 1) setSelectedBusinessId(r[0].id);
        // Tek business varsa gruplama anlamsız
        if ((r || []).length <= 1) setGroupBy("none");
      })
      .catch(() => { /* silent */ });
  }, []);

  async function fetchList() {
    setLoading(true);
    try {
      const path = roleFilter === "ALL" ? "/counterparts" : `/counterparts?role=${roleFilter}`;
      const data = await api.get<Counterpart[]>(path);
      setList(data || []);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter]);

  const filtered = useMemo(() => {
    let out = list;
    // v1.7.x: business filter
    if (businessFilter !== "ALL") {
      out = out.filter((c) => c.business_id === businessFilter);
    }
    if (search.trim()) {
      const q = search.toLocaleLowerCase("tr");
      out = out.filter(
        (c) =>
          c.name.toLocaleLowerCase("tr").includes(q) ||
          (c.tax_id && c.tax_id.includes(search.trim()))
      );
    }
    return out;
  }, [list, search, businessFilter]);

  // v1.7.x: gruplama — businessId → counterpart[]
  const grouped = useMemo(() => {
    if (groupBy !== "business" || businessFilter !== "ALL") return null;
    const map = new Map<string, Counterpart[]>();
    for (const c of filtered) {
      const k = c.business_id || "_no_business";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    // Business sırası — businesses listesindeki sıra + bilinmeyen sona
    const ordered: Array<{ businessId: string; businessName: string; items: Counterpart[] }> = [];
    for (const b of businesses) {
      const items = map.get(b.id);
      if (items && items.length > 0) {
        ordered.push({ businessId: b.id, businessName: b.name, items });
      }
    }
    const noBiz = map.get("_no_business");
    if (noBiz && noBiz.length > 0) {
      ordered.push({ businessId: "_no_business", businessName: "İşletme bağlantısı yok", items: noBiz });
    }
    return ordered;
  }, [filtered, groupBy, businessFilter, businesses]);

  // v1.7.x: hem grouped hem flat list aynı card markup'ını kullansın
  function renderCard(c: Counterpart) {
    const m = roleMeta(c.role);
    const Icon = m.icon;
    const balance = c.current_balance ?? 0;
    return (
      <div
        key={c.id}
        onClick={() => router.push(`/dashboard/counterparts/${c.id}`)}
        className="glass-card glass-hover p-4 cursor-pointer transition-all active:scale-[0.98] group"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", m.badge)}>
              <Icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-white text-sm leading-tight truncate">
                {c.name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", m.badge)}>
                  {m.label}
                </span>
                {c.tax_id && (
                  <span className="text-[10px] text-surface-400">{c.tax_id}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className={cn(
              "text-sm font-bold whitespace-nowrap",
              balance > 0 ? "text-green-400" : balance < 0 ? "text-red-400" : "text-surface-300"
            )}>
              {formatCurrency(balance)}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); setEditing(c); }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-surface-400 hover:text-white"
                title="Duzenle"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(c); }}
                className="p-1.5 rounded-lg hover:bg-red-500/20 text-surface-400 hover:text-red-400"
                title="Sil"
              >
                <Trash2 size={14} />
              </button>
              <ArrowRight size={14} className="text-surface-500 ml-1" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/counterparts/${id}`);
      toast.info("Cari silindi");
      setDeleteConfirm(null);
      fetchList();
    } catch (e) {
      // 409 mesajını göster — silinmedi
      setError(getErrorMessage(e));
      setDeleteConfirm(null);
      toast.error(e);
    }
  }

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-start gap-3">
            {/* v1.6.10: Geri dön butonu */}
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 mt-0.5 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
              aria-label="Geri don"
            >
              <ArrowLeft size={20} className="text-surface-300" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Karsi Firmalar</h1>
              <p className="text-surface-400 mt-1 text-sm">
                Musteri, tedarikci ve diger dis paydaslarin cari hesabi
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm rounded-xl transition-colors shrink-0"
          >
            <Plus size={16} />
            Yeni
          </button>
        </div>
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Filters */}
      <section className="glass-card p-3 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Isim veya vergi no ara..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-700/50 border border-surface-600 text-white placeholder-surface-400 text-sm focus:outline-none focus:border-brand-500"
            />
          </div>
          {/* v1.7.x: business filter (sadece >1 business varsa) */}
          {businesses.length > 1 && (
            <div className="min-w-[200px]">
              <DarkSelect
                value={businessFilter}
                onChange={setBusinessFilter}
                placeholder="Tüm İşletmeler"
                searchable={businesses.length > 6}
                options={[
                  { value: "ALL", label: "Tüm İşletmeler" },
                  ...businesses.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
            {(["ALL", ...ROLES.map((r) => r.value)] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r as CounterpartRole | "ALL")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  roleFilter === r
                    ? "bg-brand-600 text-white"
                    : "bg-surface-700/50 text-surface-300 hover:bg-surface-700"
                )}
              >
                {r === "ALL" ? "Tumu" : roleMeta(r as CounterpartRole).label}
              </button>
            ))}
          </div>
          {/* v1.7.x: grup görünümü toggle (sadece >1 business + ALL filter) */}
          {businesses.length > 1 && businessFilter === "ALL" && (
            <div className="ml-auto flex items-center gap-1 text-[11px]">
              <span className="text-surface-400">Görünüm:</span>
              <button
                onClick={() => setGroupBy("business")}
                className={cn(
                  "px-2 py-1 rounded-md font-medium",
                  groupBy === "business" ? "bg-brand-500/20 text-brand-200" : "text-surface-400 hover:bg-surface-700",
                )}
              >
                İşletmeye Göre
              </button>
              <button
                onClick={() => setGroupBy("none")}
                className={cn(
                  "px-2 py-1 rounded-md font-medium",
                  groupBy === "none" ? "bg-brand-500/20 text-brand-200" : "text-surface-400 hover:bg-surface-700",
                )}
              >
                Düz Liste
              </button>
            </div>
          )}
        </div>
      </section>

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-surface-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-surface-400 text-sm">
          {list.length === 0
            ? 'Henuz karsi firma yok. "Yeni" ile ilk kaydi ekleyebilirsin.'
            : "Aramaya uyan kayit bulunamadi."}
        </div>
      ) : grouped ? (
        // v1.7.x: business-bazlı gruplama
        <div className="space-y-4">
          {grouped.map((g) => (
            <section key={g.businessId}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-1 h-4 bg-brand-500 rounded-full" />
                <h3 className="text-xs font-semibold text-surface-200 uppercase tracking-wider">
                  {g.businessName}
                </h3>
                <span className="text-[10px] text-surface-400">({g.items.length})</span>
                <div className="flex-1 border-b border-surface-700 ml-2" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {g.items.map((c) => renderCard(c))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((c) => renderCard(c))}
        </div>
      )}

      {/* Create */}
      {showCreate && (
        <CounterpartFormModal
          title="Yeni Karsi Firma"
          initial={emptyForm()}
          businesses={businesses}
          selectedBusinessId={selectedBusinessId}
          onBusinessChange={setSelectedBusinessId}
          requireBusiness
          onClose={() => setShowCreate(false)}
          onSubmit={async (f) => {
            if (!selectedBusinessId) {
              throw new ApiError(400, "BUSINESS-REQUIRED",
                "Bu counterpart hangi işletmeye ait olacak? Lütfen seç.", undefined);
            }
            // v1.6.23.12 (WP 3c8401f6 / TODO d72cfde9):
            // Counterpart yaratıldıktan sonra opsiyonel "telefon ekle" prompt.
            const created = await api.post<{ id: string; name: string }>(
              "/counterparts",
              { ...toPayload(f), business_id: selectedBusinessId },
            );
            toast.success("Cari oluşturuldu");
            setShowCreate(false);
            fetchList();
            if (typeof window !== "undefined" && created?.id) {
              const wantsPhone = window.confirm(
                `"${created.name}" firmasi olusturuldu.\n\nBu firmaya telefon eklemek ister misin?`,
              );
              if (wantsPhone) {
                window.location.href = `/dashboard/telefonlar?counterpart_id=${created.id}`;
              }
            }
          }}
        />
      )}

      {/* Edit */}
      {editing && (
        <CounterpartFormModal
          title="Karsi Firmayi Duzenle"
          initial={formFromCp(editing)}
          onClose={() => setEditing(null)}
          onSubmit={async (f) => {
            await api.put(`/counterparts/${editing.id}`, toPayload(f));
            toast.success("Cari güncellendi");
            setEditing(null);
            fetchList();
          }}
        />
      )}

      {/* Delete */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="card p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-2">
              Karsi Firmayi Sil
            </h3>
            <p className="text-sm text-surface-400 mb-6">
              <strong className="text-white">{deleteConfirm.name}</strong> kaydini
              silmek istediginden emin misin? Bagli borc varsa silme reddedilir.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm"
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

// ─────────────────────────────────────────────────────────
// Form modal
// ─────────────────────────────────────────────────────────

function toPayload(f: FormState) {
  const days = parseInt(f.payment_terms_days, 10);
  return {
    name: f.name,
    tax_id: f.tax_id || null,
    tax_office: f.tax_office || null,
    role: f.role,
    contact_name: f.contact_name || null,
    contact_phone: f.contact_phone || null,
    contact_email: f.contact_email || null,
    address: f.address || null,
    payment_terms_days: Number.isFinite(days) ? days : 0,
    notes: f.notes || null,
  };
}

interface FormModalProps {
  title: string;
  initial: FormState;
  onClose: () => void;
  onSubmit: (form: FormState) => Promise<void>;
  /** v1.7.x: create için zorunlu, edit'te gizli */
  businesses?: Business[];
  selectedBusinessId?: string;
  onBusinessChange?: (id: string) => void;
  requireBusiness?: boolean;
}

function CounterpartFormModal({
  title, initial, onClose, onSubmit,
  businesses = [], selectedBusinessId = "", onBusinessChange, requireBusiness = false,
}: FormModalProps) {
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taxIdInvalid = form.tax_id.length > 0 && !isValidTaxId(form.tax_id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Isim zorunlu");
      return;
    }
    if (taxIdInvalid) {
      setError("Gecersiz VKN (10 hane) veya TCKN (11 hane).");
      return;
    }
    if (requireBusiness && !selectedBusinessId) {
      setError("İşletme seçin (hangi işletmenin counterpart'ı olacağını belirtin).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Kaydetme basarisiz";
      setError(msg);
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="card p-6 max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-surface-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* v1.7.x bug-fix: business picker — create modunda zorunlu */}
        {requireBusiness && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-surface-200 mb-1.5">İşletme *</label>
            {businesses.length === 0 ? (
              <div className="h-10 bg-surface-700 rounded-xl animate-pulse" />
            ) : businesses.length === 1 ? (
              <div className="px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-700/40 text-sm text-surface-200">
                {businesses[0].name}
              </div>
            ) : (
              <DarkSelect
                required
                value={selectedBusinessId}
                onChange={(v) => onBusinessChange?.(v)}
                placeholder="İşletme seçin"
                searchable={businesses.length > 6}
                options={businesses.map((b) => ({ value: b.id, label: b.name }))}
              />
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Isim *" colSpan="md:col-span-2">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Rol">
            <DarkSelect
              value={form.role}
              onChange={(v) => setForm({ ...form, role: v as CounterpartRole })}
              options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
            />
          </Field>

          <Field label="Odeme vadesi (gun)">
            <input
              type="number"
              min={0}
              value={form.payment_terms_days}
              onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="VKN / TCKN">
            <input
              value={form.tax_id}
              onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
              placeholder="10 veya 11 hane"
              inputMode="numeric"
              maxLength={11}
              className={cn(inputClass, taxIdInvalid && "border-red-500")}
            />
            {taxIdInvalid && (
              <p className="mt-1 text-xs text-red-400">Gecersiz format / checksum</p>
            )}
          </Field>

          <Field label="Vergi dairesi">
            <input
              value={form.tax_office}
              onChange={(e) => setForm({ ...form, tax_office: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Iletisim ad-soyad">
            <input
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Telefon">
            <input
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="E-posta" colSpan="md:col-span-2">
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
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

          <Field label="Notlar" colSpan="md:col-span-2">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm"
          >
            Iptal
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-semibold text-sm"
          >
            {submitting ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-surface-700/50 border border-surface-600 text-white text-sm placeholder-surface-400 focus:outline-none focus:border-brand-500 transition-colors";

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
      <label className="block text-xs font-medium text-surface-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  HardHat,
  Truck,
  UtensilsCrossed,
  Car,
  Store,
  Home,
  Briefcase,
  LayoutGrid,
  Wallet,
  Package,
  Users,
  FolderKanban,
  FileText,
  CalendarCheck,
  CarFront,
  UserCircle,
  FlaskConical,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Building2,
  Lightbulb,
  Calculator,
  Plus,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api/client";
import { cn, formatCurrency, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import type { BusinessType, BusinessTypeDefaultCost, ModuleType } from "@/types";

// ===== ICON MAPS =====
const categoryIconMap: Record<string, LucideIcon> = {
  "hard-hat": HardHat,
  truck: Truck,
  "utensils-crossed": UtensilsCrossed,
  car: Car,
  store: Store,
  home: Home,
  briefcase: Briefcase,
  "layout-grid": LayoutGrid,
};

const moduleIconMap: Record<string, LucideIcon> = {
  finance: Wallet,
  inventory: Package,
  staff: Users,
  projects: FolderKanban,
  documents: FileText,
  reservations: CalendarCheck,
  vehicles: CarFront,
  menu: UtensilsCrossed,
  crm: UserCircle,
};

const moduleLabelMap: Record<string, string> = {
  finance: "Finans",
  inventory: "Envanter",
  staff: "Personel",
  projects: "Projeler",
  documents: "Belgeler",
  reservations: "Rezervasyonlar",
  vehicles: "Araclar",
  menu: "Menu",
  crm: "Musteriler",
};

// ===== COLOR PALETTE =====
const colorPalette = [
  "#ef4444", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#ec4899", "#f97316", "#14b8a6",
  "#6366f1", "#84cc16", "#06b6d4", "#e11d48",
];

// ===== TYPES =====
interface FormData {
  name: string;
  description: string;
  businessTypeId: string;
  /** v1.5.7+ serbest metin tipi adı (autocomplete'lik) */
  businessTypeName: string;
  color: string;
  currency: string;
  modules: string[];
  isMockup: boolean;
  // Mockup analysis fields
  mockupEstimatedRevenue: number;
  mockupEstimatedExpense: number;
  mockupInitialInvestment: number;
  mockupNotes: string;
  /** v1.5.6: kurulum maliyetlerini ekle checkbox'ı */
  includeSetupCosts: boolean;
  /** v1.5.8: yeni wizard akışı — manuel kuruluş kalemleri */
  setupCostItems: SetupCostItem[];
  /** v1.5.8: yeni wizard akışı — aylık sabit masraflar (12 kategori) */
  monthlyFixedCostItems: MonthlyFixedCostItem[];
}

const STEPS = [
  { id: 1, label: "Tip Secimi" },
  { id: 2, label: "Temel Bilgiler" },
  { id: 3, label: "Moduller" },
  { id: 4, label: "Kurulus" },
  { id: 5, label: "Aylik Gider" },
  { id: 6, label: "Onizleme" },
];

// v1.5.8: yeni wizard akışı için tipler
interface SetupCostItem {
  id: string; // local-only, key olarak
  name: string;
  amount: string; // formattedMoneyInput
}

interface MonthlyFixedCostItem {
  category: string; // FixedCostCategory key
  label: string;    // display TR label
  required: boolean;
  applicable: boolean; // "Geçerli değil" toggle (default true)
  amount: string;   // formattedMoneyInput; OTHER için de
  customName?: string; // OTHER için serbest isim
}

interface FixedCostCategoryMeta {
  key: string;
  label: string;
  required: boolean;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * v1.6.0: localStorage draft'i mevcut FormData default'lariyla guvenli sekilde
 * birlestir. Eski surumlerden kalan partial JSON'larda yeni alanlar yok;
 * defaults korunarak ezilmemis halde devam eder. Array alanlari icin tip
 * dogrulamasi: array degilse default array kullanilir (string olarak gelmis
 * bozuk verilere karsi koruma).
 */
function mergeDraft(defaults: FormData, parsed: Record<string, unknown>): FormData {
  const out: FormData = { ...defaults, ...parsed } as FormData;
  // Array alanlarini guvenle dogrula
  if (!Array.isArray(out.modules)) out.modules = defaults.modules;
  if (!Array.isArray(out.setupCostItems)) out.setupCostItems = defaults.setupCostItems;
  if (!Array.isArray(out.monthlyFixedCostItems))
    out.monthlyFixedCostItems = defaults.monthlyFixedCostItems;
  // String alanlari guvenle dogrula
  if (typeof out.businessTypeName !== "string") out.businessTypeName = "";
  if (typeof out.name !== "string") out.name = "";
  if (typeof out.description !== "string") out.description = "";
  if (typeof out.color !== "string") out.color = "";
  if (typeof out.currency !== "string") out.currency = "TRY";
  if (typeof out.mockupNotes !== "string") out.mockupNotes = "";
  // Boolean
  if (typeof out.isMockup !== "boolean") out.isMockup = false;
  if (typeof out.includeSetupCosts !== "boolean") out.includeSetupCosts = false;
  // Numerikler
  for (const k of [
    "mockupEstimatedRevenue",
    "mockupEstimatedExpense",
    "mockupInitialInvestment",
  ] as const) {
    if (typeof out[k] !== "number" || Number.isNaN(out[k])) out[k] = 0;
  }
  return out;
}

// ===== MAIN COMPONENT =====
export default function AddBusinessPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [businessTypes, setBusinessTypes] = useState<BusinessType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    name: "",
    description: "",
    businessTypeId: "",
    businessTypeName: "",
    color: "",
    currency: "TRY",
    modules: [],
    isMockup: false,
    mockupEstimatedRevenue: 0,
    mockupEstimatedExpense: 0,
    mockupInitialInvestment: 0,
    mockupNotes: "",
    includeSetupCosts: false,
    setupCostItems: [],
    monthlyFixedCostItems: [],
  });

  // v1.5.8: autocomplete + 12 kategori master data
  const [typeNameSuggestions, setTypeNameSuggestions] = useState<string[]>([]);
  const [fixedCostCategories, setFixedCostCategories] = useState<FixedCostCategoryMeta[]>([]);

  /** v1.5.6: seçili tipin varsayılan kurulum/sabit gider şablonları */
  const [defaultCosts, setDefaultCosts] = useState<BusinessTypeDefaultCost[]>([]);
  const [defaultCostsLoading, setDefaultCostsLoading] = useState(false);

  // Load business types
  useEffect(() => {
    api
      .get<BusinessType[]>("/business-types")
      .then((data) => {
        setBusinessTypes(data);
        setIsLoading(false);
      })
      .catch(() => {
        setError("Isletme tipleri yuklenemedi");
        setIsLoading(false);
      });
  }, []);

  // Auto-save draft to localStorage.
  // v1.6.0: eski wizard surumlerinden (v1.5.8 oncesi) kalan draft'larda yeni
  // alanlar yok — partial parsed objesi setForm ile state'i ezince
  // businessTypeName/setupCostItems/monthlyFixedCostItems undefined kaliyordu.
  // Bu durum canNext'te sessiz TypeError'a yol acip Devam butonunu disabled
  // birakiyordu. Cozum: defaults ile shallow merge + array tip dogrulamasi.
  useEffect(() => {
    const draft = localStorage.getItem("bizboard_draft_business");
    if (!draft) return;
    try {
      const parsed: unknown = JSON.parse(draft);
      if (parsed && typeof parsed === "object") {
        setForm((prev) => mergeDraft(prev, parsed as Record<string, unknown>));
      }
    } catch {
      // Bozuk draft — sessizce temizle.
      localStorage.removeItem("bizboard_draft_business");
    }
  }, []);

  useEffect(() => {
    if (form.name || form.businessTypeId) {
      localStorage.setItem("bizboard_draft_business", JSON.stringify(form));
    }
  }, [form]);

  // v1.5.6: tip seçildiğinde default cost şablonlarını çek.
  useEffect(() => {
    if (!form.businessTypeId) {
      setDefaultCosts([]);
      return;
    }
    let cancelled = false;
    setDefaultCostsLoading(true);
    api
      .get<BusinessTypeDefaultCost[]>(`/business-types/${form.businessTypeId}/default-costs`)
      .then((data) => { if (!cancelled) setDefaultCosts(data || []); })
      .catch(() => { if (!cancelled) setDefaultCosts([]); })
      .finally(() => { if (!cancelled) setDefaultCostsLoading(false); });
    return () => { cancelled = true; };
  }, [form.businessTypeId]);

  // v1.5.8: autocomplete listesi + 12 kategori (mount'ta tek seferlik)
  useEffect(() => {
    api.get<string[]>("/business-types/names")
      .then((d) => setTypeNameSuggestions(d || []))
      .catch(() => setTypeNameSuggestions([]));
    api.get<FixedCostCategoryMeta[]>("/fixed-cost-categories")
      .then((cats) => {
        setFixedCostCategories(cats || []);
        // İlk yüklemede default monthly items'ı kategorilerle doldur (zaten boşsa).
        // v1.6.0: defansif — prev.monthlyFixedCostItems undefined ise sıfır say.
        setForm((prev) => {
          const existing = prev.monthlyFixedCostItems ?? [];
          if (existing.length > 0) return prev;
          return {
            ...prev,
            monthlyFixedCostItems: (cats || []).map((c) => ({
              category: c.key,
              label: c.label,
              required: c.required,
              applicable: c.required, // OTHER default kapalı, 11 zorunlu açık
              amount: "",
              customName: "",
            })),
          };
        });
      })
      .catch(() => setFixedCostCategories([]));
  }, []);

  // v1.5.8: tip seçilince businessTypeName'i otomatik doldur (kullanıcı override edebilir)
  // v1.6.0: defansif — form.businessTypeName undefined ise empty say.
  useEffect(() => {
    if (!form.businessTypeId) return;
    const t = businessTypes.find((b) => b.id === form.businessTypeId);
    if (t && !(form.businessTypeName ?? "").trim()) {
      setForm((prev) => ({ ...prev, businessTypeName: t.label }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.businessTypeId, businessTypes]);

  const selectedType = businessTypes.find(
    (t) => t.id === form.businessTypeId
  );

  function selectType(typeId: string) {
    const type = businessTypes.find((t) => t.id === typeId);
    if (!type) return;
    setForm((prev) => ({
      ...prev,
      businessTypeId: typeId,
      color: prev.color || type.color,
      modules: type.default_modules || [],
    }));
  }

  function toggleModule(mod: string) {
    setForm((prev) => ({
      ...prev,
      modules: prev.modules.includes(mod)
        ? prev.modules.filter((m) => m !== mod)
        : [...prev.modules, mod],
    }));
  }

  function canNext(): boolean {
    // v1.6.0: defansif okumalar — eski draft'lardan / bozuk state'ten gelen
    // undefined alanlar artik silently crash etmiyor.
    switch (step) {
      case 1: {
        // v1.6.1: master tip seçimi kaldırıldı — sadece ad zorunlu.
        const typeName = (form.businessTypeName ?? "").trim();
        return typeName.length >= 2;
      }
      case 2:
        return (form.name ?? "").trim().length >= 2;
      case 3:
        return (form.modules ?? []).length > 0;
      case 4: {
        // Kuruluş maliyetleri opsiyonel — boş bırakılabilir; ama dolu olanlar valid olmalı
        const items = form.setupCostItems ?? [];
        return items.every(
          (it) => !(it.name ?? "").trim() || parseMoneyInput(it.amount ?? "") >= 0
        );
      }
      case 5: {
        // Aylık sabit masraflar: applicable=true olan tüm zorunlu kategorilerde amount > 0
        // Geçerli değil olanlar atlanır
        const items = form.monthlyFixedCostItems ?? [];
        for (const it of items) {
          if (!it.applicable) continue;
          const amt = parseMoneyInput(it.amount ?? "");
          if (!it.required && amt <= 0) continue;
          if (amt <= 0) return false;
          if (it.category === "OTHER" && !(it.customName ?? "").trim()) return false;
        }
        return true;
      }
      default:
        return true;
    }
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);

    try {
      const metadata: Record<string, unknown> = {};
      if (form.isMockup) {
        metadata.is_mockup = true;
        metadata.estimated_revenue = form.mockupEstimatedRevenue;
        metadata.estimated_expense = form.mockupEstimatedExpense;
        metadata.initial_investment = form.mockupInitialInvestment;
        metadata.notes = form.mockupNotes;
      }

      // v1.5.8: wizard manuel akış — atomic payload
      // v1.6.0: defansif okumalar (eski draft → undefined arrays guard)
      const setupCostsPayload = (form.setupCostItems ?? [])
        .filter((it) => (it.name ?? "").trim() && parseMoneyInput(it.amount ?? "") > 0)
        .map((it) => ({
          name: it.name.trim(),
          amount: parseMoneyInput(it.amount),
        }));

      const monthlyFixedCostsPayload = (form.monthlyFixedCostItems ?? [])
        .filter((it) => it.applicable && parseMoneyInput(it.amount ?? "") > 0)
        .map((it) => ({
          category: it.category,
          name: it.category === "OTHER" ? (it.customName?.trim() || null) : null,
          amount: parseMoneyInput(it.amount),
          applicable: true,
        }));

      await api.post("/businesses", {
        name: form.name,
        description: form.description || null,
        // v1.6.1: tip seçimi kaldırıldı; backend business_type_name'den
        // find-or-create yapar. Boş string yerine null gönder (UUID parse hatası önler).
        business_type_id: form.businessTypeId || null,
        business_type_name: (form.businessTypeName ?? "").trim() || null,
        color: form.color,
        currency: form.currency,
        modules: form.modules,
        is_mockup: form.isMockup,
        metadata,
        include_setup_costs: form.includeSetupCosts,
        setup_costs: setupCostsPayload,
        monthly_fixed_costs: monthlyFixedCostsPayload,
      });

      localStorage.removeItem("bizboard_draft_business");
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Isletme olusturulamadi"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-surface-600 rounded-lg w-48" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-surface-600 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => (step > 1 ? setStep(step - 1) : router.back())}
          className="p-2 rounded-xl hover:bg-surface-600 transition-colors"
        >
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">
            {form.isMockup ? "Mock-up Isletme" : "Yeni Isletme"}
          </h1>
          <p className="text-sm text-surface-400">
            Adim {step}/{STEPS.length} — {STEPS[step - 1].label}
          </p>
        </div>
      </div>

      {/* Step Progress */}
      <div className="flex gap-1.5">
        {STEPS.map((s) => (
          <div
            key={s.id}
            className={cn(
              "flex-1 h-1.5 rounded-full transition-colors",
              s.id <= step ? "bg-brand-600" : "bg-surface-600"
            )}
          />
        ))}
      </div>

      {/* Mockup Toggle */}
      {step === 1 && (
        <button
          onClick={() =>
            setForm((prev) => ({ ...prev, isMockup: !prev.isMockup }))
          }
          className={cn(
            "w-full card p-4 flex items-center gap-3 transition-all",
            form.isMockup
              ? "border-2 border-amber-400 bg-amber-50"
              : "border-2 border-transparent hover:border-surface-600"
          )}
        >
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              form.isMockup ? "bg-amber-100" : "bg-surface-700"
            )}
          >
            <FlaskConical
              size={20}
              className={form.isMockup ? "text-amber-600" : "text-surface-400"}
            />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-white">
              Mock-up / Fizibilite Modu
            </p>
            <p className="text-xs text-surface-400">
              Yeni bir is fikri analiz et, gercek verilerle karistirma
            </p>
          </div>
          <div
            className={cn(
              "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors",
              form.isMockup
                ? "bg-amber-500 border-amber-500"
                : "border-surface-300"
            )}
          >
            {form.isMockup && <Check size={12} className="text-white" />}
          </div>
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Step Content */}
      {step === 1 && (
        <StepBusinessType
          businessTypeName={form.businessTypeName}
          onBusinessTypeNameChange={(v) =>
            setForm((prev) => ({ ...prev, businessTypeName: v }))
          }
          nameSuggestions={typeNameSuggestions}
        />
      )}
      {step === 2 && (
        <StepBasicInfo
          form={form}
          setForm={setForm}
          selectedType={selectedType}
        />
      )}
      {step === 3 && (
        <StepModules
          form={form}
          toggleModule={toggleModule}
          selectedType={selectedType}
        />
      )}
      {step === 4 && (
        <StepSetupCosts
          items={form.setupCostItems}
          currency={form.currency}
          onAdd={() =>
            setForm((prev) => ({
              ...prev,
              setupCostItems: [
                ...prev.setupCostItems,
                { id: makeId(), name: "", amount: "" },
              ],
            }))
          }
          onChange={(id, patch) =>
            setForm((prev) => ({
              ...prev,
              setupCostItems: prev.setupCostItems.map((it) =>
                it.id === id ? { ...it, ...patch } : it
              ),
            }))
          }
          onRemove={(id) =>
            setForm((prev) => ({
              ...prev,
              setupCostItems: prev.setupCostItems.filter((it) => it.id !== id),
            }))
          }
        />
      )}
      {step === 5 && (
        <StepMonthlyFixedCosts
          items={form.monthlyFixedCostItems}
          currency={form.currency}
          onChange={(idx, patch) =>
            setForm((prev) => ({
              ...prev,
              monthlyFixedCostItems: prev.monthlyFixedCostItems.map((it, i) =>
                i === idx ? { ...it, ...patch } : it
              ),
            }))
          }
        />
      )}
      {step === 6 && (
        <StepPreview
          form={form}
          selectedType={selectedType}
          defaultCosts={defaultCosts}
          defaultCostsLoading={defaultCostsLoading}
          onToggleSetupCosts={(checked) =>
            setForm((prev) => ({ ...prev, includeSetupCosts: checked }))
          }
        />
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        {step > 1 && (
          <button
            onClick={() => setStep(step - 1)}
            className="btn-secondary flex-1"
          >
            Geri
          </button>
        )}
        {step < STEPS.length ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canNext()}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            Devam
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              "Olusturuluyor..."
            ) : (
              <>
                {form.isMockup ? "Mock-up Olustur" : "Isletme Olustur"}
                <Check size={16} />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ===== STEP 1: Business Type Name (manuel + autocomplete) =====
// v1.6.1: Master tip kartlari kaldirildi — kullanici dogrudan ad yazar.
// Backend (BusinessService.resolveOrCreateBusinessType) bu adi alir,
// mevcut tip ile case-insensitive eslesirse onu kullanir, yoksa paylasilan
// "Diger" tipine baglar. Business.businessTypeName ile orijinal isim korunur.
function StepBusinessType({
  businessTypeName,
  onBusinessTypeNameChange,
  nameSuggestions,
}: {
  businessTypeName: string;
  onBusinessTypeNameChange: (v: string) => void;
  nameSuggestions: string[];
}) {
  const [open, setOpen] = useState(false);
  const filtered = useMemoFiltered(nameSuggestions, businessTypeName);

  return (
    <div className="space-y-4">
      <p className="text-sm text-surface-300 font-medium">
        Isletme tipini gir
      </p>
      <div className="card p-4 space-y-2 relative">
        <label className="label">Tip Adi *</label>
        <input
          type="text"
          value={businessTypeName}
          onChange={(e) => {
            onBusinessTypeNameChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="orn. Kafe, Insaat Sirketi, Servis Atolyesi"
          className="input"
          autoFocus
        />
        <p className="text-[10px] text-surface-400">
          Bu ad raporlama ve filtrelemede kullanilir. Daha once yazilan tipler
          autocomplete olarak gosterilir.
        </p>
        {open && filtered.length > 0 && (
          <div className="absolute z-20 left-4 right-4 top-[100%] mt-1 max-h-48 overflow-y-auto rounded-xl bg-surface-800 border border-surface-600 shadow-card-hover">
            {filtered.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onBusinessTypeNameChange(s);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-surface-200 hover:bg-surface-700"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Simple in-file memo helper for autocomplete filtering.
function useMemoFiltered(all: string[], query: string): string[] {
  const q = query.trim().toLocaleLowerCase("tr");
  if (!q) return all.slice(0, 10);
  return all.filter((s) => s.toLocaleLowerCase("tr").includes(q)).slice(0, 10);
}

// ===== STEP 2: Basic Info =====
function StepBasicInfo({
  form,
  setForm,
  selectedType,
}: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  selectedType?: BusinessType;
}) {
  const [revenueDisplay, setRevenueDisplay] = useState(form.mockupEstimatedRevenue ? formatMoneyInput(String(form.mockupEstimatedRevenue)) : "");
  const [expenseDisplay, setExpenseDisplay] = useState(form.mockupEstimatedExpense ? formatMoneyInput(String(form.mockupEstimatedExpense)) : "");
  const [investmentDisplay, setInvestmentDisplay] = useState(form.mockupInitialInvestment ? formatMoneyInput(String(form.mockupInitialInvestment)) : "");

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="label">Isletme Adi *</label>
        <input
          type="text"
          className="input"
          placeholder="Ornek: Yilmaz Insaat A.S."
          value={form.name}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, name: e.target.value }))
          }
        />
      </div>

      {/* Description */}
      <div>
        <label className="label">Aciklama</label>
        <textarea
          className="input min-h-[80px] resize-none"
          placeholder="Isletmeniz hakkinda kisa bir aciklama..."
          value={form.description}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, description: e.target.value }))
          }
        />
      </div>

      {/* Color Picker */}
      <div>
        <label className="label">Tema Rengi</label>
        <div className="flex flex-wrap gap-2">
          {colorPalette.map((c) => (
            <button
              key={c}
              onClick={() => setForm((prev) => ({ ...prev, color: c }))}
              className={cn(
                "w-9 h-9 rounded-xl transition-all",
                form.color === c
                  ? "ring-2 ring-offset-2 ring-surface-900 scale-110"
                  : "hover:scale-110"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Currency */}
      <div>
        <label className="label">Para Birimi</label>
        <select
          className="input"
          value={form.currency}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, currency: e.target.value }))
          }
        >
          <option value="TRY">Turk Lirasi (TRY)</option>
          <option value="USD">ABD Dolari (USD)</option>
          <option value="EUR">Euro (EUR)</option>
          <option value="GBP">Ingiliz Sterlini (GBP)</option>
        </select>
      </div>

      {/* Mockup Analysis Fields */}
      {form.isMockup && (
        <div className="space-y-4 pt-4 border-t border-surface-600">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={18} className="text-amber-500" />
            <p className="text-sm font-semibold text-white">
              Fizibilite Analizi
            </p>
          </div>

          <div>
            <label className="label">Tahmini Aylik Gelir</label>
            <input
              type="text"
              inputMode="numeric"
              className="input"
              placeholder="0"
              value={revenueDisplay}
              onChange={(e) => {
                const display = formatMoneyInput(e.target.value);
                setRevenueDisplay(display);
                setForm((prev) => ({ ...prev, mockupEstimatedRevenue: parseMoneyInput(display) }));
              }}
            />
          </div>

          <div>
            <label className="label">Tahmini Aylik Gider</label>
            <input
              type="text"
              inputMode="numeric"
              className="input"
              placeholder="0"
              value={expenseDisplay}
              onChange={(e) => {
                const display = formatMoneyInput(e.target.value);
                setExpenseDisplay(display);
                setForm((prev) => ({ ...prev, mockupEstimatedExpense: parseMoneyInput(display) }));
              }}
            />
          </div>

          <div>
            <label className="label">Baslangic Yatirimi</label>
            <input
              type="text"
              inputMode="numeric"
              className="input"
              placeholder="0"
              value={investmentDisplay}
              onChange={(e) => {
                const display = formatMoneyInput(e.target.value);
                setInvestmentDisplay(display);
                setForm((prev) => ({ ...prev, mockupInitialInvestment: parseMoneyInput(display) }));
              }}
            />
          </div>

          <div>
            <label className="label">Notlar / Planlar</label>
            <textarea
              className="input min-h-[80px] resize-none"
              placeholder="Bu is fikri hakkindaki dusunceleriniz..."
              value={form.mockupNotes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, mockupNotes: e.target.value }))
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ===== STEP 3: Modules =====
function StepModules({
  form,
  toggleModule,
  selectedType,
}: {
  form: FormData;
  toggleModule: (mod: string) => void;
  selectedType?: BusinessType;
}) {
  const allModules: ModuleType[] = [
    "finance",
    "inventory",
    "staff",
    "projects",
    "documents",
    "reservations",
    "vehicles",
    "menu",
    "crm",
  ];

  const defaults = selectedType?.default_modules || [];

  return (
    <div className="space-y-3">
      <p className="text-sm text-surface-300 font-medium">
        Kullanmak istediginiz modulleri secin
      </p>
      <div className="space-y-2">
        {allModules.map((mod) => {
          const Icon = moduleIconMap[mod] || LayoutGrid;
          const isActive = form.modules.includes(mod);
          const isDefault = defaults.includes(mod);

          return (
            <button
              key={mod}
              onClick={() => toggleModule(mod)}
              className={cn(
                "w-full card p-3.5 flex items-center gap-3 transition-all",
                isActive
                  ? "ring-2 ring-brand-600 bg-brand-50"
                  : "hover:bg-surface-700"
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  isActive ? "bg-brand-100" : "bg-surface-700"
                )}
              >
                <Icon
                  size={20}
                  className={
                    isActive ? "text-brand-600" : "text-surface-400"
                  }
                />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold text-white">
                  {moduleLabelMap[mod] || mod}
                </p>
                {isDefault && (
                  <p className="text-xs text-surface-400">Onerilen</p>
                )}
              </div>
              <div
                className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors",
                  isActive
                    ? "bg-brand-600 border-brand-600"
                    : "border-surface-300"
                )}
              >
                {isActive && <Check size={12} className="text-white" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===== STEP 4: Preview =====
function StepPreview({
  form,
  selectedType,
  defaultCosts,
  defaultCostsLoading,
  onToggleSetupCosts,
}: {
  form: FormData;
  selectedType?: BusinessType;
  defaultCosts: BusinessTypeDefaultCost[];
  defaultCostsLoading: boolean;
  onToggleSetupCosts: (checked: boolean) => void;
}) {
  // v1.5.6: setup ve recurring kalemlerin toplam tutarları
  const setupItems = defaultCosts.filter((c) => c.is_setup);
  const recurringItems = defaultCosts.filter((c) => !c.is_setup);
  const setupTotal = setupItems.reduce((s, c) => s + (c.amount || 0), 0);
  const recurringTotal = recurringItems.reduce((s, c) => s + (c.amount || 0), 0);
  const Icon = selectedType
    ? categoryIconMap[selectedType.icon] || LayoutGrid
    : LayoutGrid;
  const color = form.color || selectedType?.color || "#4c6ef5";

  const estimatedProfit =
    form.mockupEstimatedRevenue - form.mockupEstimatedExpense;
  const roiMonths =
    form.mockupInitialInvestment > 0 && estimatedProfit > 0
      ? Math.ceil(form.mockupInitialInvestment / estimatedProfit)
      : null;

  return (
    <div className="space-y-4">
      {/* Business Card Preview */}
      <div className="card p-5">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: `${color}15` }}
          >
            <Icon size={28} style={{ color }} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">
                {form.name || "Isimsiz Isletme"}
              </h2>
              {form.isMockup && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                  Mock-up
                </span>
              )}
            </div>
            <p className="text-sm text-surface-400">
              {selectedType?.label || "Tip secilmedi"}
            </p>
          </div>
        </div>
        {form.description && (
          <p className="text-sm text-surface-300 mt-3 leading-relaxed">
            {form.description}
          </p>
        )}
      </div>

      {/* Selected Modules */}
      <div className="card p-4">
        <p className="text-xs text-surface-400 font-medium uppercase tracking-wide mb-3">
          Aktif Moduller
        </p>
        <div className="flex flex-wrap gap-2">
          {form.modules.map((mod) => {
            const ModIcon = moduleIconMap[mod] || LayoutGrid;
            return (
              <span
                key={mod}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-medium"
              >
                <ModIcon size={14} />
                {moduleLabelMap[mod] || mod}
              </span>
            );
          })}
        </div>
      </div>

      {/* Default Categories Preview */}
      {selectedType?.default_categories &&
        selectedType.default_categories.length > 0 && (
          <div className="card p-4">
            <p className="text-xs text-surface-400 font-medium uppercase tracking-wide mb-3">
              Varsayilan Kategoriler
            </p>
            <div className="space-y-2">
              {selectedType.default_categories.map((cat, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      (cat.direction || cat.type) === "income"
                        ? "bg-green-500"
                        : "bg-red-500"
                    )}
                  />
                  <span className="text-surface-200">{cat.name}</span>
                  <span className="text-xs text-surface-400">
                    {(cat.direction || cat.type) === "income"
                      ? "Gelir"
                      : "Gider"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* v1.5.8: Wizard adim 4-5 ozet */}
      {(form.setupCostItems.length > 0 || form.monthlyFixedCostItems.some((it) => it.applicable && parseMoneyInput(it.amount) > 0)) && (
        <div className="card p-4 space-y-4">
          <p className="text-xs text-surface-400 font-medium uppercase tracking-wide">
            Atomic Olusturulacak Kalemler
          </p>

          {form.setupCostItems.filter((it) => it.name.trim() && parseMoneyInput(it.amount) > 0).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] uppercase tracking-wide text-surface-400">
                  Kurulus tx&apos;leri
                </p>
                <p className="text-xs font-semibold text-red-400">
                  {formatCurrency(
                    form.setupCostItems.reduce(
                      (s, it) => s + parseMoneyInput(it.amount), 0
                    ),
                    form.currency
                  )}
                </p>
              </div>
              <div className="space-y-1">
                {form.setupCostItems
                  .filter((it) => it.name.trim() && parseMoneyInput(it.amount) > 0)
                  .map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center justify-between text-xs bg-red-500/10 px-2 py-1.5 rounded"
                    >
                      <span className="text-surface-200 truncate">{it.name}</span>
                      <span className="text-surface-300 font-medium">
                        {formatCurrency(parseMoneyInput(it.amount), form.currency)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {form.monthlyFixedCostItems.filter((it) => it.applicable && parseMoneyInput(it.amount) > 0).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] uppercase tracking-wide text-surface-400">
                  Aylik sabit gider
                </p>
                <p className="text-xs font-semibold text-amber-400">
                  {formatCurrency(
                    form.monthlyFixedCostItems
                      .filter((it) => it.applicable)
                      .reduce((s, it) => s + parseMoneyInput(it.amount), 0),
                    form.currency
                  )} / ay
                </p>
              </div>
              <div className="space-y-1">
                {form.monthlyFixedCostItems
                  .filter((it) => it.applicable && parseMoneyInput(it.amount) > 0)
                  .map((it) => (
                    <div
                      key={it.category}
                      className="flex items-center justify-between text-xs bg-amber-500/10 px-2 py-1.5 rounded"
                    >
                      <span className="text-surface-200 truncate">
                        {it.category === "OTHER"
                          ? (it.customName?.trim() || it.label)
                          : it.label}
                      </span>
                      <span className="text-surface-300 font-medium">
                        {formatCurrency(parseMoneyInput(it.amount), form.currency)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-surface-500 pt-2 border-t border-surface-700">
            Bu kalemler isletme olusturma akisina <strong>atomic</strong> olarak dahildir —
            biri patlarsa hicbir kayit olusturulmaz.
          </p>
        </div>
      )}

      {/* v1.5.6: Kurulum Maliyetleri */}
      {(defaultCostsLoading || defaultCosts.length > 0) && (
        <div className="card p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.includeSetupCosts}
              onChange={(e) => onToggleSetupCosts(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-brand-600"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">
                Kurulum maliyetlerini ekle
              </p>
              <p className="text-xs text-surface-400 mt-0.5">
                Bu isletme tipi icin tanimli varsayilan giderler otomatik olusturulur:
                tek seferlik kalemler {`->`}{" "}<strong>kurulum islemi (Transaction)</strong>;
                aylik kalemler {`->`}{" "}<strong>sabit gider (FixedCost)</strong> olarak yazilir.
              </p>
            </div>
          </label>

          {defaultCostsLoading ? (
            <p className="mt-3 text-xs text-surface-500">
              Sablonlar yukleniyor...
            </p>
          ) : (
            <>
              {setupItems.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-wide text-surface-400">
                      Tek seferlik (kurulum)
                    </p>
                    <p className="text-xs font-semibold text-red-400">
                      {formatCurrency(setupTotal, form.currency)}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {setupItems.map((c) => (
                      <div
                        key={c.id}
                        className={cn(
                          "flex items-center justify-between text-xs px-2 py-1.5 rounded",
                          form.includeSetupCosts
                            ? "bg-red-500/10"
                            : "bg-surface-700/30 opacity-60"
                        )}
                      >
                        <div>
                          <span className="text-surface-200">{c.name}</span>
                          <span className="text-[10px] text-surface-500 ml-2">
                            {c.category}
                          </span>
                        </div>
                        <span className="text-surface-300 font-medium">
                          {formatCurrency(c.amount, c.currency || form.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {recurringItems.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-wide text-surface-400">
                      Aylik (sabit gider)
                    </p>
                    <p className="text-xs font-semibold text-amber-400">
                      {formatCurrency(recurringTotal, form.currency)} / ay
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {recurringItems.map((c) => (
                      <div
                        key={c.id}
                        className={cn(
                          "flex items-center justify-between text-xs px-2 py-1.5 rounded",
                          form.includeSetupCosts
                            ? "bg-amber-500/10"
                            : "bg-surface-700/30 opacity-60"
                        )}
                      >
                        <div>
                          <span className="text-surface-200">{c.name}</span>
                          <span className="text-[10px] text-surface-500 ml-2">
                            {c.category} · {c.frequency}
                          </span>
                        </div>
                        <span className="text-surface-300 font-medium">
                          {formatCurrency(c.amount, c.currency || form.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {setupItems.length === 0 && recurringItems.length === 0 && (
                <p className="mt-3 text-xs text-surface-500">
                  Bu tip icin tanimli kurulum sablonu yok. Admin paneli uzerinden
                  eklenebilir.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Mockup Analysis Preview */}
      {form.isMockup && (
        <div className="card p-5 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200">
          <div className="flex items-center gap-2 mb-4">
            <Calculator size={18} className="text-amber-600" />
            <p className="text-sm font-bold text-white">
              Fizibilite Ozeti
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-surface-400">Tahmini Aylik Gelir</p>
              <p className="text-lg font-bold text-green-600 mt-0.5">
                {formatCurrency(form.mockupEstimatedRevenue, form.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-surface-400">Tahmini Aylik Gider</p>
              <p className="text-lg font-bold text-red-600 mt-0.5">
                {formatCurrency(form.mockupEstimatedExpense, form.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-surface-400">Tahmini Net Kar</p>
              <p
                className={cn(
                  "text-lg font-bold mt-0.5",
                  estimatedProfit >= 0 ? "text-brand-600" : "text-red-600"
                )}
              >
                {formatCurrency(estimatedProfit, form.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-surface-400">Baslangic Yatirimi</p>
              <p className="text-lg font-bold text-surface-200 mt-0.5">
                {formatCurrency(form.mockupInitialInvestment, form.currency)}
              </p>
            </div>
          </div>

          {/* ROI Calculation */}
          {roiMonths !== null && (
            <div className="mt-4 pt-4 border-t border-amber-200">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-600" />
                <p className="text-sm text-surface-200">
                  Tahmini geri donus suresi:{" "}
                  <span className="font-bold text-white">
                    {roiMonths} ay
                  </span>
                </p>
              </div>
              {roiMonths <= 6 && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <TrendingUp size={12} />
                  Hizli geri donus — iyi bir yatirim firsati olabilir
                </p>
              )}
              {roiMonths > 6 && roiMonths <= 18 && (
                <p className="text-xs text-amber-600 mt-1">
                  Orta vadeli geri donus — detayli planlama onerilir
                </p>
              )}
              {roiMonths > 18 && (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <TrendingDown size={12} />
                  Uzun vadeli geri donus — risk analizi yapmaniz onerilir
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          {form.mockupNotes && (
            <div className="mt-4 pt-4 border-t border-amber-200">
              <p className="text-xs text-surface-400 mb-1">Notlar</p>
              <p className="text-sm text-surface-200 leading-relaxed">
                {form.mockupNotes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="card p-4 bg-surface-700">
        <p className="text-xs text-surface-400">
          <Building2
            size={14}
            className="inline-block mr-1 -mt-0.5 text-surface-400"
          />
          {form.isMockup
            ? "Bu isletme mock-up olarak olusturulacak ve gercek verilerinizle karistirilmayacaktir. Dashboard'da ayri bir etiket ile gorunecektir."
            : "Isletmeniz varsayilan kategoriler ve sectiginiz moduller ile olusturulacaktir. Daha sonra ayarlardan duzenleyebilirsiniz."}
        </p>
      </div>
    </div>
  );
}

// ===== STEP 4: Kurulus Maliyetleri (manuel serbest liste) =====
function StepSetupCosts({
  items, currency, onAdd, onChange, onRemove,
}: {
  items: SetupCostItem[];
  currency: string;
  onAdd: () => void;
  onChange: (id: string, patch: Partial<SetupCostItem>) => void;
  onRemove: (id: string) => void;
}) {
  const total = items.reduce((s, it) => s + parseMoneyInput(it.amount), 0);
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-surface-300 font-medium">
          Kurulus / acilis maliyetleri
        </p>
        <p className="text-xs text-surface-400 mt-1">
          Bu isletmeyi kurmak icin tek seferlik harcamalar. Her kalem ayri bir
          transaction olarak yazilir ve raporda &quot;kurulum&quot; olarak isaretlenir.
          Bu adim opsiyonel — sonradan da eklenebilir.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-surface-400 mb-3">
            Henuz kalem yok
          </p>
          <button
            onClick={onAdd}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus size={16} />
            Ilk kalemi ekle
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="card p-3 flex gap-2 items-start">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={it.name}
                  onChange={(e) => onChange(it.id, { name: e.target.value })}
                  placeholder="orn. Depozit, Tabela"
                  className="input"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={it.amount}
                  onChange={(e) =>
                    onChange(it.id, { amount: formatMoneyInput(e.target.value) })
                  }
                  placeholder={`Tutar (${currency})`}
                  className="input text-right"
                />
              </div>
              <button
                onClick={() => onRemove(it.id)}
                className="p-2 rounded-lg hover:bg-red-500/10 text-surface-400 hover:text-red-400 shrink-0"
                title="Sil"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            onClick={onAdd}
            className="w-full card p-3 border-2 border-dashed border-surface-600 hover:border-brand-400 text-sm text-surface-300 hover:text-brand-400 inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Plus size={16} />
            Yeni kalem
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="card p-3 flex items-center justify-between bg-surface-700/50">
          <p className="text-sm text-surface-300">Toplam kurulum</p>
          <p className="text-lg font-bold text-red-400">
            {formatCurrency(total, currency)}
          </p>
        </div>
      )}
    </div>
  );
}

// ===== STEP 5: Aylik Sabit Masraf (12 kategori + Gecerli degil toggle) =====
function StepMonthlyFixedCosts({
  items, currency, onChange,
}: {
  items: MonthlyFixedCostItem[];
  currency: string;
  onChange: (idx: number, patch: Partial<MonthlyFixedCostItem>) => void;
}) {
  const monthlyTotal = items
    .filter((it) => it.applicable)
    .reduce((s, it) => s + parseMoneyInput(it.amount), 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-surface-300 font-medium">
          Aylik sabit masraflar
        </p>
        <p className="text-xs text-surface-400 mt-1">
          Her ay duzenli olarak odenen giderler. Uygulanmayanlar icin
          &quot;Gecerli degil&quot; togglesini kullan — o kategori bu isletmede
          olusturulmaz.
        </p>
      </div>

      <div className="space-y-2">
        {items.map((it, idx) => {
          const disabled = !it.applicable;
          return (
            <div
              key={it.category}
              className={cn(
                "card p-3 transition-opacity",
                disabled && "opacity-50"
              )}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">
                    {it.label}
                  </p>
                  {it.required && (
                    <p className="text-[10px] text-surface-400">Zorunlu</p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-[11px] text-surface-300 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={!it.applicable}
                    onChange={(e) => onChange(idx, { applicable: !e.target.checked })}
                    className="w-3.5 h-3.5 rounded accent-amber-500"
                  />
                  <span>Gecerli degil</span>
                </label>
              </div>
              {it.category === "OTHER" && it.applicable && (
                <input
                  type="text"
                  value={it.customName || ""}
                  onChange={(e) => onChange(idx, { customName: e.target.value })}
                  placeholder="Kategori adi (orn. Lisans bedelleri)"
                  className="input text-sm mb-2"
                />
              )}
              <input
                type="text"
                inputMode="decimal"
                value={it.amount}
                disabled={disabled}
                onChange={(e) =>
                  onChange(idx, { amount: formatMoneyInput(e.target.value) })
                }
                placeholder={`Aylik tutar (${currency})`}
                className="input text-right disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          );
        })}
      </div>

      <div className="card p-3 flex items-center justify-between bg-surface-700/50">
        <p className="text-sm text-surface-300">Aylik toplam</p>
        <p className="text-lg font-bold text-amber-400">
          {formatCurrency(monthlyTotal, currency)} / ay
        </p>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
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
  Sunrise,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api/client";
import { cn, formatCurrency, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonBlock } from "@/components/shared/Skeleton";
import type { BusinessType, ModuleType } from "@/types";

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
  day_cycle: Sunrise,
};

const moduleLabelMap: Record<string, string> = {
  finance: "Finans",
  inventory: "Envanter",
  staff: "Personel",
  projects: "Projeler",
  documents: "Belgeler",
  reservations: "Rezervasyonlar",
  vehicles: "Araçlar",
  menu: "Menü",
  crm: "Müşteriler",
  day_cycle: "Gün Açılış/Kapanış Takibi",
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
  /** v1.6.2: serbest metin tipi adı (eski businessTypeId + includeSetupCosts kaldırıldı) */
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
  /** v1.5.8: yeni wizard akışı — manuel kuruluş kalemleri */
  setupCostItems: SetupCostItem[];
  /** v1.5.8: yeni wizard akışı — aylık sabit masraflar (12 kategori) */
  monthlyFixedCostItems: MonthlyFixedCostItem[];
}

// v1.6.2.1: Tip Secimi adımı kaldırıldı (master BusinessType tablosu yok artık).
const STEPS = [
  { id: 1, label: "Temel Bilgiler" },
  { id: 2, label: "Modüller" },
  { id: 3, label: "Kuruluş" },
  { id: 4, label: "Aylık Gider" },
  { id: 5, label: "Önizleme" },
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
  // v1.6.2: business types master listesi kaldırıldı.
  const [isLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    name: "",
    description: "",
    businessTypeName: "",
    color: "",
    currency: "TRY",
    modules: [],
    isMockup: false,
    mockupEstimatedRevenue: 0,
    mockupEstimatedExpense: 0,
    mockupInitialInvestment: 0,
    mockupNotes: "",
    setupCostItems: [],
    monthlyFixedCostItems: [],
  });

  // v1.6.2.1: autocomplete (typeNameSuggestions) kaldırıldı — Tip Secimi adımı yok.
  // monthlyFixedCostItems init'i için kategori fetch'i hala gerekli.
  const [, setFixedCostCategories] = useState<FixedCostCategoryMeta[]>([]);

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
    if (form.name || form.businessTypeName) {
      localStorage.setItem("bizboard_draft_business", JSON.stringify(form));
    }
  }, [form]);

  // v1.6.2: master tip default cost şablonu fetch'i kaldırıldı — manuel akış.

  // v1.6.2.1: business-types/names fetch'i kaldırıldı (endpoint silindi).
  // 12 kategori mount'ta tek seferlik fetch.
  useEffect(() => {
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
  // v1.6.2: businessTypeId, selectType, selectedType, businessTypes kaldırıldı —
  // master tablo silindi, kullanıcı serbest metin girer.
  const selectedType: undefined = undefined;

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
    // v1.6.2.1: Tip Secimi adımı kaldırıldı. Adımlar 1 indeks geriye kaydı.
    switch (step) {
      case 1:
        return (form.name ?? "").trim().length >= 2;
      case 2:
        return (form.modules ?? []).length > 0;
      case 3: {
        // Kuruluş maliyetleri opsiyonel — boş bırakılabilir; ama dolu olanlar valid olmalı
        const items = form.setupCostItems ?? [];
        return items.every(
          (it) => !(it.name ?? "").trim() || parseMoneyInput(it.amount ?? "") >= 0
        );
      }
      case 4: {
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
        // v1.6.2: business_type_id ve include_setup_costs kaldırıldı (master tablo silindi).
        business_type_name: (form.businessTypeName ?? "").trim(),
        color: form.color,
        currency: form.currency,
        modules: form.modules,
        is_mockup: form.isMockup,
        metadata,
        setup_costs: setupCostsPayload,
        monthly_fixed_costs: monthlyFixedCostsPayload,
      });

      localStorage.removeItem("bizboard_draft_business");
      toast.success("İşletme oluşturuldu");
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "İşletme oluşturulamadı"));
      toast.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonBlock className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <PageHeader
        title={form.isMockup ? "Mock-up İşletme" : "Yeni İşletme"}
        subtitle={`Adım ${step}/${STEPS.length} — ${STEPS[step - 1].label}`}
        onBack={() => (step > 1 ? setStep(step - 1) : router.back())}
        fallbackHref="/dashboard"
      />

      {/* Step Progress */}
      <div className="flex gap-1.5">
        {STEPS.map((s) => (
          <div
            key={s.id}
            className={cn(
              "flex-1 h-1.5 rounded-full transition-colors",
              s.id <= step ? "bg-accent" : "bg-[rgb(var(--v2-sunken))]"
            )}
          />
        ))}
      </div>

      {/* Mockup Toggle — v1.6.2.1: yeni Step 1 (Temel Bilgiler) ile birlikte. */}
      {step === 1 && (
        <button
          onClick={() =>
            setForm((prev) => ({ ...prev, isMockup: !prev.isMockup }))
          }
          className={cn(
            "w-full v2-card p-4 flex items-center gap-3 transition-all",
            form.isMockup
              ? "border-2 border-amber-400 bg-amber-500/15"
              : "border-2 border-transparent hover:border-[rgb(var(--v2-border))]"
          )}
        >
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              form.isMockup ? "bg-amber-500/20" : "bg-[rgb(var(--v2-sunken))]"
            )}
          >
            <FlaskConical
              size={20}
              className={form.isMockup ? "text-amber-300" : "text-[rgb(var(--v2-muted))]"}
            />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-[rgb(var(--v2-ink))]">
              Mock-up / Fizibilite Modu
            </p>
            <p className="text-xs text-[rgb(var(--v2-muted))]">
              Yeni bir iş fikri analiz et, gerçek verilerle karıştırma
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
            {form.isMockup && <Check size={12} className="text-[rgb(var(--v2-card))]" />}
          </div>
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/15 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Step Content — v1.6.2.1: Tip Secimi adımı kaldırıldı, indeksler 1 geriye. */}
      {step === 1 && (
        <StepBasicInfo
          form={form}
          setForm={setForm}
          selectedType={selectedType}
        />
      )}
      {step === 2 && (
        <StepModules
          form={form}
          toggleModule={toggleModule}
          selectedType={selectedType}
        />
      )}
      {step === 3 && (
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
      {step === 4 && (
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
      {step === 5 && (
        <StepPreview form={form} selectedType={selectedType} />
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
              "Oluşturuluyor..."
            ) : (
              <>
                {form.isMockup ? "Mock-up Oluştur" : "İşletme Oluştur"}
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
      <p className="text-sm text-[rgb(var(--v2-muted))] font-medium">
        İşletme tipini gir
      </p>
      <div className="v2-card p-4 space-y-2 relative">
        <label className="label">Tip Adı *</label>
        <input
          type="text"
          value={businessTypeName}
          onChange={(e) => {
            onBusinessTypeNameChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="örn. Kafe, İnşaat Şirketi, Servis Atölyesi"
          className="input"
          autoFocus
        />
        <p className="text-[10px] text-[rgb(var(--v2-muted))]">
          Bu ad raporlama ve filtrelemede kullanılır. Daha önce yazılan tipler
          autocomplete olarak gösterilir.
        </p>
        {open && filtered.length > 0 && (
          <div className="absolute z-20 left-4 right-4 top-[100%] mt-1 max-h-48 overflow-y-auto rounded-xl bg-[rgb(var(--v2-card))] border border-[rgb(var(--v2-border))] shadow-card-hover">
            {filtered.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onBusinessTypeNameChange(s);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-[rgb(var(--v2-ink))] hover:bg-[rgb(var(--v2-sunken))]"
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
        <label className="label">İşletme Adı *</label>
        <input
          type="text"
          className="input"
          placeholder="Örnek: Yılmaz İnşaat A.Ş."
          value={form.name}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, name: e.target.value }))
          }
        />
      </div>

      {/* Description */}
      <div>
        <label className="label">Açıklama</label>
        <textarea
          className="input min-h-[80px] resize-none"
          placeholder="İşletmeniz hakkında kısa bir açıklama..."
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
        <DarkSelect
          value={form.currency}
          onChange={(v) => setForm((prev) => ({ ...prev, currency: v }))}
          options={[
            { value: "TRY", label: "Türk Lirası (TRY)" },
            { value: "USD", label: "ABD Doları (USD)" },
            { value: "EUR", label: "Euro (EUR)" },
            { value: "GBP", label: "İngiliz Sterlini (GBP)" },
          ]}
        />
      </div>

      {/* Mockup Analysis Fields */}
      {form.isMockup && (
        <div className="space-y-4 pt-4 border-t border-[rgb(var(--v2-border))]">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={18} className="text-amber-500" />
            <p className="text-sm font-semibold text-[rgb(var(--v2-ink))]">
              Fizibilite Analizi
            </p>
          </div>

          <div>
            <label className="label">Tahmini Aylık Gelir</label>
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
            <label className="label">Tahmini Aylık Gider</label>
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
            <label className="label">Başlangıç Yatırımı</label>
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
              placeholder="Bu iş fikri hakkındaki düşünceleriniz..."
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
    // Per-işletme yetenek: seçilirse o işletmede gün açılış/kapanış takibi +
    // işlem-giriş enforcement (gün açık değilse işlem reddedilir) devreye girer.
    "day_cycle",
  ];

  // v1.6.2: selectedType.default_modules kaldırıldı — wizard'ın "varsayılan" rozet
  // göstergesi de boş kalsın; kullanıcı her modülü manuel seçer.
  const defaults: string[] = [];

  return (
    <div className="space-y-3">
      <p className="text-sm text-[rgb(var(--v2-muted))] font-medium">
        Kullanmak istediğiniz modülleri seçin
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
                "w-full v2-card p-3.5 flex items-center gap-3 transition-all",
                isActive
                  ? "ring-2 ring-accent bg-accent/15"
                  : "hover:bg-[rgb(var(--v2-sunken))]"
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  isActive ? "bg-accent/20" : "bg-[rgb(var(--v2-sunken))]"
                )}
              >
                <Icon
                  size={20}
                  className={
                    isActive ? "text-accent" : "text-[rgb(var(--v2-muted))]"
                  }
                />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold text-[rgb(var(--v2-ink))]">
                  {moduleLabelMap[mod] || mod}
                </p>
                {isDefault && (
                  <p className="text-xs text-[rgb(var(--v2-muted))]">Önerilen</p>
                )}
              </div>
              <div
                className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors",
                  isActive
                    ? "bg-accent border-accent"
                    : "border-[rgb(var(--v2-muted))]"
                )}
              >
                {isActive && <Check size={12} className="text-[rgb(var(--v2-card))]" />}
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
}: {
  form: FormData;
  selectedType?: BusinessType;
}) {
  // v1.6.2: master tip + defaultCosts kaldırıldı; default ikon/renk.
  const Icon = LayoutGrid;
  const color = form.color || "#4c6ef5";

  const estimatedProfit =
    form.mockupEstimatedRevenue - form.mockupEstimatedExpense;
  const roiMonths =
    form.mockupInitialInvestment > 0 && estimatedProfit > 0
      ? Math.ceil(form.mockupInitialInvestment / estimatedProfit)
      : null;

  return (
    <div className="space-y-4">
      {/* Business Card Preview */}
      <div className="v2-card p-5">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: `${color}15` }}
          >
            <Icon size={28} style={{ color }} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[rgb(var(--v2-ink))]">
                {form.name || "İsimsiz İşletme"}
              </h2>
              {form.isMockup && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-medium">
                  Mock-up
                </span>
              )}
            </div>
            <p className="text-sm text-[rgb(var(--v2-muted))]">
              {selectedType?.label || "Tip seçilmedi"}
            </p>
          </div>
        </div>
        {form.description && (
          <p className="text-sm text-[rgb(var(--v2-muted))] mt-3 leading-relaxed">
            {form.description}
          </p>
        )}
      </div>

      {/* Selected Modules */}
      <div className="v2-card p-4">
        <p className="text-xs text-[rgb(var(--v2-muted))] font-medium uppercase tracking-wide mb-3">
          Aktif Modüller
        </p>
        <div className="flex flex-wrap gap-2">
          {form.modules.map((mod) => {
            const ModIcon = moduleIconMap[mod] || LayoutGrid;
            return (
              <span
                key={mod}
                className="v2-chip-accent inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              >
                <ModIcon size={14} />
                {moduleLabelMap[mod] || mod}
              </span>
            );
          })}
        </div>
      </div>

      {/* v1.6.2: master tip kaldırıldı — default_categories preview yok. */}

      {/* v1.5.8: Wizard adim 4-5 ozet */}
      {(form.setupCostItems.length > 0 || form.monthlyFixedCostItems.some((it) => it.applicable && parseMoneyInput(it.amount) > 0)) && (
        <div className="v2-card p-4 space-y-4">
          <p className="text-xs text-[rgb(var(--v2-muted))] font-medium uppercase tracking-wide">
            Atomic Oluşturulacak Kalemler
          </p>

          {form.setupCostItems.filter((it) => it.name.trim() && parseMoneyInput(it.amount) > 0).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] uppercase tracking-wide text-[rgb(var(--v2-muted))]">
                  Kuruluş tx&apos;leri
                </p>
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">
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
                      <span className="text-[rgb(var(--v2-ink))] truncate">{it.name}</span>
                      <span className="text-[rgb(var(--v2-muted))] font-medium">
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
                <p className="text-[11px] uppercase tracking-wide text-[rgb(var(--v2-muted))]">
                  Aylık sabit gider
                </p>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
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
                      <span className="text-[rgb(var(--v2-ink))] truncate">
                        {it.category === "OTHER"
                          ? (it.customName?.trim() || it.label)
                          : it.label}
                      </span>
                      <span className="text-[rgb(var(--v2-muted))] font-medium">
                        {formatCurrency(parseMoneyInput(it.amount), form.currency)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-[rgb(var(--v2-muted))] pt-2 border-t border-[rgb(var(--v2-border))]">
            Bu kalemler işletme oluşturma akışına <strong>atomic</strong> olarak dahildir —
            biri patlarsa hiçbir kayıt oluşturulmaz.
          </p>
        </div>
      )}

      {/* v1.6.2: master tip default cost şablonu önizleme kartı kaldırıldı. */}

      {/* Mockup Analysis Preview */}
      {form.isMockup && (
        <div className="v2-card p-5 bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30">
          <div className="flex items-center gap-2 mb-4">
            <Calculator size={18} className="text-amber-700 dark:text-amber-300" />
            <p className="text-sm font-bold text-[rgb(var(--v2-ink))]">
              Fizibilite Özeti
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-[rgb(var(--v2-muted))]">Tahmini Aylık Gelir</p>
              <p className="text-lg font-bold text-green-700 dark:text-green-300 mt-0.5">
                {formatCurrency(form.mockupEstimatedRevenue, form.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[rgb(var(--v2-muted))]">Tahmini Aylık Gider</p>
              <p className="text-lg font-bold text-red-700 dark:text-red-300 mt-0.5">
                {formatCurrency(form.mockupEstimatedExpense, form.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[rgb(var(--v2-muted))]">Tahmini Net Kâr</p>
              <p
                className={cn(
                  "text-lg font-bold mt-0.5",
                  estimatedProfit >= 0 ? "text-accent" : "text-red-700 dark:text-red-300"
                )}
              >
                {formatCurrency(estimatedProfit, form.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[rgb(var(--v2-muted))]">Başlangıç Yatırımı</p>
              <p className="text-lg font-bold text-[rgb(var(--v2-ink))] mt-0.5">
                {formatCurrency(form.mockupInitialInvestment, form.currency)}
              </p>
            </div>
          </div>

          {/* ROI Calculation */}
          {roiMonths !== null && (
            <div className="mt-4 pt-4 border-t border-amber-500/30">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-700 dark:text-amber-300" />
                <p className="text-sm text-[rgb(var(--v2-ink))]">
                  Tahmini geri dönüş süresi:{" "}
                  <span className="font-bold text-[rgb(var(--v2-ink))]">
                    {roiMonths} ay
                  </span>
                </p>
              </div>
              {roiMonths <= 6 && (
                <p className="text-xs text-green-700 dark:text-green-300 mt-1 flex items-center gap-1">
                  <TrendingUp size={12} />
                  Hızlı geri dönüş — iyi bir yatırım fırsatı olabilir
                </p>
              )}
              {roiMonths > 6 && roiMonths <= 18 && (
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  Orta vadeli geri dönüş — detaylı planlama önerilir
                </p>
              )}
              {roiMonths > 18 && (
                <p className="text-xs text-red-700 dark:text-red-300 mt-1 flex items-center gap-1">
                  <TrendingDown size={12} />
                  Uzun vadeli geri dönüş — risk analizi yapmanız önerilir
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          {form.mockupNotes && (
            <div className="mt-4 pt-4 border-t border-amber-500/30">
              <p className="text-xs text-[rgb(var(--v2-muted))] mb-1">Notlar</p>
              <p className="text-sm text-[rgb(var(--v2-ink))] leading-relaxed">
                {form.mockupNotes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="v2-card p-4 bg-[rgb(var(--v2-sunken))]">
        <p className="text-xs text-[rgb(var(--v2-muted))]">
          <Building2
            size={14}
            className="inline-block mr-1 -mt-0.5 text-surface-400"
          />
          {form.isMockup
            ? "Bu işletme mock-up olarak oluşturulacak ve gerçek verilerinizle karıştırılmayacaktır. Dashboard'da ayrı bir etiket ile görünecektir."
            : "İşletmeniz varsayılan kategoriler ve seçtiğiniz modüller ile oluşturulacaktır. Daha sonra ayarlardan düzenleyebilirsiniz."}
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
        <p className="text-sm text-[rgb(var(--v2-muted))] font-medium">
          Kuruluş / açılış maliyetleri
        </p>
        <p className="text-xs text-[rgb(var(--v2-muted))] mt-1">
          Bu işletmeyi kurmak için tek seferlik harcamalar. Her kalem ayrı bir
          transaction olarak yazılır ve raporda &quot;kurulum&quot; olarak işaretlenir.
          Bu adım opsiyonel — sonradan da eklenebilir.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="v2-card p-6 text-center">
          <p className="text-sm text-[rgb(var(--v2-muted))] mb-3">
            Henüz kalem yok
          </p>
          <button
            onClick={onAdd}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus size={16} />
            İlk kalemi ekle
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="v2-card p-3 flex gap-2 items-start">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={it.name}
                  onChange={(e) => onChange(it.id, { name: e.target.value })}
                  placeholder="örn. Depozit, Tabela"
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
                className="p-2 rounded-lg hover:bg-red-500/10 text-[rgb(var(--v2-muted))] hover:text-red-700 dark:hover:text-red-400 shrink-0"
                title="Sil"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            onClick={onAdd}
            className="w-full v2-card p-3 border-2 border-dashed border-[rgb(var(--v2-border))] hover:border-accent text-sm text-[rgb(var(--v2-muted))] hover:text-accent inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Plus size={16} />
            Yeni kalem
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="v2-card p-3 flex items-center justify-between bg-[rgb(var(--v2-sunken))]">
          <p className="text-sm text-[rgb(var(--v2-muted))]">Toplam kuruluş</p>
          <p className="text-lg font-bold text-red-700 dark:text-red-400">
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
        <p className="text-sm text-[rgb(var(--v2-muted))] font-medium">
          Aylık sabit masraflar
        </p>
        <p className="text-xs text-[rgb(var(--v2-muted))] mt-1">
          Her ay düzenli olarak ödenen giderler. Uygulanmayanlar için
          &quot;Geçerli değil&quot; togglesini kullan — o kategori bu işletmede
          oluşturulmaz.
        </p>
      </div>

      <div className="space-y-2">
        {items.map((it, idx) => {
          const disabled = !it.applicable;
          return (
            <div
              key={it.category}
              className={cn(
                "v2-card p-3 transition-opacity",
                disabled && "opacity-50"
              )}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[rgb(var(--v2-ink))]">
                    {it.label}
                  </p>
                  {it.required && (
                    <p className="text-[10px] text-[rgb(var(--v2-muted))]">Zorunlu</p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-[11px] text-[rgb(var(--v2-muted))] cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={!it.applicable}
                    onChange={(e) => onChange(idx, { applicable: !e.target.checked })}
                    className="w-3.5 h-3.5 rounded accent-amber-500"
                  />
                  <span>Geçerli değil</span>
                </label>
              </div>
              {it.category === "OTHER" && it.applicable && (
                <input
                  type="text"
                  value={it.customName || ""}
                  onChange={(e) => onChange(idx, { customName: e.target.value })}
                  placeholder="Kategori adı (örn. Lisans bedelleri)"
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
                placeholder={`Aylık tutar (${currency})`}
                className="input text-right disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          );
        })}
      </div>

      <div className="v2-card p-3 flex items-center justify-between bg-[rgb(var(--v2-sunken))]">
        <p className="text-sm text-[rgb(var(--v2-muted))]">Aylık toplam</p>
        <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
          {formatCurrency(monthlyTotal, currency)} / ay
        </p>
      </div>
    </div>
  );
}

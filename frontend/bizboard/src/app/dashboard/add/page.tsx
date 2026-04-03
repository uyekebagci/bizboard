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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api/client";
import { cn, formatCurrency, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
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
  color: string;
  currency: string;
  modules: string[];
  isMockup: boolean;
  // Mockup analysis fields
  mockupEstimatedRevenue: number;
  mockupEstimatedExpense: number;
  mockupInitialInvestment: number;
  mockupNotes: string;
}

const STEPS = [
  { id: 1, label: "Tip Secimi" },
  { id: 2, label: "Temel Bilgiler" },
  { id: 3, label: "Moduller" },
  { id: 4, label: "Onizleme" },
];

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
    color: "",
    currency: "TRY",
    modules: [],
    isMockup: false,
    mockupEstimatedRevenue: 0,
    mockupEstimatedExpense: 0,
    mockupInitialInvestment: 0,
    mockupNotes: "",
  });

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

  // Auto-save draft to localStorage
  useEffect(() => {
    const draft = localStorage.getItem("bizboard_draft_business");
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        setForm(parsed);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (form.name || form.businessTypeId) {
      localStorage.setItem("bizboard_draft_business", JSON.stringify(form));
    }
  }, [form]);

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
    switch (step) {
      case 1:
        return !!form.businessTypeId;
      case 2:
        return form.name.trim().length >= 2;
      case 3:
        return form.modules.length > 0;
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

      await api.post("/businesses", {
        name: form.name,
        description: form.description || null,
        business_type_id: form.businessTypeId,
        color: form.color,
        currency: form.currency,
        modules: form.modules,
        is_mockup: form.isMockup,
        metadata,
      });

      localStorage.removeItem("bizboard_draft_business");
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Isletme olusturulamadi");
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
    <div className="space-y-5 animate-fade-in pb-24">
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
          types={businessTypes}
          selectedId={form.businessTypeId}
          onSelect={selectType}
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
        {step < 4 ? (
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

// ===== STEP 1: Business Type Selection =====
function StepBusinessType({
  types,
  selectedId,
  onSelect,
}: {
  types: BusinessType[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-surface-300 font-medium">
        Isletme tipini secin
      </p>
      <div className="grid grid-cols-2 gap-3">
        {types.map((type) => {
          const Icon =
            categoryIconMap[type.icon] || LayoutGrid;
          const isSelected = selectedId === type.id;

          return (
            <button
              key={type.id}
              onClick={() => onSelect(type.id)}
              className={cn(
                "card p-4 text-left transition-all active:scale-[0.98]",
                isSelected
                  ? "ring-2 ring-brand-600 shadow-card-hover"
                  : "hover:shadow-card-hover"
              )}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
                style={{ backgroundColor: `${type.color}15` }}
              >
                <Icon size={22} style={{ color: type.color }} />
              </div>
              <p className="font-semibold text-sm text-white">
                {type.label}
              </p>
              <p className="text-xs text-surface-400 mt-0.5">
                {type.default_modules?.length || 0} modul
              </p>
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
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
}: {
  form: FormData;
  selectedType?: BusinessType;
}) {
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
              {selectedType.default_categories.map((cat: any, i: number) => (
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

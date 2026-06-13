"use client";

/**
 * Tier 2 (EVT-1, §2.2 + §2.4): ADMIN finansal alarm eşik konfigürasyonu.
 *
 * <p>İşletme-başına iki eşik: işletme toplam BAKİYE eşiği (altına düşünce
 * BALANCE_BELOW_THRESHOLD, debounce'lı) + tek HARCAMA eşiği (üstündeki gider
 * HIGH_EXPENSE_ALERT). Her eşik on/off + tutar input. <b>DEFAULT KAPALI</b> —
 * kapalıyken (off / 0) alarm üretilmez. Tema-duyarlı (Daxa v2: v2-card / v2-token).</p>
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Loader2,
  Building2,
  Wallet,
  TrendingDown,
  CalendarClock,
  CalendarDays,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import {
  getFinancialAlertThresholds,
  setFinancialAlertThresholds,
} from "@/lib/api/financial-alerts";
import {
  getPeriodicSummaryConfig,
  setPeriodicSummaryConfig,
  previewPeriodicSummary,
} from "@/lib/api/periodic-summary";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import type { Business } from "@/types";

export default function AdminFinancialAlertsPage() {
  const router = useRouter();
  const { profile } = useAppStore();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingCfg, setLoadingCfg] = useState(false);
  const [saving, setSaving] = useState(false);

  // Eşik state — on/off + tutar (string input, parse on save).
  const [balanceOn, setBalanceOn] = useState(false);
  const [balanceVal, setBalanceVal] = useState("");
  const [expenseOn, setExpenseOn] = useState(false);
  const [expenseVal, setExpenseVal] = useState("");

  // Tier 3 (EVT-2): periyodik özet tercihi — haftalık + aylık (DEFAULT KAPALI).
  const [weeklyOn, setWeeklyOn] = useState(false);
  const [monthlyOn, setMonthlyOn] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  // Admin değilse yönlendir.
  useEffect(() => {
    if (profile && profile.role !== "admin") router.push("/dashboard");
  }, [profile, router]);

  // İşletme listesini yükle.
  useEffect(() => {
    api
      .get<Business[]>("/businesses")
      .then((list) => {
        setBusinesses(list || []);
        if (list && list.length > 0) setSelectedId(list[0].id);
      })
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  // Seçili işletmenin eşiklerini + periyodik özet tercihini yükle.
  useEffect(() => {
    if (!selectedId) return;
    setLoadingCfg(true);
    setPreview(null);
    Promise.all([
      getFinancialAlertThresholds(selectedId),
      getPeriodicSummaryConfig(selectedId),
    ])
      .then(([cfg, summaryCfg]) => {
        setBalanceOn(cfg.balance_threshold != null);
        setBalanceVal(cfg.balance_threshold ?? "");
        setExpenseOn(cfg.high_expense_threshold != null);
        setExpenseVal(cfg.high_expense_threshold ?? "");
        setWeeklyOn(summaryCfg.weekly_enabled);
        setMonthlyOn(summaryCfg.monthly_enabled);
      })
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => setLoadingCfg(false));
  }, [selectedId]);

  async function handleSave() {
    if (!selectedId) return;
    // on ise pozitif sayı zorunlu; off ise null (kapalı).
    const balance = balanceOn ? Number(balanceVal) : null;
    const expense = expenseOn ? Number(expenseVal) : null;
    if (balanceOn && (!Number.isFinite(balance) || (balance as number) <= 0)) {
      toast.error("Bakiye eşiği için geçerli bir pozitif tutar girin");
      return;
    }
    if (expenseOn && (!Number.isFinite(expense) || (expense as number) <= 0)) {
      toast.error("Harcama eşiği için geçerli bir pozitif tutar girin");
      return;
    }
    setSaving(true);
    try {
      const cfg = await setFinancialAlertThresholds(selectedId, balance, expense);
      // Server normalize sonucunu geri yansıt (0 → off).
      setBalanceOn(cfg.balance_threshold != null);
      setBalanceVal(cfg.balance_threshold ?? "");
      setExpenseOn(cfg.high_expense_threshold != null);
      setExpenseVal(cfg.high_expense_threshold ?? "");
      toast.info("Eşikler kaydedildi");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSummary() {
    if (!selectedId) return;
    setSavingSummary(true);
    try {
      const cfg = await setPeriodicSummaryConfig(selectedId, weeklyOn, monthlyOn);
      setWeeklyOn(cfg.weekly_enabled);
      setMonthlyOn(cfg.monthly_enabled);
      toast.info("Özet tercihleri kaydedildi");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSavingSummary(false);
    }
  }

  async function handlePreview(period: "weekly" | "monthly") {
    if (!selectedId) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await previewPeriodicSummary(selectedId, period);
      setPreview(
        `${period === "weekly" ? "Haftalık" : "Aylık"} (${res.period_start} – ${res.period_end})\n\n${res.summary}`
      );
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPreviewing(false);
    }
  }

  if (profile?.role !== "admin") return null;

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto">
      <PageHeader
        title="Finansal Alarmlar"
        subtitle="İşletme-başına proaktif finansal alarm eşikleri. Eşik kapalıyken alarm üretilmez."
        icon={BellRing}
        fallbackHref="/admin"
        className="mb-8"
      />

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 size={20} className="animate-spin text-[rgb(var(--v2-muted))]" />
        </div>
      ) : businesses.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="İşletme bulunamadı"
          description="Alarm eşiklerini yönetmek için önce bir işletme oluşturun."
        />
      ) : (
        <div className="space-y-5">
          {/* İşletme seçimi */}
          <div className="v2-card p-5">
            <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-2">
              <span className="inline-flex items-center gap-2">
                <Building2 size={15} className="text-[rgb(var(--v2-muted))]" /> İşletme
              </span>
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="input w-full"
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {loadingCfg ? (
            <div className="py-8 flex justify-center">
              <Loader2 size={18} className="animate-spin text-[rgb(var(--v2-muted))]" />
            </div>
          ) : (
            <>
              {/* Bakiye eşiği */}
              <ThresholdCard
                icon={<TrendingDown size={18} className="text-accent-strong dark:text-accent" />}
                title="Düşük Bakiye Alarmı"
                description="İşletme toplam bakiyesi bu tutarın altına düştüğünde bir kez uyarı (tekrar üstüne çıkıp düşerse yeniden)."
                on={balanceOn}
                onToggle={setBalanceOn}
                value={balanceVal}
                onValueChange={setBalanceVal}
                placeholder="Örn: 5000"
              />

              {/* Harcama eşiği */}
              <ThresholdCard
                icon={<Wallet size={18} className="text-accent-strong dark:text-accent" />}
                title="Büyük Harcama Alarmı"
                description="Tek bir gider işlemi bu tutarı aştığında anlık uyarı (borç/transfer hariç — yalnız gerçek gider)."
                on={expenseOn}
                onToggle={setExpenseOn}
                value={expenseVal}
                onValueChange={setExpenseVal}
                placeholder="Örn: 10000"
              />

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full v2-btn v2-btn--accent v2-press !py-3"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {saving ? "Kaydediliyor..." : "Eşikleri Kaydet"}
              </button>

              {/* ── Tier 3 (EVT-2): Periyodik finansal özet ──────────── */}
              <div className="pt-3">
                <h2 className="text-sm font-bold text-[rgb(var(--v2-ink))] mb-1.5 inline-flex items-center gap-2">
                  <CalendarClock size={16} className="text-accent-strong dark:text-accent" /> Periyodik Finansal Özet
                </h2>
                <p className="text-[11px] text-[rgb(var(--v2-muted))] mb-3">
                  İşletme-başına zamanlanmış özet. Net kâr, gelir/gider, kasa, en
                  yüksek giderler ve dönem kaçak toplamı. <b>Varsayılan kapalı</b> —
                  açmadıkça özet gönderilmez.
                </p>

                <SummaryToggleCard
                  icon={<CalendarDays size={18} className="text-accent-strong dark:text-accent" />}
                  title="Haftalık Özet"
                  description="Her Pazartesi sabahı önceki haftanın (Pzt–Pzr) özeti."
                  on={weeklyOn}
                  onToggle={setWeeklyOn}
                />
                <SummaryToggleCard
                  icon={<CalendarClock size={18} className="text-accent-strong dark:text-accent" />}
                  title="Aylık Özet"
                  description="Her ayın 1'inde önceki ayın (1–son) özeti."
                  on={monthlyOn}
                  onToggle={setMonthlyOn}
                />

                <button
                  onClick={handleSaveSummary}
                  disabled={savingSummary}
                  className="w-full v2-btn v2-btn--accent v2-press !py-3"
                >
                  {savingSummary && <Loader2 size={16} className="animate-spin" />}
                  {savingSummary ? "Kaydediliyor..." : "Özet Tercihini Kaydet"}
                </button>

                {/* Önizleme (gönderim yapmaz; doğrulama için) */}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handlePreview("weekly")}
                    disabled={previewing}
                    className="flex-1 v2-btn v2-press !py-2 text-xs border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] hover:border-accent/50"
                  >
                    {previewing && <Loader2 size={14} className="animate-spin" />}
                    Haftalık Önizle
                  </button>
                  <button
                    onClick={() => handlePreview("monthly")}
                    disabled={previewing}
                    className="flex-1 v2-btn v2-press !py-2 text-xs border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] hover:border-accent/50"
                  >
                    {previewing && <Loader2 size={14} className="animate-spin" />}
                    Aylık Önizle
                  </button>
                </div>

                {preview && (
                  <pre className="mt-3 p-4 v2-card text-[11px] leading-relaxed text-[rgb(var(--v2-ink))] whitespace-pre-wrap font-mono">
                    {preview}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Periyodik özet toggle kartı (on/off, tutar yok) ──────────
function SummaryToggleCard({
  icon,
  title,
  description,
  on,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  on: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="v2-card p-5 mb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 shrink-0">{icon}</div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[rgb(var(--v2-ink))]">{title}</h3>
            <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">{description}</p>
          </div>
        </div>
        <button
          onClick={() => onToggle(!on)}
          role="switch"
          aria-checked={on}
          aria-label={`${title} aç/kapat`}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            on ? "bg-accent" : "bg-[rgb(var(--v2-sunken))] border border-[rgb(var(--v2-border))]"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              on ? "translate-x-4" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

// ── Tek eşik kartı (on/off + tutar) ──────────────────────────
function ThresholdCard({
  icon,
  title,
  description,
  on,
  onToggle,
  value,
  onValueChange,
  placeholder,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="v2-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 shrink-0">{icon}</div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[rgb(var(--v2-ink))]">{title}</h3>
            <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">{description}</p>
          </div>
        </div>
        <button
          onClick={() => onToggle(!on)}
          role="switch"
          aria-checked={on}
          aria-label={`${title} aç/kapat`}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            on ? "bg-accent" : "bg-[rgb(var(--v2-sunken))] border border-[rgb(var(--v2-border))]"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              on ? "translate-x-4" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {on && (
        <div className="mt-4">
          <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">
            Eşik tutarı (TRY)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder={placeholder}
            className="input w-full"
          />
        </div>
      )}
    </div>
  );
}

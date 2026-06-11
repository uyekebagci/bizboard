"use client";

/**
 * Tier 2 (EVT-1, §2.2 + §2.4): ADMIN finansal alarm eşik konfigürasyonu.
 *
 * <p>İşletme-başına iki eşik: işletme toplam BAKİYE eşiği (altına düşünce
 * BALANCE_BELOW_THRESHOLD, debounce'lı) + tek HARCAMA eşiği (üstündeki gider
 * HIGH_EXPENSE_ALERT). Her eşik on/off + tutar input. <b>DEFAULT KAPALI</b> —
 * kapalıyken (off / 0) alarm üretilmez. Tema-duyarlı (glass-card / surface-*).</p>
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, BellRing, Loader2, Building2, Wallet, TrendingDown } from "lucide-react";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import {
  getFinancialAlertThresholds,
  setFinancialAlertThresholds,
} from "@/lib/api/financial-alerts";
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

  // Seçili işletmenin eşiklerini yükle.
  useEffect(() => {
    if (!selectedId) return;
    setLoadingCfg(true);
    getFinancialAlertThresholds(selectedId)
      .then((cfg) => {
        setBalanceOn(cfg.balance_threshold != null);
        setBalanceVal(cfg.balance_threshold ?? "");
        setExpenseOn(cfg.high_expense_threshold != null);
        setExpenseVal(cfg.high_expense_threshold ?? "");
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

  if (profile?.role !== "admin") return null;

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push("/admin")}
          className="p-2 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors"
        >
          <ChevronLeft size={20} className="text-amber-400" />
        </button>
        <div className="flex items-center gap-2.5">
          <BellRing size={24} className="text-amber-400" />
          <h1 className="text-2xl font-bold text-surface-100">Finansal Alarmlar</h1>
        </div>
      </div>

      <p className="text-sm text-surface-400 mb-6">
        İşletme-başına proaktif finansal alarm eşikleri. Eşik kapalıyken (veya 0)
        alarm üretilmez. Alarmlar admin&apos;lere uygulama içi gönderilir; Telegram
        için bildirim tercihlerinden ilgili olayı açın.
      </p>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 size={20} className="animate-spin text-surface-400" />
        </div>
      ) : businesses.length === 0 ? (
        <div className="glass-card p-8 text-center text-surface-400">
          İşletme bulunamadı.
        </div>
      ) : (
        <div className="space-y-5">
          {/* İşletme seçimi */}
          <div className="glass-card p-5">
            <label className="block text-sm font-medium text-surface-300 mb-2">
              <span className="inline-flex items-center gap-2">
                <Building2 size={15} className="text-surface-400" /> İşletme
              </span>
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-900 border border-surface-600 rounded-xl text-surface-100 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
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
              <Loader2 size={18} className="animate-spin text-surface-400" />
            </div>
          ) : (
            <>
              {/* Bakiye eşiği */}
              <ThresholdCard
                icon={<TrendingDown size={18} className="text-amber-400" />}
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
                icon={<Wallet size={18} className="text-amber-400" />}
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
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-xl text-sm transition-colors inline-flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {saving ? "Kaydediliyor..." : "Eşikleri Kaydet"}
              </button>
            </>
          )}
        </div>
      )}
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
    <div className="glass-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 shrink-0">{icon}</div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-surface-100">{title}</h3>
            <p className="text-[11px] text-surface-400 mt-0.5">{description}</p>
          </div>
        </div>
        <button
          onClick={() => onToggle(!on)}
          role="switch"
          aria-checked={on}
          aria-label={`${title} aç/kapat`}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            on ? "bg-amber-500" : "bg-surface-600"
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
          <label className="block text-xs font-medium text-surface-300 mb-1.5">
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
            className="w-full px-4 py-2.5 bg-surface-900 border border-surface-600 rounded-xl text-surface-100 text-sm placeholder-gray-600 focus:outline-none focus:border-amber-500/50 transition-colors"
          />
        </div>
      )}
    </div>
  );
}

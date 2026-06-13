"use client";

/**
 * WP 4c75e95c: Finansal Raporlama MVP — Rapor Merkezi.
 *
 * <p>Rapor seçimi + dönem/işletme filtre + "PDF İndir" / "Excel İndir".
 * Endpoint: GET /reports/{type}?format=pdf|xlsx&... → dosya iner.
 * UI v2 (Daxa) tasarım dili (v2-card / v2-sunken segment).</p>
 */

import { useState } from "react";
import Link from "next/link";
import {
  TrendingUp, Activity, Layers, Wallet, FileText, FileSpreadsheet, Loader2, Building2,
  Landmark, BookOpen, PieChart, CreditCard, AlertTriangle, Lock, ChevronRight,
} from "lucide-react";
import { useBusinesses } from "@/hooks/useBusinesses";
import { API_URL, getToken, refreshAccessToken, isTokenExpiringSoon } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type ReportType = "pl" | "cashflow" | "aging" | "cash-reconciliation";

interface ReportDef {
  type: ReportType;
  title: string;
  desc: string;
  icon: typeof TrendingUp;
  /** Statik Tailwind class'ları (JIT purge için dinamik string YOK). */
  iconWrap: string;
  iconColor: string;
  needsBusiness?: boolean; // R4 kasa mutabakat işletme gerektirir
}

const REPORTS: ReportDef[] = [
  { type: "pl", title: "Gelir-Gider (P&L)", desc: "Dönem geliri, gideri, net kâr + işletme kırılımı", icon: TrendingUp, iconWrap: "bg-emerald-500/15", iconColor: "text-emerald-400" },
  { type: "cashflow", title: "Nakit Akışı", desc: "Günlük fiziksel kasa akışı (NAKIT + POS)", icon: Activity, iconWrap: "bg-sky-500/15", iconColor: "text-sky-400" },
  { type: "aging", title: "Alacak/Verecek Yaşlandırma", desc: "0-30 / 30-60 / 60-90 / 90+ gün bucket (güncel kur)", icon: Layers, iconWrap: "bg-amber-500/15", iconColor: "text-amber-400" },
  { type: "cash-reconciliation", title: "Kasa Mutabakat", desc: "Açılış/hesaplanan/sayım/fark + kapatılmamış gün", icon: Wallet, iconWrap: "bg-violet-500/15", iconColor: "text-violet-400", needsBusiness: true },
];

// Ledger v2 (Faz D) — patron için posting-tabanlı rapor seti. İKİ AYRI eksen:
// kategori-pl (NE tür) ⊥ operator-profit (KİM). Hepsi business gerektirir.
type LedgerReportType =
  | "treasury" | "daybook" | "category-pl" | "pos-reconciliation" | "variance" | "operator-profit";

interface LedgerReportDef {
  type: LedgerReportType;
  title: string;
  desc: string;
  icon: typeof TrendingUp;
  iconWrap: string;
  iconColor: string;
  needsRange?: boolean;   // from/to (cashflow days seg ile aynı 30 gün)
  needsMonth?: boolean;   // year/month
}

const LEDGER_REPORTS: LedgerReportDef[] = [
  { type: "treasury", title: "Hazine Durumu", desc: "Tüm hesap bakiyeleri, firma-bazlı (param nerede?)", icon: Landmark, iconWrap: "bg-emerald-500/15", iconColor: "text-emerald-400" },
  { type: "daybook", title: "Günlük Hareket Defteri", desc: "Dönem konum hareketleri (hesap/kategori/açıklama)", icon: BookOpen, iconWrap: "bg-sky-500/15", iconColor: "text-sky-400", needsRange: true },
  { type: "category-pl", title: "Kategori P&L (Dönem-Kıyas)", desc: "NE tür gelir/gider — bu ay vs geçen ay", icon: PieChart, iconWrap: "bg-indigo-500/15", iconColor: "text-indigo-400", needsMonth: true },
  { type: "pos-reconciliation", title: "POS Mutabakat", desc: "Dönem POS işlemleri brüt + yatış durumu", icon: CreditCard, iconWrap: "bg-cyan-500/15", iconColor: "text-cyan-400", needsRange: true },
  { type: "variance", title: "KAÇAK / Fark Raporu", desc: "Olması gereken − son kasa = kaçak + alarm", icon: AlertTriangle, iconWrap: "bg-rose-500/15", iconColor: "text-rose-400", needsRange: true },
  { type: "operator-profit", title: "Operatör Kâr", desc: "KİM/hangi cep — biriken kâr, ödenen, bakiye", icon: Lock, iconWrap: "bg-amber-500/15", iconColor: "text-amber-400" },
];

// Aylık dönem seçenekleri (P&L) — gün (cashflow) sabit 30.
const MONTH_OPTS = [
  { v: 1, label: "1 Ay" },
  { v: 3, label: "3 Ay" },
  { v: 6, label: "6 Ay" },
  { v: 12, label: "1 Yıl" },
];

export default function ReportsPage() {
  const { businesses } = useBusinesses();
  const [months, setMonths] = useState(1);
  const [businessId, setBusinessId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  async function download(type: ReportType, format: "pdf" | "xlsx") {
    const key = `${type}-${format}`;
    setBusy(key);
    try {
      // Token taze olsun (binary fetch api.client wrapper'ını kullanmıyor).
      if (getToken() && isTokenExpiringSoon(60)) {
        try { await refreshAccessToken(); } catch { /* retry below */ }
      }
      const params = new URLSearchParams({ format });
      if (type === "pl") params.set("months", String(months));
      if (type === "cashflow") params.set("days", "30");
      if (businessId) params.set("businessId", businessId);

      const res = await fetch(`${API_URL}/reports/${type}?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      });
      if (!res.ok) throw new Error(`Rapor alınamadı (${res.status})`);

      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^"]+)"?/);
      const filename = m ? m[1] : `${type}.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} indirildi`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "İndirme başarısız");
    } finally {
      setBusy(null);
    }
  }

  async function downloadLedger(def: LedgerReportDef, format: "pdf" | "xlsx") {
    if (!businessId) { toast.error("Önce bir işletme seçin"); return; }
    const key = `ledger-${def.type}-${format}`;
    setBusy(key);
    try {
      if (getToken() && isTokenExpiringSoon(60)) {
        try { await refreshAccessToken(); } catch { /* retry below */ }
      }
      const params = new URLSearchParams({ format, business_id: businessId });
      if (def.needsMonth) {
        const now = new Date();
        params.set("year", String(now.getFullYear()));
        params.set("month", String(now.getMonth() + 1));
      }
      if (def.needsRange) {
        const to = new Date();
        const from = new Date(Date.now() - 30 * 86400_000);
        params.set("from", from.toISOString().slice(0, 10));
        params.set("to", to.toISOString().slice(0, 10));
      }
      const res = await fetch(`${API_URL}/ledger-reports/${def.type}?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      });
      if (!res.ok) throw new Error(`Rapor alınamadı (${res.status})`);
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^"]+)"?/);
      const filename = m ? m[1] : `${def.type}.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} indirildi`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "İndirme başarısız");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rise">
        <p className="v2-eyebrow">Rapor Merkezi</p>
        <h1 className="v2-display text-2xl mt-1">Finansal Raporlar</h1>
        <p className="text-[rgb(var(--v2-muted))] mt-1 text-sm">
          Rapor seçin, dönem/işletme filtreleyin, PDF veya Excel indirin.
        </p>
      </section>

      {/* v1.1 Analitik — interaktif tahmin + bütçe (yeni) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/dashboard/reports/forecast"
          className="v2-card v2-lift p-4 flex items-center gap-3 group">
          <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0 bg-accent/15">
            <TrendingUp size={22} className="text-accent-strong dark:text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-[rgb(var(--v2-ink))]">13-Haftalık Nakit Tahmini</h3>
            <p className="text-xs text-[rgb(var(--v2-muted))] mt-0.5">İleriye projeksiyon + What-If senaryo motoru</p>
          </div>
          <ChevronRight size={18} className="text-[rgb(var(--v2-muted))] group-hover:text-accent-strong dark:group-hover:text-accent transition-colors" />
        </Link>
        <Link href="/dashboard/reports/butce"
          className="v2-card v2-lift p-4 flex items-center gap-3 group">
          <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0 bg-status-warning/15">
            <Wallet size={22} className="text-status-warning" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-[rgb(var(--v2-ink))]">Bütçe-Eşik Ayarları</h3>
            <p className="text-xs text-[rgb(var(--v2-muted))] mt-0.5">Kategori aylık bütçe + aşım uyarısı (opt-in)</p>
          </div>
          <ChevronRight size={18} className="text-[rgb(var(--v2-muted))] group-hover:text-accent-strong dark:group-hover:text-accent transition-colors" />
        </Link>
      </div>

      {/* Filtreler */}
      <section className="v2-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-sm">
          <span className="text-xs text-[rgb(var(--v2-muted))] mr-1">Dönem (P&amp;L):</span>
          <div className="flex items-center gap-1 v2-sunken p-1 rounded-xl">
            {MONTH_OPTS.map((o) => (
              <button
                key={o.v}
                onClick={() => setMonths(o.v)}
                aria-pressed={months === o.v}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                  months === o.v
                    ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold"
                    : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Building2 size={14} className="text-[rgb(var(--v2-muted))]" />
          <select
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className="py-1.5 px-3 w-auto text-sm rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
          >
            <option value="">Tüm İşletmeler</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Rapor kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          const disabled = r.needsBusiness && !businessId;
          return (
            <div key={r.type} className="v2-card p-5 flex flex-col">
              <div className="flex items-start gap-3 mb-3">
                <div className={cn("w-11 h-11 rounded-xl grid place-items-center shrink-0", r.iconWrap)}>
                  <Icon size={22} className={r.iconColor} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[rgb(var(--v2-ink))]">{r.title}</h3>
                  <p className="text-xs text-[rgb(var(--v2-muted))] mt-0.5">{r.desc}</p>
                </div>
              </div>
              {disabled && (
                <p className="text-[11px] text-status-warning mb-2">
                  Bu rapor için yukarıdan bir işletme seçin.
                </p>
              )}
              <div className="mt-auto flex gap-2 pt-2">
                <button
                  onClick={() => download(r.type, "pdf")}
                  disabled={disabled || busy !== null}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-status-danger/15 hover:bg-status-danger/25 text-status-danger border border-status-danger/30 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed v2-press"
                >
                  {busy === `${r.type}-pdf` ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  PDF İndir
                </button>
                <button
                  onClick={() => download(r.type, "xlsx")}
                  disabled={disabled || busy !== null}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-accent/15 hover:bg-accent/25 text-accent-strong dark:text-accent border border-accent/30 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed v2-press"
                >
                  {busy === `${r.type}-xlsx` ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                  Excel İndir
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-[rgb(var(--v2-muted))]">
        Tutarlar güncel kurla TL&apos;ye çevrilir (USD/Altın). Nakit akışı fiziksel kasa
        semantiğindedir (NAKIT + POS; HESAPDAN/TRANSFER hariç).
      </p>

      {/* ── Ledger v2 (Faz D) — Patron raporları (posting-tabanlı) ── */}
      <section className="rise pt-2">
        <p className="v2-eyebrow">Ledger Raporları (Faz D)</p>
        <h2 className="v2-display text-lg mt-1">Patron Raporları</h2>
        <p className="text-[rgb(var(--v2-muted))] mt-1 text-sm">
          Posting-tabanlı, firma-bazlı. İKİ ayrı eksen: <b>Kategori P&amp;L</b> (NE tür) ⊥{" "}
          <b>Operatör Kâr</b> (KİM). Bu raporlar <b>işletme seçimi</b> gerektirir.
        </p>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {LEDGER_REPORTS.map((r) => {
          const Icon = r.icon;
          const disabled = !businessId;
          return (
            <div key={r.type} className="v2-card p-5 flex flex-col">
              <div className="flex items-start gap-3 mb-3">
                <div className={cn("w-11 h-11 rounded-xl grid place-items-center shrink-0", r.iconWrap)}>
                  <Icon size={22} className={r.iconColor} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[rgb(var(--v2-ink))]">{r.title}</h3>
                  <p className="text-xs text-[rgb(var(--v2-muted))] mt-0.5">{r.desc}</p>
                </div>
              </div>
              {disabled && (
                <p className="text-[11px] text-status-warning mb-2">
                  Bu rapor için yukarıdan bir işletme seçin.
                </p>
              )}
              <div className="mt-auto flex gap-2 pt-2">
                <button
                  onClick={() => downloadLedger(r, "pdf")}
                  disabled={disabled || busy !== null}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-status-danger/15 hover:bg-status-danger/25 text-status-danger border border-status-danger/30 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed v2-press"
                >
                  {busy === `ledger-${r.type}-pdf` ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  PDF İndir
                </button>
                <button
                  onClick={() => downloadLedger(r, "xlsx")}
                  disabled={disabled || busy !== null}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-accent/15 hover:bg-accent/25 text-accent-strong dark:text-accent border border-accent/30 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed v2-press"
                >
                  {busy === `ledger-${r.type}-xlsx` ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                  Excel İndir
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

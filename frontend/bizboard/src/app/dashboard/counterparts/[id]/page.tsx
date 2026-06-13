"use client";

/**
 * v1.7.x WP fbb2ef55 (TODO d17b6745): Counterpart detay sayfası yeniden tasarlandı.
 *
 * <p>GET /counterparts/{id}/account-statement endpoint'i tüm widget'ları besler:
 * header (balance + actions), 4 breakdown card, 5 tab (Cari Hesap, Açık Alacaklar,
 * Açık Verecekler, Çek/Senet, İşlemler).</p>
 */

import { Suspense, useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft, Plus, ArrowDownLeft, ArrowUpRight, TrendingUp, TrendingDown,
  FileText, Scroll, Check, AlertTriangle, RefreshCw, Loader2, Trash2,
  Wallet, Banknote, Receipt, Scissors, Pencil, CheckCircle2, ArrowLeftRight,
  Clock, Activity, Gauge, Undo2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import { formatCurrency, formatOriginalAmount, isGoldCurrency, cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type {
  AccountStatement, Counterpart, PaymentDirection, PaymentInstrumentDto,
  DebtWriteoff,
} from "@/types";
import { PaymentModal } from "@/components/payments/PaymentModal";
import { ClearInstrumentModal } from "@/components/payments/ClearInstrumentModal";
import { BounceInstrumentModal } from "@/components/payments/BounceInstrumentModal";
import { CounterpartDebtModal } from "@/components/debts/CounterpartDebtModal";
import { WriteoffModal } from "@/components/debts/WriteoffModal";
import { EditDebtModal } from "@/components/debts/EditDebtModal";
import { PageHeader } from "@/components/shared/PageHeader";

type TabKey = "running" | "receivables" | "payables" | "instruments" | "transactions";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function CounterpartDetailPage() {
  // cari-tahsilat-ux: useSearchParams (deep-link ?action=) bir Suspense
  // sınırı gerektirir (Next 14 static-render kuralı). Diğer sayfalarla aynı desen.
  return (
    <Suspense>
      <CounterpartDetailInner />
    </Suspense>
  );
}

function CounterpartDetailInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params?.id;
  const { profile, refreshKey, triggerRefresh } = useAppStore();
  const isAdmin = profile?.role === "admin";

  const [cp, setCp] = useState<Counterpart | null>(null);
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  // Açık Alacaklar ilk sekme — default açılış burası (kullanıcı tercihi).
  const [tab, setTab] = useState<TabKey>("receivables");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [paymentModal, setPaymentModal] = useState<
    | { direction: PaymentDirection; prefillDebt?: { debt_id: string; remaining_amount: number; original_amount: number; description?: string | null } }
    | null
  >(null);
  const [debtModal, setDebtModal] = useState<"RECEIVABLE" | "PAYABLE" | null>(null);
  // WP a9da4e9d: bireysel borç düzenleme modal
  const [editingDebt, setEditingDebt] = useState<AccountStatement["open_debts"][number] | null>(null);
  // WP a9da4e9d: borç silme modal
  const [showWriteoff, setShowWriteoff] = useState(false);
  const [clearInst, setClearInst] = useState<PaymentInstrumentDto | null>(null);
  const [bounceInst, setBounceInst] = useState<PaymentInstrumentDto | null>(null);
  const [instStatusFilter, setInstStatusFilter] = useState<"ALL" | "PORTFOLIO" | "CLEARED" | "BOUNCED">("ALL");
  const [busyInstId, setBusyInstId] = useState<string | null>(null);

  // para-izi: writeoff (değersiz-kayıt) listesi + geri-al. Backend
  // GET /counterparts/{id}/writeoffs + DELETE /debt-writeoffs/{id} VAR.
  const [writeoffs, setWriteoffs] = useState<DebtWriteoff[]>([]);
  const [reverseTarget, setReverseTarget] = useState<DebtWriteoff | null>(null);
  const [reversing, setReversing] = useState(false);
  // Counterpart tekil bakiye yeniden-hesaplama (admin).
  const [recomputing, setRecomputing] = useState(false);

  async function refresh() {
    if (!id) return;
    setLoading(true);
    try {
      const [c, s, w] = await Promise.all([
        api.get<Counterpart>(`/counterparts/${id}`),
        api.get<AccountStatement>(`/counterparts/${id}/account-statement`),
        // para-izi: writeoff geçmişi — hata olsa bile sayfa açılmalı (best-effort).
        api.get<DebtWriteoff[]>(`/counterparts/${id}/writeoffs`).catch(() => [] as DebtWriteoff[]),
      ]);
      setCp(c);
      setStatement(s);
      setWriteoffs(w);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  // para-izi: writeoff geri-al — DELETE /debt-writeoffs/{id} → liste+bakiye yenile.
  async function handleReverseWriteoff() {
    if (!reverseTarget) return;
    setReversing(true);
    try {
      await api.delete(`/debt-writeoffs/${reverseTarget.id}`);
      toast.success("Değersiz kayıt geri alındı");
      setReverseTarget(null);
      triggerRefresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setReversing(false);
    }
  }

  // Counterpart tekil bakiye yeniden-hesaplama (admin) —
  // POST /admin/counterparts/{id}/recompute. Event-driven drift düzeltir.
  async function handleRecompute() {
    if (!id || !isAdmin) return;
    setRecomputing(true);
    try {
      await api.post(`/admin/counterparts/${id}/recompute`, {});
      toast.success("Bakiye yeniden hesaplandı");
      triggerRefresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setRecomputing(false);
    }
  }

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, [id, refreshKey]);

  // cari-tahsilat-ux: İşlem formundaki "Tahsilat/Ödeme olarak gir" kısayolu
  // bu sayfaya ?action=collect|pay ile yönlendirir → ilgili PaymentModal'ı
  // otomatik açar. NON-BREAKING: param yoksa hiçbir şey olmaz. Bir kez tetiklenir
  // (deep-link guard), sonra URL'den temizlenir ki refresh/back tekrar açmasın.
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || !statement) return;
    const action = searchParams?.get("action");
    if (action === "collect") {
      deepLinkHandled.current = true;
      setTab("receivables");
      setPaymentModal({ direction: "RECEIVED" });
      router.replace(`/dashboard/counterparts/${id}`);
    } else if (action === "pay") {
      deepLinkHandled.current = true;
      setTab("payables");
      setPaymentModal({ direction: "PAID" });
      router.replace(`/dashboard/counterparts/${id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statement, searchParams, id]);

  async function handleDeleteInstrument(inst: PaymentInstrumentDto) {
    if (!confirm("Bu çek/senet kaydını silmek istiyor musun? (Yalnız PORTFOLIO statu silinebilir)")) return;
    setBusyInstId(inst.id);
    try {
      await api.delete(`/payment-instruments/${inst.id}`);
      toast.info("Çek/senet silindi");
      triggerRefresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyInstId(null);
    }
  }

  // v1.7.x WP TODO cecd961e: Bu Ay Gelir Özeti — client-side hesap
  // (counterpart_id zaten transactions list'inde filtrelenmiş).
  const thisMonthIncome = useMemo(() => {
    if (!statement) return { total: 0, count: 0 };
    const now = new Date();
    const yyyymm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let total = 0;
    let count = 0;
    for (const t of statement.transactions) {
      if (!t.date || !t.date.startsWith(yyyymm)) continue;
      if (t.kind === "TRANSFER") continue;
      const isPos = (t.payment_method || "").toUpperCase().startsWith("POS");
      let contrib = 0;
      if (isPos && t.direction === "income") {
        const bank = t.applied_pos_rate ?? t.pos_rate ?? 0;
        const ours = t.applied_our_commission_rate ?? bank;
        contrib = (t.amount * (ours - bank)) / 100;
      } else if (t.direction === "income") {
        contrib = t.amount;
      } else if (t.direction === "expense") {
        contrib = -t.amount;
      }
      if (contrib !== 0) { total += contrib; count++; }
    }
    return { total, count };
  }, [statement]);

  if (loading || !cp || !statement) {
    if (loading) {
      return (
        <div className="space-y-5 pb-24">
          <div className="h-8 w-48 rounded-lg bg-[rgb(var(--v2-border))]/60 animate-pulse" />
          <div className="v2-card p-5 space-y-3">
            <div className="h-8 w-32 rounded-lg bg-[rgb(var(--v2-border))]/60 animate-pulse" />
            <div className="h-4 w-64 rounded bg-[rgb(var(--v2-border))]/60 animate-pulse" />
          </div>
          <div className="h-10 rounded-xl bg-[rgb(var(--v2-border))]/60 animate-pulse" />
          <div className="v2-card p-4 space-y-3">
            {[0,1,2,3].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-[rgb(var(--v2-border))]/60 animate-pulse" />
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="text-[rgb(var(--v2-muted))] text-sm py-8 flex items-center gap-2 justify-center">
        {error || "Karşı firma bulunamadı"}
      </div>
    );
  }

  const balance = statement.current_balance ?? 0;
  const bb = statement.balance_breakdown;
  const filteredInstruments = statement.instruments_portfolio.filter((p) =>
    instStatusFilter === "ALL" ? true : p.status === instStatusFilter);

  return (
    <div className="space-y-5 pb-24">
      {/* ── Header ─────────────────────────────────────────────── */}
      <PageHeader
        title={cp.name}
        subtitle={
          <>
            {cp.kind && (
              <span className="inline-flex items-center mr-2 text-[10px] font-medium px-2 py-0.5 rounded v2-sunken text-[rgb(var(--v2-muted))]">
                {cp.kind === "FIRM" ? "Firma" : "Kişi"}
              </span>
            )}
            {cp.tax_id && <span>{cp.tax_id}</span>}
          </>
        }
        fallbackHref="/dashboard/counterparts"
        actions={
          <div className="flex items-center gap-1.5">
            {isAdmin && (
              <button
                onClick={handleRecompute}
                disabled={recomputing}
                className="v2-icon-btn v2-press disabled:opacity-50"
                title="Bakiye Yeniden Hesapla (admin)"
                aria-label="Bakiye yeniden hesapla"
              >
                {recomputing ? <Loader2 size={14} className="animate-spin" /> : <Gauge size={14} />}
              </button>
            )}
            <button
              onClick={refresh}
              className="v2-icon-btn v2-press"
              title="Yenile"
              aria-label="Yenile"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        }
      />

      {/* ── Balance + Action buttons — v2 hero (Daxa): glass/sheen/gradient kaldırıldı ── */}
      <section className="v2-card relative overflow-hidden p-5">
        <div className="relative flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs text-[rgb(var(--v2-muted))] mb-1">Cari Bakiye</p>
            <p className={cn("num text-4xl font-bold h-display",
              balance > 0 ? "text-emerald-700 dark:text-emerald-300"
                : balance < 0 ? "text-red-700 dark:text-red-300"
                : "text-[rgb(var(--v2-ink))]")}>
              {formatCurrency(balance, "TRY")}
            </p>
            <p className="mt-1 text-[11px] text-[rgb(var(--v2-muted))]">
              {balance > 0 && "Firma bize borçlu (alacağımız var)"}
              {balance < 0 && "Biz firmaya borçluyuz (vereceğimiz var)"}
              {balance === 0 && "Cari kapalı"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setPaymentModal({ direction: "RECEIVED" })}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1.5">
              <ArrowDownLeft size={14} /> Ödeme Al
            </button>
            <button onClick={() => setPaymentModal({ direction: "PAID" })}
              className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center gap-1.5">
              <ArrowUpRight size={14} /> Ödeme Yap
            </button>
            <button onClick={() => setDebtModal("RECEIVABLE")}
              className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold inline-flex items-center gap-1.5">
              <Plus size={14} /> Alacak
            </button>
            {/* WP a9da4e9d: borç silme — admin only (non-admin tooltip) */}
            <button
              onClick={() => {
                if (!isAdmin) {
                  alert("Yönetici yetkisi gerekli");
                  return;
                }
                setShowWriteoff(true);
              }}
              title={isAdmin ? "Borçtan ödeme almadan manuel düşüm" : "Yönetici yetkisi gerekli"}
              className={cn(
                "px-3 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 border",
                isAdmin
                  ? "bg-rose-600/20 hover:bg-rose-600/30 text-rose-700 dark:text-rose-300 border-rose-500/40"
                  : "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] border-[rgb(var(--v2-border))] cursor-not-allowed",
              )}
            >
              <Scissors size={14} /> Borç Sil
            </button>
          </div>
        </div>
      </section>

      {/* ── 5 Breakdown cards (4 + Bu Ay Gelir) ─────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <BreakdownCard label="Açık Alacaklar" value={bb.open_receivables_total}
          count={statement.open_debts.filter((d) => d.direction === "RECEIVABLE").length}
          tone="positive" icon={<TrendingUp size={14} />} />
        <BreakdownCard label="Açık Verecekler" value={bb.open_payables_total}
          count={statement.open_debts.filter((d) => d.direction === "PAYABLE").length}
          tone="negative" icon={<TrendingDown size={14} />} />
        <BreakdownCard label="Çek/Senet Portföy"
          value={bb.portfolio_cheques_incoming + bb.portfolio_notes_incoming
            - bb.portfolio_cheques_outgoing - bb.portfolio_notes_outgoing}
          extra={`gel ${formatCurrency(bb.portfolio_cheques_incoming + bb.portfolio_notes_incoming, "TRY")} · gid ${formatCurrency(bb.portfolio_cheques_outgoing + bb.portfolio_notes_outgoing, "TRY")}`}
          tone="neutral" icon={<FileText size={14} />} />
        {/* v1.7.x WP TODO cecd961e: Bu Ay Gelir (client-side) */}
        <BreakdownCard label="Bu Ay Gelir" value={thisMonthIncome.total}
          count={thisMonthIncome.count}
          extra="POS profit + gross − gider"
          tone={thisMonthIncome.total >= 0 ? "positive" : "negative"}
          icon={<TrendingUp size={14} />} />
        <BreakdownCard label="Net Pozisyon"
          value={bb.net_with_portfolio} extra={`Realize: ${formatCurrency(bb.net_realized, "TRY")}`}
          tone={bb.net_with_portfolio > 0 ? "positive" : bb.net_with_portfolio < 0 ? "negative" : "neutral"}
          icon={<Wallet size={14} />} primary />
      </section>

      {/* ── Cari-360 — salt görüntü analitiği (mevcut statement'tan türetilir) ── */}
      <Cari360Panel statement={statement} />

      {/* ── Değersiz Kayıtlar (writeoff) — para-izi: liste + geri-al ── */}
      {writeoffs.length > 0 && (
        <WriteoffsPanel
          writeoffs={writeoffs}
          isAdmin={isAdmin}
          onReverse={(w) => setReverseTarget(w)}
        />
      )}

      {/* ── Tabs ──────────────────────────────────────────────── */}
      <section>
        {/* Sekme sırası: Açık Alacaklar · Açık Verecekler · Çek/Senet · İşlemler · Cari Hesap (sona).
            #4 fix: overflow-y-hidden + flex-nowrap + no-scrollbar → dikey scrollbar çıkmaz. */}
        <div className="flex flex-nowrap gap-1 overflow-x-auto overflow-y-hidden no-scrollbar border-b border-[rgb(var(--v2-border))] mb-3">
          <TabBtn label={`Açık Alacaklar (${statement.open_debts.filter((d) => d.direction === "RECEIVABLE").length})`}
            active={tab === "receivables"} onClick={() => setTab("receivables")} />
          <TabBtn label={`Açık Verecekler (${statement.open_debts.filter((d) => d.direction === "PAYABLE").length})`}
            active={tab === "payables"} onClick={() => setTab("payables")} />
          <TabBtn label={`Çek/Senet (${statement.instruments_portfolio.length})`}
            active={tab === "instruments"} onClick={() => setTab("instruments")} />
          <TabBtn label={`İşlemler (${statement.transactions.length})`}
            active={tab === "transactions"} onClick={() => setTab("transactions")} />
          <TabBtn label="Cari Hesap" active={tab === "running"} onClick={() => setTab("running")} />
        </div>

        {/* Tab 1: Cari Hesap — hareket geçmişi (WP a9da4e9d: redesign + borç düzenleme) */}
        {tab === "running" && (
          statement.running_balance_history.length === 0 ? (
            <div className="v2-card p-8 text-center text-[rgb(var(--v2-muted))] text-xs">
              Henüz hareket yok.
            </div>
          ) : (
            <div className="v2-card divide-y divide-[rgb(var(--v2-border))]">
              {statement.running_balance_history.map((r, i) => {
                // DEBT_CREATED açık borca denk geliyorsa düzenlenebilir; aksi halde kapanmış borç.
                const openDebt = r.type === "DEBT_CREATED"
                  ? statement.open_debts.find((d) => d.id === r.reference_id) ?? null
                  : null;
                const isClosedDebt = r.type === "DEBT_CREATED" && !openDebt;
                return (
                  <RunningHistoryRow
                    key={r.reference_id + "-" + i}
                    row={r}
                    isClosedDebt={isClosedDebt}
                    onEdit={openDebt ? () => setEditingDebt(openDebt) : undefined}
                  />
                );
              })}
            </div>
          )
        )}

        {/* Tab 2: Açık alacaklar */}
        {tab === "receivables" && (
          <DebtListTab
            debts={statement.open_debts.filter((d) => d.direction === "RECEIVABLE")}
            tone="positive"
            actionLabel="Tahsilat"
            onAction={(d) => setPaymentModal({
              direction: "RECEIVED",
              prefillDebt: {
                debt_id: d.id, remaining_amount: d.remaining_amount,
                original_amount: d.original_amount, description: d.description,
              },
            })}
            onEdit={(d) => setEditingDebt(d)}
          />
        )}

        {/* Tab 3: Açık verecekler */}
        {tab === "payables" && (
          <DebtListTab
            debts={statement.open_debts.filter((d) => d.direction === "PAYABLE")}
            tone="negative"
            actionLabel="Ödeme Yap"
            onAction={(d) => setPaymentModal({
              direction: "PAID",
              prefillDebt: {
                debt_id: d.id, remaining_amount: d.remaining_amount,
                original_amount: d.original_amount, description: d.description,
              },
            })}
            onEdit={(d) => setEditingDebt(d)}
          />
        )}

        {/* Tab 4: Çek/Senet */}
        {tab === "instruments" && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {(["ALL", "PORTFOLIO", "CLEARED", "BOUNCED"] as const).map((s) => (
                <button key={s} onClick={() => setInstStatusFilter(s)}
                  className={cn("px-3 py-1 rounded-full text-xs font-medium border",
                    instStatusFilter === s ? "bg-accent/15 border-accent/30 text-accent-strong dark:text-accent"
                                           : "bg-[rgb(var(--v2-sunken))] border-[rgb(var(--v2-border))] text-[rgb(var(--v2-muted))]")}>
                  {s === "ALL" ? "Tümü" : s === "PORTFOLIO" ? "Portföy"
                    : s === "CLEARED" ? "Tahsil" : "Karşılıksız"}
                </button>
              ))}
            </div>
            {filteredInstruments.length === 0 ? (
              <div className="v2-card p-8 text-center text-[rgb(var(--v2-muted))] text-xs">
                Bu filtrede çek/senet yok.
              </div>
            ) : (
              <div className="v2-card divide-y divide-[rgb(var(--v2-border))]">
                {filteredInstruments.map((p) => {
                  const isCheque = p.instrument_type === "CHEQUE";
                  const isIn = p.direction === "INCOMING";
                  return (
                    <div key={p.id} className="p-3 flex items-center gap-3">
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                        isIn ? "bg-emerald-500/15" : "bg-red-500/15")}>
                        {isCheque ? <FileText size={16} className={isIn ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"} />
                                  : <Scroll size={16} className={isIn ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[rgb(var(--v2-ink))] truncate">
                          {isCheque ? (p.cheque_number || "Çek") : (p.note_serial || "Senet")}
                          {" · "}
                          <span className="font-semibold">{formatCurrency(p.amount, p.currency || "TRY")}</span>
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))]">
                            {isIn ? "Bizde" : "Verdiğimiz"}
                          </span>
                          <span className={cn("ml-1 text-[10px] px-1.5 py-0.5 rounded",
                            p.status === "PORTFOLIO" ? "bg-amber-500/20 text-amber-700 dark:text-amber-200" :
                            p.status === "CLEARED" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-200" :
                            p.status === "BOUNCED" ? "bg-red-500/20 text-red-700 dark:text-red-200" :
                            "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))]")}>
                            {p.status === "PORTFOLIO" ? "Portföy" :
                             p.status === "CLEARED" ? "Tahsil" :
                             p.status === "BOUNCED" ? "Karşılıksız" : p.status}
                          </span>
                        </p>
                        <p className="text-[11px] text-[rgb(var(--v2-muted))] truncate">
                          Vade: {formatDate(p.due_date)}
                          {isCheque && p.drawer_bank && ` · ${p.drawer_bank}`}
                          {p.cleared_at && ` · Tahsil: ${formatDate(p.cleared_at)}${p.cleared_bank_account_name ? ' → ' + p.cleared_bank_account_name : ''}`}
                          {p.bounced_at && ` · Karşılıksız: ${formatDate(p.bounced_at)}`}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {p.status === "PORTFOLIO" && (
                          <>
                            <button onClick={() => setClearInst(p)}
                              className="text-[10px] px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 inline-flex items-center gap-1">
                              <Check size={10} /> Tahsil
                            </button>
                            <button onClick={() => setBounceInst(p)}
                              className="text-[10px] px-2 py-1 rounded-md bg-red-500/15 text-red-700 dark:text-red-300 hover:bg-red-500/25 border border-red-500/30 inline-flex items-center gap-1">
                              <AlertTriangle size={10} /> Karşılıksız
                            </button>
                            <button onClick={() => handleDeleteInstrument(p)}
                              disabled={busyInstId === p.id}
                              className="text-[10px] px-2 py-1 rounded-md text-[rgb(var(--v2-muted))] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 inline-flex items-center gap-1 disabled:opacity-50">
                              {busyInstId === p.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Transactions */}
        {tab === "transactions" && (
          <div className="v2-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Tarih</th>
                  <th className="text-left px-4 py-2 font-medium">Açıklama</th>
                  <th className="text-left px-4 py-2 font-medium">Yöntem</th>
                  <th className="text-right px-4 py-2 font-medium">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--v2-border))]">
                {statement.transactions.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-[rgb(var(--v2-muted))] text-xs">
                    Bu firma ile işlem yok.
                  </td></tr>
                ) : statement.transactions.map((t) => {
                  const isInc = t.direction === "income";
                  return (
                    <tr key={t.id}>
                      <td className="px-4 py-2 text-[rgb(var(--v2-muted))] whitespace-nowrap text-xs">
                        {formatDate(t.date)}
                      </td>
                      <td className="px-4 py-2 text-[rgb(var(--v2-ink))] truncate max-w-[300px]">
                        {t.description || "—"}
                      </td>
                      <td className="px-4 py-2 text-[rgb(var(--v2-muted))] text-xs">
                        {t.payment_method === "POS" ? <CreditCardBadge /> :
                         t.payment_method === "HESAPDAN" ? "Banka" : "Nakit"}
                      </td>
                      <td className={cn("px-4 py-2 text-right font-semibold whitespace-nowrap",
                        isInc ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
                        {isInc ? "+" : "−"}{formatCurrency(t.amount, t.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Modals ────────────────────────────────────────────── */}
      {paymentModal && (
        <PaymentModal
          counterpartId={id!}
          counterpartName={cp.name}
          defaultDirection={paymentModal.direction}
          prefillDebt={paymentModal.prefillDebt}
          openDebts={statement.open_debts}
          onClose={() => setPaymentModal(null)}
          onSuccess={() => { triggerRefresh(); }}
        />
      )}
      {debtModal && (
        <CounterpartDebtModal
          direction={debtModal}
          preselectedBusinessId={cp.business_id || undefined}
          preselectedCounterpart={cp}
          onClose={() => setDebtModal(null)}
        />
      )}
      {editingDebt && (
        <EditDebtModal
          debt={{
            id: editingDebt.id,
            original_amount: editingDebt.original_amount,
            remaining_amount: editingDebt.remaining_amount,
            due_date: editingDebt.due_date,
            description: editingDebt.description,
          }}
          onClose={() => setEditingDebt(null)}
          onSuccess={() => { setEditingDebt(null); triggerRefresh(); }}
        />
      )}
      {showWriteoff && (
        <WriteoffModal
          counterpartId={id!}
          counterpartName={cp.name}
          openDebts={statement.open_debts}
          onClose={() => setShowWriteoff(false)}
          onSuccess={() => { setShowWriteoff(false); triggerRefresh(); }}
        />
      )}
      {clearInst && (
        <ClearInstrumentModal
          instrument={clearInst}
          onClose={() => setClearInst(null)}
          onSuccess={() => { triggerRefresh(); }}
        />
      )}
      {bounceInst && (
        <BounceInstrumentModal
          instrument={bounceInst}
          onClose={() => setBounceInst(null)}
          onSuccess={() => { triggerRefresh(); }}
        />
      )}
      {/* para-izi: writeoff geri-al onay modalı */}
      {reverseTarget && (
        <ReverseWriteoffModal
          writeoff={reverseTarget}
          submitting={reversing}
          onConfirm={handleReverseWriteoff}
          onClose={() => { if (!reversing) setReverseTarget(null); }}
        />
      )}
    </div>
  );
}

// ── Değersiz Kayıtlar (writeoff) paneli — liste + geri-al (para-izi) ──────────

function WriteoffsPanel({
  writeoffs, isAdmin, onReverse,
}: {
  writeoffs: DebtWriteoff[];
  isAdmin: boolean;
  onReverse: (w: DebtWriteoff) => void;
}) {
  const total = writeoffs.reduce((s, w) => s + (w.amount || 0), 0);
  return (
    <section className="v2-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Scissors size={16} className="text-rose-700 dark:text-rose-300" />
        <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))]">Değersiz Kayıtlar</h2>
        <span className="text-[10px] text-[rgb(var(--v2-muted))]">
          ödeme almadan düşülen borçlar · {writeoffs.length} kayıt
        </span>
        <span className="ml-auto text-xs font-semibold num text-rose-700 dark:text-rose-300">
          {formatCurrency(total, "TRY")}
        </span>
      </div>
      <div className="rounded-lg border border-[rgb(var(--v2-border))] divide-y divide-[rgb(var(--v2-border))] overflow-hidden">
        {writeoffs.map((w) => (
          <div key={w.id} className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-rose-500/15">
              <Scissors size={16} className="text-rose-700 dark:text-rose-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[rgb(var(--v2-ink))]">
                <span className="font-semibold">{formatCurrency(w.amount, "TRY")}</span>
                {w.reason && <span className="text-[rgb(var(--v2-muted))]"> · {w.reason}</span>}
              </p>
              <p className="text-[11px] text-[rgb(var(--v2-muted))] truncate">
                {formatDateTime(w.written_off_at)}
                {w.written_off_by_name && ` · ${w.written_off_by_name}`}
                {w.debt_status_after && ` · borç → ${w.debt_status_after}`}
              </p>
            </div>
            <div className="shrink-0">
              <button
                onClick={() => {
                  if (!isAdmin) { toast.error("Yönetici yetkisi gerekli"); return; }
                  onReverse(w);
                }}
                disabled={!isAdmin}
                title={isAdmin ? "Bu değersiz kaydı geri al" : "Yönetici yetkisi gerekli"}
                className="text-[10px] px-2.5 py-1.5 rounded-md font-semibold inline-flex items-center gap-1 border bg-[rgb(var(--v2-sunken))] hover:opacity-80 text-[rgb(var(--v2-ink))] border-[rgb(var(--v2-border))] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Undo2 size={11} /> Geri Al
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReverseWriteoffModal({
  writeoff, submitting, onConfirm, onClose,
}: {
  writeoff: DebtWriteoff;
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitting, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="v2-card !border-rose-500/40 max-w-sm w-full p-5"
      >
        <h4 className="text-base font-semibold text-[rgb(var(--v2-ink))] mb-2 flex items-center gap-2">
          <Undo2 size={18} className="text-rose-700 dark:text-rose-400" />
          Değersiz Kaydı Geri Al
        </h4>
        <p className="text-sm text-[rgb(var(--v2-muted))] mb-3">
          <strong className="text-rose-700 dark:text-rose-300">{formatCurrency(writeoff.amount, "TRY")}</strong>
          {" "}tutarındaki değersiz kayıt geri alınacak — silinen borç tekrar açık alacağa eklenecek.
        </p>
        <p className="text-[11px] text-[rgb(var(--v2-muted))] mb-4">
          Bu işlem cari hesap bakiyesini değiştirir. Bank balance ve transaction listesi etkilenmez.
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} disabled={submitting}
            className="btn-secondary flex-1 py-2 text-sm">
            Vazgeç
          </button>
          <button onClick={onConfirm} disabled={submitting}
            className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Geri Al
          </button>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn("px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
        active ? "border-accent text-accent-strong dark:text-accent"
               : "border-transparent text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]")}>
      {label}
    </button>
  );
}

function BreakdownCard({
  label, value, count, tone, icon, extra, primary,
}: {
  label: string; value: number; count?: number;
  tone: "positive" | "negative" | "neutral"; icon: React.ReactNode;
  extra?: string; primary?: boolean;
}) {
  const color = tone === "positive" ? "text-emerald-700 dark:text-emerald-300"
              : tone === "negative" ? "text-red-700 dark:text-red-300" : "text-[rgb(var(--v2-ink))]";
  return (
    <div className={cn("v2-card p-3", primary && "ring-1 ring-accent/40 bg-accent/[0.06]")}>
      <div className="flex items-center gap-1.5 text-[10px] text-[rgb(var(--v2-muted))] uppercase mb-1">
        {icon} {label}
      </div>
      <p className={cn("text-lg font-bold", color)}>
        {formatCurrency(Math.abs(value), "TRY")}
      </p>
      {count !== undefined && (
        <p className="text-[10px] text-[rgb(var(--v2-muted))] mt-0.5">{count} kayıt</p>
      )}
      {extra && <p className="text-[10px] text-[rgb(var(--v2-muted))] mt-0.5 truncate">{extra}</p>}
    </div>
  );
}

// ── Cari-360 — salt görüntü analitiği ──────────────────────────────────────
//
// Yeni endpoint/hesap YOK. Tüm metrikler /account-statement yanıtından
// (open_debts, payment_history, transactions) client-side türetilir. Amaç:
// yaşlandırma (aging), işlem hacmi ve ödeme özetiyle cariyi tek bakışta
// 360° görmek. Mevcut sayılar DEĞİŞTİRİLMEZ — yalnız yeniden gruplanır.

type AgingBucket = { label: string; amount: number; count: number; tone: "ok" | "warn" | "danger" };

/** Açık borçları vade tarihine göre yaşlandırma kovalarına dağıt. */
function buildAging(
  debts: AccountStatement["open_debts"],
  direction: "RECEIVABLE" | "PAYABLE",
): AgingBucket[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: AgingBucket[] = [
    { label: "Vadesi yok", amount: 0, count: 0, tone: "ok" },
    { label: "Güncel", amount: 0, count: 0, tone: "ok" },
    { label: "1-30 gün geçti", amount: 0, count: 0, tone: "warn" },
    { label: "31-60 gün geçti", amount: 0, count: 0, tone: "warn" },
    { label: "60+ gün geçti", amount: 0, count: 0, tone: "danger" },
  ];
  for (const d of debts) {
    if (d.direction !== direction) continue;
    const amt = d.remaining_amount;
    if (!d.due_date) { buckets[0].amount += amt; buckets[0].count++; continue; }
    const due = new Date(d.due_date);
    if (isNaN(due.getTime())) { buckets[0].amount += amt; buckets[0].count++; continue; }
    const overdue = Math.round((today.getTime() - due.getTime()) / 86_400_000);
    if (overdue <= 0) { buckets[1].amount += amt; buckets[1].count++; }
    else if (overdue <= 30) { buckets[2].amount += amt; buckets[2].count++; }
    else if (overdue <= 60) { buckets[3].amount += amt; buckets[3].count++; }
    else { buckets[4].amount += amt; buckets[4].count++; }
  }
  return buckets;
}

function Cari360Panel({ statement }: { statement: AccountStatement }) {
  // İşlem hacmi: transfer hariç tüm tx'lerin |tutar| toplamı + adet + son tarih.
  const txStats = useMemo(() => {
    let volume = 0, count = 0, lastDate: string | null = null;
    for (const t of statement.transactions) {
      if (t.kind === "TRANSFER") continue;
      volume += Math.abs(t.amount);
      count++;
      if (t.date && (!lastDate || t.date > lastDate)) lastDate = t.date;
    }
    return { volume, count, lastDate };
  }, [statement.transactions]);

  // Ödeme özeti: tahsil edilen (RECEIVED) vs ödenen (PAID) + son ödeme tarihi.
  const payStats = useMemo(() => {
    let received = 0, paid = 0, lastDate: string | null = null;
    for (const p of statement.payment_history) {
      if (p.payment_direction === "RECEIVED") received += p.amount;
      else if (p.payment_direction === "PAID") paid += p.amount;
      const d = p.payment_date;
      if (d && (!lastDate || d > lastDate)) lastDate = d;
    }
    return { received, paid, count: statement.payment_history.length, lastDate };
  }, [statement.payment_history]);

  const receivableAging = useMemo(
    () => buildAging(statement.open_debts, "RECEIVABLE"),
    [statement.open_debts]);
  const payableAging = useMemo(
    () => buildAging(statement.open_debts, "PAYABLE"),
    [statement.open_debts]);

  const hasReceivableAging = receivableAging.some((b) => b.count > 0);
  const hasPayableAging = payableAging.some((b) => b.count > 0);

  return (
    <section className="v2-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Gauge size={16} className="text-accent-strong dark:text-accent" />
        <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))]">Cari 360°</h2>
        <span className="text-[10px] text-[rgb(var(--v2-muted))]">salt görüntü · mevcut veriden türetildi</span>
      </div>

      {/* Özet metrik şeridi */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat icon={<Activity size={13} />} label="İşlem Hacmi"
          value={formatCurrency(txStats.volume, "TRY")}
          sub={`${txStats.count} işlem`} />
        <MiniStat icon={<Clock size={13} />} label="Son İşlem"
          value={formatDate(txStats.lastDate)} sub="tarih" />
        <MiniStat icon={<ArrowDownLeft size={13} className="text-emerald-700 dark:text-emerald-300" />} label="Tahsil Edilen"
          value={formatCurrency(payStats.received, "TRY")}
          sub={`${payStats.count} ödeme`} tone="positive" />
        <MiniStat icon={<ArrowUpRight size={13} className="text-red-700 dark:text-red-300" />} label="Ödenen"
          value={formatCurrency(payStats.paid, "TRY")}
          sub={payStats.lastDate ? `son: ${formatDate(payStats.lastDate)}` : "—"} tone="negative" />
      </div>

      {/* Yaşlandırma (aging) — alacak + verecek ayrı */}
      {(hasReceivableAging || hasPayableAging) ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {hasReceivableAging && (
            <AgingTable title="Alacak Yaşlandırma" buckets={receivableAging} tone="positive" />
          )}
          {hasPayableAging && (
            <AgingTable title="Verecek Yaşlandırma" buckets={payableAging} tone="negative" />
          )}
        </div>
      ) : (
        <p className="text-xs text-[rgb(var(--v2-muted))]">Açık borç yok — yaşlandırma boş.</p>
      )}
    </section>
  );
}

function MiniStat({
  icon, label, value, sub, tone,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  tone?: "positive" | "negative";
}) {
  const valueCls = tone === "positive" ? "text-emerald-700 dark:text-emerald-300"
    : tone === "negative" ? "text-red-700 dark:text-red-300" : "text-[rgb(var(--v2-ink))]";
  return (
    <div className="rounded-lg bg-[rgb(var(--v2-sunken))] border border-[rgb(var(--v2-border))] p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-[rgb(var(--v2-muted))] uppercase mb-1">
        {icon} {label}
      </div>
      <p className={cn("text-sm font-bold num truncate", valueCls)}>{value}</p>
      {sub && <p className="text-[10px] text-[rgb(var(--v2-muted))] mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function AgingTable({
  title, buckets, tone,
}: {
  title: string; buckets: AgingBucket[]; tone: "positive" | "negative";
}) {
  const total = buckets.reduce((s, b) => s + b.amount, 0);
  const accent = tone === "positive" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300";
  return (
    <div className="rounded-lg border border-[rgb(var(--v2-border))] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-[rgb(var(--v2-sunken))]">
        <span className="text-xs font-medium text-[rgb(var(--v2-ink))]">{title}</span>
        <span className={cn("text-xs font-semibold num", accent)}>{formatCurrency(total, "TRY")}</span>
      </div>
      <div className="divide-y divide-[rgb(var(--v2-border))]">
        {buckets.map((b) => {
          if (b.count === 0) return null;
          const pct = total > 0 ? Math.round((b.amount / total) * 100) : 0;
          const barCls = b.tone === "danger" ? "bg-red-500/70"
            : b.tone === "warn" ? "bg-amber-500/70" : "bg-emerald-500/60";
          const labelCls = b.tone === "danger" ? "text-red-700 dark:text-red-300"
            : b.tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-[rgb(var(--v2-muted))]";
          return (
            <div key={b.label} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={cn("text-[11px]", labelCls)}>
                  {b.label} <span className="text-[rgb(var(--v2-muted))]">({b.count})</span>
                </span>
                <span className="text-[11px] font-medium text-[rgb(var(--v2-ink))] num">
                  {formatCurrency(b.amount, "TRY")}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[rgb(var(--v2-sunken))] overflow-hidden">
                <div className={cn("h-full rounded-full", barCls)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DebtListTab({
  debts, tone, actionLabel, onAction, onEdit,
}: {
  debts: AccountStatement["open_debts"];
  tone: "positive" | "negative";
  actionLabel: string;
  onAction: (d: AccountStatement["open_debts"][number]) => void;
  onEdit: (d: AccountStatement["open_debts"][number]) => void;
}) {
  if (debts.length === 0) {
    return (
      <div className="v2-card p-8 text-center text-[rgb(var(--v2-muted))] text-xs">
        Açık {tone === "positive" ? "alacak" : "verecek"} yok.
      </div>
    );
  }
  return (
    <div className="v2-card divide-y divide-[rgb(var(--v2-border))]">
      {debts.map((d) => {
        const isPartial = d.remaining_amount < d.original_amount && d.remaining_amount > 0;
        // WP currency-display: USD/GOLD borç → orijinal cinsi göster (kaç bin dolar /
        // kaç gram altın). TL toplama yine çevrilmiş remaining_amount eklenir.
        const isForeign = !!d.currency && d.currency.toUpperCase() !== "TRY";
        const remOriginal = d.remaining_currency_amount ?? d.original_currency_amount ?? null;
        const fullOriginal = d.original_currency_amount ?? null;
        return (
          <div key={d.id} className="p-3 flex items-center gap-3">
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
              tone === "positive" ? "bg-emerald-500/15" : "bg-red-500/15")}>
              <Receipt size={16} className={tone === "positive" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[rgb(var(--v2-ink))] truncate">
                {d.description || "Borç"}
                {isPartial && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-200">
                    Kısmi
                  </span>
                )}
                {/* Döviz/altın rozeti — orijinal cinsi belirt. */}
                {isForeign && (
                  <span className={cn(
                    "ml-2 text-[10px] px-1.5 py-0.5 rounded border",
                    isGoldCurrency(d.currency)
                      ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30"
                      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
                  )}>
                    {isGoldCurrency(d.currency) ? "Altın" : (d.currency || "").toUpperCase()}
                  </span>
                )}
              </p>
              {/* USD/GOLD borçta orijinal cinsteki tutar ÖNDE/öne çıkar; TL karşılığı yanında. */}
              {isForeign && remOriginal != null ? (
                <p className="text-[11px] text-[rgb(var(--v2-muted))]">
                  Kalan: <span className={cn("font-semibold", tone === "positive" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
                    {formatOriginalAmount(remOriginal, d.currency)}
                  </span>
                  <span className="text-[rgb(var(--v2-muted))]"> ({formatCurrency(d.remaining_amount, "TRY")})</span>
                  {isPartial && fullOriginal != null && ` · Orijinal ${formatOriginalAmount(fullOriginal, d.currency)}`}
                  {` · Vade ${d.due_date ? formatDate(d.due_date) : "belli değil"}`}
                </p>
              ) : (
                <p className="text-[11px] text-[rgb(var(--v2-muted))]">
                  Kalan: <span className={cn("font-semibold", tone === "positive" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
                    {formatCurrency(d.remaining_amount, "TRY")}
                  </span>
                  {isPartial && ` · Orijinal ${formatCurrency(d.original_amount, "TRY")}`}
                  {` · Vade ${d.due_date ? formatDate(d.due_date) : "belli değil"}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => onEdit(d)}
                title="Düzenle"
                aria-label="Borcu düzenle"
                className="text-[10px] px-2 py-1.5 rounded-md font-semibold inline-flex items-center gap-1 bg-[rgb(var(--v2-sunken))] hover:opacity-80 text-[rgb(var(--v2-ink))] border border-[rgb(var(--v2-border))]">
                <Pencil size={10} />
              </button>
              <button onClick={() => onAction(d)}
                className={cn("text-[10px] px-3 py-1.5 rounded-md font-semibold inline-flex items-center gap-1",
                  tone === "positive"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-red-600 hover:bg-red-700 text-white")}>
                {tone === "positive" ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
                {actionLabel}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CreditCardBadge() {
  // P0 kontrast: light koyu varyant — beyazda -300 okunmuyordu.
  return <span className="text-indigo-700 dark:text-indigo-300">POS</span>;
}

// ── Cari Hesap hareket satırı (WP a9da4e9d: redesign + borç düzenleme) ──

type HistoryRow = AccountStatement["running_balance_history"][number];

/** Hareket tipi → Türkçe etiket + ikon + renk. Ham enum UI'da gösterilmez. */
const HISTORY_TYPE_META: Record<HistoryRow["type"], {
  label: string;
  icon: React.ReactNode;
  badge: string; // rozet arka plan + metin + border
  iconWrap: string; // sol ikon kutusu arka planı
}> = {
  // P0 kontrast: her renge light koyu varyant (dark:text-X-300 / text-X-700) —
  // light temada beyaz/açık yüzeyde -300 tonları okunmuyordu (AA fail).
  DEBT_CREATED: {
    label: "Borç Eklendi",
    icon: <Receipt size={14} className="text-indigo-700 dark:text-indigo-300" />,
    badge: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
    iconWrap: "bg-indigo-500/15",
  },
  PAYMENT: {
    label: "Ödeme",
    icon: <Banknote size={14} className="text-emerald-700 dark:text-emerald-300" />,
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    iconWrap: "bg-emerald-500/15",
  },
  INSTRUMENT_CLEARED: {
    label: "Çek/Senet Tahsil",
    icon: <CheckCircle2 size={14} className="text-teal-700 dark:text-teal-300" />,
    badge: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30",
    iconWrap: "bg-teal-500/15",
  },
  INSTRUMENT_BOUNCED: {
    label: "Karşılıksız",
    icon: <AlertTriangle size={14} className="text-amber-700 dark:text-amber-300" />,
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
    iconWrap: "bg-amber-500/15",
  },
  TRANSACTION: {
    label: "İşlem",
    icon: <ArrowLeftRight size={14} className="text-[rgb(var(--v2-muted))]" />,
    badge: "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] border-[rgb(var(--v2-border))]",
    iconWrap: "bg-[rgb(var(--v2-sunken))]",
  },
  WRITEOFF: {
    label: "Borç Silindi",
    icon: <Scissors size={14} className="text-rose-700 dark:text-rose-300" />,
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
    iconWrap: "bg-rose-500/15",
  },
};

function RunningHistoryRow({
  row, onEdit, isClosedDebt = false,
}: { row: HistoryRow; onEdit?: () => void; isClosedDebt?: boolean }) {
  const meta = HISTORY_TYPE_META[row.type] ?? HISTORY_TYPE_META.TRANSACTION;
  const isWriteoff = row.type === "WRITEOFF";
  const amountCls = isWriteoff ? "text-rose-700 dark:text-rose-300"
    : row.amount > 0 ? "text-emerald-700 dark:text-emerald-400"
    : row.amount < 0 ? "text-red-700 dark:text-red-400" : "text-[rgb(var(--v2-muted))]";
  return (
    <div className={cn(
      "p-3 flex items-start gap-3",
      isWriteoff && "bg-rose-500/[0.03]",
      // Kapanmış borç: soluk (muted) — aktif hareketlerden görsel ayır, ama satırı koru.
      isClosedDebt && "opacity-55",
    )}>
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", meta.iconWrap)}>
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border", meta.badge)}>
            {meta.label}
          </span>
          {isClosedDebt && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] border-[rgb(var(--v2-border))]">
              <Check size={10} /> Kapandı
            </span>
          )}
          <span className="text-[11px] text-[rgb(var(--v2-muted))] whitespace-nowrap">
            {formatDateTime(row.date)}
          </span>
        </div>
        {row.description && (
          <p className="mt-1 text-sm text-[rgb(var(--v2-ink))] break-words leading-relaxed">
            {row.description}
          </p>
        )}
      </div>
      <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
        <span className={cn("text-sm font-semibold whitespace-nowrap", amountCls)}>
          {row.amount === 0 ? "—" : (row.amount > 0 ? "+" : "−") + formatCurrency(Math.abs(row.amount), "TRY")}
        </span>
        <span className="text-[11px] text-[rgb(var(--v2-muted))] whitespace-nowrap">
          Bakiye: <span className="text-[rgb(var(--v2-ink))] font-medium">{formatCurrency(row.balance_after, "TRY")}</span>
        </span>
      </div>
      {onEdit && (
        <button onClick={onEdit}
          title="Borcu düzenle"
          aria-label="Borcu düzenle"
          className="shrink-0 self-center p-1.5 rounded-md bg-[rgb(var(--v2-sunken))] hover:opacity-80 text-[rgb(var(--v2-muted))] border border-[rgb(var(--v2-border))]">
          <Pencil size={12} />
        </button>
      )}
    </div>
  );
}

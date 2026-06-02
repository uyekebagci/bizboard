"use client";

/**
 * v1.7.x WP fbb2ef55 (TODO d17b6745): Counterpart detay sayfası yeniden tasarlandı.
 *
 * <p>GET /counterparts/{id}/account-statement endpoint'i tüm widget'ları besler:
 * header (balance + actions), 4 breakdown card, 5 tab (Cari Hesap, Açık Alacaklar,
 * Açık Verecekler, Çek/Senet, İşlemler).</p>
 */

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft, Plus, ArrowDownLeft, ArrowUpRight, TrendingUp, TrendingDown,
  FileText, Scroll, Check, AlertTriangle, RefreshCw, Loader2, Trash2,
  Wallet, Banknote, Receipt, Scissors,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import { formatCurrency, cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type {
  AccountStatement, Counterpart, PaymentDirection, PaymentInstrumentDto,
} from "@/types";
import { PaymentModal } from "@/components/payments/PaymentModal";
import { ClearInstrumentModal } from "@/components/payments/ClearInstrumentModal";
import { BounceInstrumentModal } from "@/components/payments/BounceInstrumentModal";
import { CounterpartDebtModal } from "@/components/debts/CounterpartDebtModal";
import { WriteoffModal } from "@/components/debts/WriteoffModal";

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
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { profile, refreshKey, triggerRefresh } = useAppStore();
  const isAdmin = profile?.role === "admin";

  const [cp, setCp] = useState<Counterpart | null>(null);
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [tab, setTab] = useState<TabKey>("running");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [paymentModal, setPaymentModal] = useState<
    | { direction: PaymentDirection; prefillDebt?: { debt_id: string; remaining_amount: number; original_amount: number; description?: string | null } }
    | null
  >(null);
  const [debtModal, setDebtModal] = useState<"RECEIVABLE" | "PAYABLE" | null>(null);
  // WP a9da4e9d: borç silme modal
  const [showWriteoff, setShowWriteoff] = useState(false);
  const [clearInst, setClearInst] = useState<PaymentInstrumentDto | null>(null);
  const [bounceInst, setBounceInst] = useState<PaymentInstrumentDto | null>(null);
  const [instStatusFilter, setInstStatusFilter] = useState<"ALL" | "PORTFOLIO" | "CLEARED" | "BOUNCED">("ALL");
  const [busyInstId, setBusyInstId] = useState<string | null>(null);

  async function refresh() {
    if (!id) return;
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        api.get<Counterpart>(`/counterparts/${id}`),
        api.get<AccountStatement>(`/counterparts/${id}/account-statement`),
      ]);
      setCp(c);
      setStatement(s);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, [id, refreshKey]);

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
    return (
      <div className="text-surface-400 text-sm py-8 flex items-center gap-2 justify-center">
        {loading && <Loader2 size={16} className="animate-spin" />}
        {error || (loading ? "Yükleniyor..." : "Karşı firma bulunamadı")}
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
      <section className="flex items-center gap-3">
        {/* v1.7.x: router.back() ile geçmişe geri dön — kullanıcı /alacaklar
            veya /verecekler'den geldiyse o sayfaya döner. Fallback: counterparts. */}
        <button onClick={() => router.back()}
          className="p-2 rounded-lg bg-surface-700 hover:bg-surface-600"
          title="Geri">
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white truncate">{cp.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            {cp.kind && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-surface-700 text-surface-300">
                {cp.kind === "FIRM" ? "Firma" : "Kişi"}
              </span>
            )}
            {cp.tax_id && <span className="text-[11px] text-surface-400">{cp.tax_id}</span>}
          </div>
        </div>
        <button onClick={refresh}
          className="p-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-300"
          title="Yenile">
          <RefreshCw size={14} />
        </button>
      </section>

      {/* ── Balance + Action buttons ──────────────────────────── */}
      <section className="card p-5 bg-gradient-to-br from-brand-700/30 to-brand-900/30">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs text-surface-300 mb-1">Cari Bakiye</p>
            <p className={cn("text-4xl font-bold",
              balance > 0 ? "text-emerald-300" : balance < 0 ? "text-red-300" : "text-white")}>
              {formatCurrency(balance, "TRY")}
            </p>
            <p className="mt-1 text-[11px] text-surface-400">
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
                  ? "bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border-rose-500/40"
                  : "bg-surface-700 text-surface-500 border-surface-600 cursor-not-allowed",
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

      {/* ── Tabs ──────────────────────────────────────────────── */}
      <section>
        <div className="flex gap-1 overflow-x-auto border-b border-surface-700 mb-3">
          <TabBtn label="Cari Hesap" active={tab === "running"} onClick={() => setTab("running")} />
          <TabBtn label={`Açık Alacaklar (${statement.open_debts.filter((d) => d.direction === "RECEIVABLE").length})`}
            active={tab === "receivables"} onClick={() => setTab("receivables")} />
          <TabBtn label={`Açık Verecekler (${statement.open_debts.filter((d) => d.direction === "PAYABLE").length})`}
            active={tab === "payables"} onClick={() => setTab("payables")} />
          <TabBtn label={`Çek/Senet (${statement.instruments_portfolio.length})`}
            active={tab === "instruments"} onClick={() => setTab("instruments")} />
          <TabBtn label={`İşlemler (${statement.transactions.length})`}
            active={tab === "transactions"} onClick={() => setTab("transactions")} />
        </div>

        {/* Tab 1: Running balance history */}
        {tab === "running" && (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-800/50 text-surface-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Tarih</th>
                  <th className="text-left px-4 py-2 font-medium">Açıklama</th>
                  <th className="text-right px-4 py-2 font-medium">Hareket</th>
                  <th className="text-right px-4 py-2 font-medium">Bakiye</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-700">
                {statement.running_balance_history.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-surface-400 text-xs">
                    Henüz hareket yok.
                  </td></tr>
                ) : statement.running_balance_history.map((r, i) => {
                  const isWriteoff = r.type === "WRITEOFF";
                  return (
                  <tr key={r.reference_id + "-" + i} className={isWriteoff ? "bg-rose-500/[0.03]" : ""}>
                    <td className="px-4 py-2 text-surface-300 whitespace-nowrap text-xs">
                      {formatDateTime(r.date)}
                    </td>
                    <td className="px-4 py-2 text-surface-200">
                      <span className={cn(
                        "inline-block text-[9px] uppercase mr-1 px-1.5 py-0.5 rounded border",
                        isWriteoff
                          ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
                          : "bg-surface-700 text-surface-400 border-surface-600",
                      )}>
                        {isWriteoff ? "✂ Borç Silindi" : r.type}
                      </span>
                      {r.description}
                    </td>
                    <td className={cn("px-4 py-2 text-right font-semibold whitespace-nowrap",
                      isWriteoff ? "text-rose-300" :
                      r.amount > 0 ? "text-emerald-400" : r.amount < 0 ? "text-red-400" : "text-surface-400")}>
                      {r.amount === 0 ? "—" : (r.amount > 0 ? "+" : "−") + formatCurrency(Math.abs(r.amount), "TRY")}
                    </td>
                    <td className="px-4 py-2 text-right text-white font-medium whitespace-nowrap">
                      {formatCurrency(r.balance_after, "TRY")}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
          />
        )}

        {/* Tab 4: Çek/Senet */}
        {tab === "instruments" && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {(["ALL", "PORTFOLIO", "CLEARED", "BOUNCED"] as const).map((s) => (
                <button key={s} onClick={() => setInstStatusFilter(s)}
                  className={cn("px-3 py-1 rounded-full text-xs font-medium border",
                    instStatusFilter === s ? "bg-brand-500/20 border-brand-400 text-brand-200"
                                           : "bg-surface-700 border-surface-600 text-surface-300")}>
                  {s === "ALL" ? "Tümü" : s === "PORTFOLIO" ? "Portföy"
                    : s === "CLEARED" ? "Tahsil" : "Karşılıksız"}
                </button>
              ))}
            </div>
            {filteredInstruments.length === 0 ? (
              <div className="card p-8 text-center text-surface-400 text-xs">
                Bu filtrede çek/senet yok.
              </div>
            ) : (
              <div className="card divide-y divide-surface-700">
                {filteredInstruments.map((p) => {
                  const isCheque = p.instrument_type === "CHEQUE";
                  const isIn = p.direction === "INCOMING";
                  return (
                    <div key={p.id} className="p-3 flex items-center gap-3">
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                        isIn ? "bg-emerald-500/15" : "bg-red-500/15")}>
                        {isCheque ? <FileText size={16} className={isIn ? "text-emerald-300" : "text-red-300"} />
                                  : <Scroll size={16} className={isIn ? "text-emerald-300" : "text-red-300"} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {isCheque ? (p.cheque_number || "Çek") : (p.note_serial || "Senet")}
                          {" · "}
                          <span className="font-semibold">{formatCurrency(p.amount, p.currency || "TRY")}</span>
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-surface-700 text-surface-300">
                            {isIn ? "Bizde" : "Veriidiğimiz"}
                          </span>
                          <span className={cn("ml-1 text-[10px] px-1.5 py-0.5 rounded",
                            p.status === "PORTFOLIO" ? "bg-amber-500/20 text-amber-200" :
                            p.status === "CLEARED" ? "bg-emerald-500/20 text-emerald-200" :
                            p.status === "BOUNCED" ? "bg-red-500/20 text-red-200" :
                            "bg-surface-700 text-surface-300")}>
                            {p.status === "PORTFOLIO" ? "Portföy" :
                             p.status === "CLEARED" ? "Tahsil" :
                             p.status === "BOUNCED" ? "Karşılıksız" : p.status}
                          </span>
                        </p>
                        <p className="text-[11px] text-surface-400 truncate">
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
                              className="text-[10px] px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 inline-flex items-center gap-1">
                              <Check size={10} /> Tahsil
                            </button>
                            <button onClick={() => setBounceInst(p)}
                              className="text-[10px] px-2 py-1 rounded-md bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/30 inline-flex items-center gap-1">
                              <AlertTriangle size={10} /> Karşılıksız
                            </button>
                            <button onClick={() => handleDeleteInstrument(p)}
                              disabled={busyInstId === p.id}
                              className="text-[10px] px-2 py-1 rounded-md text-surface-400 hover:text-red-400 hover:bg-red-500/10 inline-flex items-center gap-1 disabled:opacity-50">
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
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-800/50 text-surface-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Tarih</th>
                  <th className="text-left px-4 py-2 font-medium">Açıklama</th>
                  <th className="text-left px-4 py-2 font-medium">Yöntem</th>
                  <th className="text-right px-4 py-2 font-medium">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-700">
                {statement.transactions.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-surface-400 text-xs">
                    Bu firma ile işlem yok.
                  </td></tr>
                ) : statement.transactions.map((t) => {
                  const isInc = t.direction === "income";
                  return (
                    <tr key={t.id}>
                      <td className="px-4 py-2 text-surface-300 whitespace-nowrap text-xs">
                        {formatDate(t.date)}
                      </td>
                      <td className="px-4 py-2 text-surface-200 truncate max-w-[300px]">
                        {t.description || "—"}
                      </td>
                      <td className="px-4 py-2 text-surface-400 text-xs">
                        {t.payment_method === "POS" ? <CreditCardBadge /> :
                         t.payment_method === "HESAPDAN" ? "Banka" : "Nakit"}
                      </td>
                      <td className={cn("px-4 py-2 text-right font-semibold whitespace-nowrap",
                        isInc ? "text-emerald-400" : "text-red-400")}>
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
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn("px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
        active ? "border-brand-500 text-brand-300"
               : "border-transparent text-surface-400 hover:text-surface-200")}>
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
  const color = tone === "positive" ? "text-emerald-300"
              : tone === "negative" ? "text-red-300" : "text-white";
  return (
    <div className={cn("card p-3", primary && "ring-1 ring-brand-500/40 bg-brand-900/20")}>
      <div className="flex items-center gap-1.5 text-[10px] text-surface-400 uppercase mb-1">
        {icon} {label}
      </div>
      <p className={cn("text-lg font-bold", color)}>
        {formatCurrency(Math.abs(value), "TRY")}
      </p>
      {count !== undefined && (
        <p className="text-[10px] text-surface-500 mt-0.5">{count} kayıt</p>
      )}
      {extra && <p className="text-[10px] text-surface-500 mt-0.5 truncate">{extra}</p>}
    </div>
  );
}

function DebtListTab({
  debts, tone, actionLabel, onAction,
}: {
  debts: AccountStatement["open_debts"];
  tone: "positive" | "negative";
  actionLabel: string;
  onAction: (d: AccountStatement["open_debts"][number]) => void;
}) {
  if (debts.length === 0) {
    return (
      <div className="card p-8 text-center text-surface-400 text-xs">
        Açık {tone === "positive" ? "alacak" : "verecek"} yok.
      </div>
    );
  }
  return (
    <div className="card divide-y divide-surface-700">
      {debts.map((d) => {
        const isPartial = d.remaining_amount < d.original_amount && d.remaining_amount > 0;
        return (
          <div key={d.id} className="p-3 flex items-center gap-3">
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
              tone === "positive" ? "bg-emerald-500/15" : "bg-red-500/15")}>
              <Receipt size={16} className={tone === "positive" ? "text-emerald-300" : "text-red-300"} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">
                {d.description || "Borç"}
                {isPartial && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200">
                    Kısmi
                  </span>
                )}
              </p>
              <p className="text-[11px] text-surface-400">
                Kalan: <span className={cn("font-semibold", tone === "positive" ? "text-emerald-300" : "text-red-300")}>
                  {formatCurrency(d.remaining_amount, "TRY")}
                </span>
                {isPartial && ` · Orijinal ${formatCurrency(d.original_amount, "TRY")}`}
                {d.due_date && ` · Vade ${formatDate(d.due_date)}`}
              </p>
            </div>
            <button onClick={() => onAction(d)}
              className={cn("text-[10px] px-3 py-1.5 rounded-md font-semibold inline-flex items-center gap-1",
                tone === "positive"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white")}>
              {tone === "positive" ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
              {actionLabel}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function CreditCardBadge() {
  return <span className="text-indigo-300">POS</span>;
}

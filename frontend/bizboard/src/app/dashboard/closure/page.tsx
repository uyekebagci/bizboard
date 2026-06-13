"use client";

/**
 * Beta v1.1: /dashboard/closure — Gün Kapanışı sayfası.
 *
 * <p>5 ana section: POS by sub-cash, Transfers, Cash Withdrawals,
 * Debt hareketleri, Expenses + Summary. Aynı sayfa /closure/[date]
 * route üzerinden geçmiş tarih için read-only.</p>
 */

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp,
  CreditCard, ArrowLeftRight, Banknote, FileText, TrendingDown, BarChart3,
  Plus, Trash2, Zap, CalendarCheck,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { ClosureQuickAddModal, type ClosureSection } from "@/components/closure/ClosureQuickAddModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { ListSkeleton } from "@/components/shared/Skeleton";

interface TxSummary {
  id: string;
  amount: number;
  payment_method: string | null;
  direction: string | null;
  description: string | null;
  date: string | null;
  created_at: string | null;
  pos_device_name: string | null;
  bank_account_name: string | null;
  counterpart_name: string | null;
}

interface SectionedClosure {
  date: string;
  business_id: string;
  pos: {
    income: {
      groups: Array<{ sub_cash_id: string | null; sub_cash_name: string; tx_list: TxSummary[]; tx_count: number; total: number }>;
      grand_total: number;
      grand_count: number;
    };
    expense: {
      nakit: { list: TxSummary[]; count: number; total: number };
      transfer: { list: TxSummary[]; count: number; total: number };
      grand_total: number;
      grand_count: number;
    };
    grand_total: number;
    grand_count: number;
    net: number;
  };
  transfers: {
    outgoing_external: { list: TxSummary[]; count: number; total: number };
    internal: { list: TxSummary[]; count: number; total: number };
    incoming_external: { list: TxSummary[]; count: number; total: number };
  };
  cash_withdrawals: { list: TxSummary[]; count: number; total: number };
  debts: {
    new_receivables: { list: Array<{ id: string; counterparty: string; amount: number; due_date: string | null }>; count: number; total: number };
    new_payables: { list: Array<{ id: string; counterparty: string; amount: number; due_date: string | null }>; count: number; total: number };
    payments_received: { list: unknown[]; count: number; total: number };
    payments_made: { list: unknown[]; count: number; total: number };
  };
  expenses: {
    nakit: { list: TxSummary[]; count: number; total: number };
    transfer: { list: TxSummary[]; count: number; total: number };
    grand_total: number;
    grand_count: number;
  };
}

interface PreviewBasic {
  opening_balance: number;
  computed_closing: number;
  closed: boolean;
}

export default function ClosurePageWrapper() {
  return <Suspense><ClosurePage /></Suspense>;
}

function ClosurePage() {
  const router = useRouter();
  const { triggerRefresh } = useAppStore();
  const searchParams = useSearchParams();
  const businessIdParam = searchParams.get("business_id");
  const dateParam = searchParams.get("date");
  const today = new Date().toISOString().split("T")[0];
  const closureDate = dateParam || today;
  const isPast = closureDate < today;

  const [businessId, setBusinessId] = useState<string>(businessIdParam || "");
  const [businesses, setBusinesses] = useState<Array<{ id: string; name: string }>>([]);
  const [sectioned, setSectioned] = useState<SectionedClosure | null>(null);
  const [basic, setBasic] = useState<PreviewBasic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savingClose, setSavingClose] = useState(false);

  const [actualBalanceStr, setActualBalanceStr] = useState("");
  const [description, setDescription] = useState("");

  // WP 08617251 (Beta v1.1): closure session — inline tx ekleme akışı
  const [sessionId] = useState<string>(() =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "session-" + Math.random().toString(36).slice(2),
  );
  const [sessionTxCount, setSessionTxCount] = useState(0);
  const [quickAddSection, setQuickAddSection] = useState<ClosureSection | null>(null);
  const [rollbacking, setRollbacking] = useState(false);

  useEffect(() => {
    api.get<Array<{ id: string; name: string }>>("/businesses")
      .then((bs) => {
        setBusinesses(bs || []);
        if (!businessId && bs && bs.length > 0) setBusinessId(bs[0].id);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshSections = useCallback(async (showSpinner = true) => {
    if (!businessId) return;
    if (showSpinner) setLoading(true);
    try {
      const [s, b] = await Promise.all([
        api.get<SectionedClosure>(
          `/closings/sectioned?business_id=${businessId}&date=${closureDate}`,
        ).catch((err) => {
          logger.error("api", "sectioned closure fetch failed", { businessId, date: closureDate }, err);
          return null;
        }),
        api.get<PreviewBasic>(`/closings/preview?business_id=${businessId}`).catch(() => null),
      ]);
      setSectioned(s);
      setBasic(b);
      if (b && actualBalanceStr === "") {
        setActualBalanceStr(String(b.computed_closing));
      }
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [businessId, closureDate, actualBalanceStr]);

  useEffect(() => { void refreshSections(true); }, [refreshSections]);

  // WP 08617251: beforeunload uyarısı + sendBeacon ile session abandon.
  // Kullanıcı sekmeyi/sayfayı kapatırsa session tx'leri otomatik silinir.
  useEffect(() => {
    if (sessionTxCount === 0 || isPast) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = ""; // browser default uyarı
    }
    function onUnload() {
      try {
        const url = `/closings/sessions/${sessionId}/abandon`;
        // sendBeacon native fetch'ten daha güvenilir (page unload sırasında)
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([JSON.stringify({})], { type: "application/json" }));
        }
      } catch { /* ignore */ }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("unload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("unload", onUnload);
    };
  }, [sessionTxCount, sessionId, isPast]);

  const opening = basic?.opening_balance ?? 0;
  const computed = basic?.computed_closing ?? 0;
  const alreadyClosed = basic?.closed ?? false;
  const isReadOnly = isPast || alreadyClosed;

  async function saveClosure(e: React.FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    setSavingClose(true);
    setError(null);
    try {
      await api.post(`/closings/today?business_id=${businessId}`, {
        actual_balance: Number(actualBalanceStr) || computed,
        description: description.trim() || null,
        // WP 08617251: session etiketi → finalize atomic'inde session tx'lerin
        // closure_session_id NULL'a strip edilir (= kalıcı, draft çıkar).
        closure_session_id: sessionTxCount > 0 ? sessionId : null,
      });
      triggerRefresh();
      setSessionTxCount(0); // beforeunload uyarısını kapat
      setSuccess("Kapanış başarıyla kaydedildi.");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kapanış kaydedilemedi");
      toast.error(err);
    } finally {
      setSavingClose(false);
    }
  }

  async function handleRollbackSession() {
    if (!confirm(`${sessionTxCount} adet inline eklenen işlemi silmek istiyor musun?`)) return;
    setRollbacking(true);
    try {
      await api.delete(`/closings/sessions/${sessionId}`);
      setSessionTxCount(0);
      await refreshSections(false);
      triggerRefresh();
      toast.success("Kapanış oturumu temizlendi");
    } catch (err) {
      toast.error(err);
    } finally {
      setRollbacking(false);
    }
  }

  function handleQuickAddCreated() {
    // Success toast modal içinde basıldı; burada tekrar etmiyoruz.
    setQuickAddSection(null);
    setSessionTxCount((c) => c + 1);
    void refreshSections(false);
    triggerRefresh();
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-24">
      <PageHeader
        title={`Gün Kapanışı — ${closureDate}`}
        icon={CalendarCheck}
        subtitle={
          isPast ? "Geçmiş tarih (read-only)"
          : alreadyClosed ? "Bu gün kapatıldı"
          : undefined
        }
        fallbackHref="/dashboard/closures"
        actions={
          <Link
            href="/dashboard/closures"
            className="text-xs text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))] transition-colors"
          >
            ← Tümü
          </Link>
        }
      />

      {businesses.length > 1 && (
        <div className="v2-card p-3">
          <label className="text-[10px] uppercase text-[rgb(var(--v2-muted))] mb-1 block">İşletme</label>
          <select
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className="field field-sm py-2"
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* WP 08617251: session indicator banner — inline tx eklemeden sonra görünür */}
      {sessionTxCount > 0 && !isReadOnly && (
        <div className="v2-card p-3 border-amber-500/40 bg-amber-500/[0.06] flex items-center gap-3">
          <Zap size={16} className="text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-amber-700 dark:text-amber-200">
              Bu kapanışta <strong>{sessionTxCount}</strong> yeni işlem eklendi —
              kapanışı tamamladığında kalıcı olur.
            </p>
            <p className="text-[10px] text-amber-600/70 dark:text-amber-300/70 mt-0.5">
              Sayfayı kapatırsan tarayıcı uyarısı çıkar; onaylarsan eklenenler otomatik silinir.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRollbackSession}
            disabled={rollbacking}
            className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-700 dark:text-rose-300 text-xs font-medium border border-rose-500/40 inline-flex items-center gap-1 disabled:opacity-50"
          >
            {rollbacking ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            Vazgeç & Hepsini Sil
          </button>
        </div>
      )}

      {loading ? (
        <ListSkeleton rows={5} />
      ) : !sectioned ? (
        <div className="v2-card p-6 text-center text-sm text-status-danger">
          Veri yüklenemedi.
        </div>
      ) : (
        <>
          {/* BÖLÜM A: POS (gelir + gider ayrı) */}
          <Section title="POS İşlemleri" icon={CreditCard} count={sectioned.pos.grand_count} total={sectioned.pos.grand_total} color="blue"
            action={!isReadOnly && <AddBtn label="+ POS İşlemi" color="blue" onClick={() => setQuickAddSection("pos")} />}>
            {/* Gelir bloğu — sub-cash gruplu */}
            {sectioned.pos.income.grand_count > 0 && (
              <>
                <div className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold flex items-center justify-between border-b border-emerald-500/30 pb-1.5">
                  <span>POS Gelir</span>
                  <span>{sectioned.pos.income.grand_count} işlem · {formatCurrency(sectioned.pos.income.grand_total, "TRY")}</span>
                </div>
                {sectioned.pos.income.groups.map((g, i) => (
                  <GroupCard key={`inc-${i}`} title={g.sub_cash_name} count={g.tx_count} total={g.total}>
                    <TxList txs={g.tx_list} />
                  </GroupCard>
                ))}
              </>
            )}
            {/* Gider bloğu — nakit/transfer alt-gruplu */}
            {sectioned.pos.expense.grand_count > 0 && (
              <>
                <div className="text-[11px] uppercase tracking-wider text-rose-400 font-semibold flex items-center justify-between border-b border-rose-500/30 pb-1.5 mt-2">
                  <span>POS Gider</span>
                  <span>{sectioned.pos.expense.grand_count} işlem · {formatCurrency(sectioned.pos.expense.grand_total, "TRY")}</span>
                </div>
                {sectioned.pos.expense.nakit.count > 0 && (
                  <GroupCard title="Nakit" count={sectioned.pos.expense.nakit.count} total={sectioned.pos.expense.nakit.total}>
                    <TxList txs={sectioned.pos.expense.nakit.list} />
                  </GroupCard>
                )}
                {sectioned.pos.expense.transfer.count > 0 && (
                  <GroupCard title="Transfer" count={sectioned.pos.expense.transfer.count} total={sectioned.pos.expense.transfer.total}>
                    <TxList txs={sectioned.pos.expense.transfer.list} />
                  </GroupCard>
                )}
              </>
            )}
            {sectioned.pos.grand_count === 0 && (
              <Empty msg="Bu gün POS işlemi yok." />
            )}
            {/* Genel toplam + net fark */}
            {sectioned.pos.grand_count > 0 && (
              <div className="rounded-xl border-2 border-accent/40 bg-accent/10 px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-600 dark:text-emerald-300 font-medium">+ Gelir</span>
                  <span className="text-emerald-600 dark:text-emerald-300 font-mono">{formatCurrency(sectioned.pos.income.grand_total, "TRY")}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-rose-600 dark:text-rose-300 font-medium">− Gider</span>
                  <span className="text-rose-600 dark:text-rose-300 font-mono">−{formatCurrency(sectioned.pos.expense.grand_total, "TRY")}</span>
                </div>
                <div className="border-t border-accent/30 pt-1 flex items-center justify-between text-sm font-bold">
                  <span className="text-accent">POS NET</span>
                  <span className={cn("font-mono", sectioned.pos.net >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>
                    {sectioned.pos.net >= 0 ? "" : "−"}{formatCurrency(Math.abs(sectioned.pos.net), "TRY")}
                  </span>
                </div>
              </div>
            )}
          </Section>

          {/* BÖLÜM B: Transferler */}
          <Section title="Transferler" icon={ArrowLeftRight} color="purple"
            count={sectioned.transfers.outgoing_external.count + sectioned.transfers.internal.count + sectioned.transfers.incoming_external.count}
            action={!isReadOnly && (
              <div className="flex gap-1">
                <AddBtn label="+ Giden" color="rose" onClick={() => setQuickAddSection("outgoing")} />
                <AddBtn label="+ Gelen" color="emerald" onClick={() => setQuickAddSection("incoming")} />
              </div>
            )}>
            <GroupCard title="Dışarı Giden" count={sectioned.transfers.outgoing_external.count} total={sectioned.transfers.outgoing_external.total}>
              <TxList txs={sectioned.transfers.outgoing_external.list} />
            </GroupCard>
            <GroupCard title="İçeride Yapılan" count={sectioned.transfers.internal.count} total={sectioned.transfers.internal.total}>
              <TxList txs={sectioned.transfers.internal.list} />
            </GroupCard>
            <GroupCard title="Gelen Havaleler" count={sectioned.transfers.incoming_external.count} total={sectioned.transfers.incoming_external.total}>
              <TxList txs={sectioned.transfers.incoming_external.list} />
            </GroupCard>
          </Section>

          {/* BÖLÜM C: Cash Withdrawals */}
          <Section title="Hesaptan Para Çekme" icon={Banknote} color="amber"
            count={sectioned.cash_withdrawals.count} total={sectioned.cash_withdrawals.total}
            action={!isReadOnly && <AddBtn label="+ Para Çekme" color="amber" onClick={() => setQuickAddSection("withdrawal")} />}>
            {sectioned.cash_withdrawals.count === 0 ? (
              <Empty msg="Bu gün hesaptan para çekme yok." />
            ) : (
              <TxList txs={sectioned.cash_withdrawals.list} />
            )}
          </Section>

          {/* BÖLÜM D: Debt hareketleri — inline add desteklenmez (debt create farklı flow) */}
          <Section title="Borç / Alacak Hareketleri" icon={FileText} color="indigo">
            <GroupCard title="Yeni Alacaklar" count={sectioned.debts.new_receivables.count} total={sectioned.debts.new_receivables.total}>
              {sectioned.debts.new_receivables.list.length === 0 ? <Empty msg="—" /> : (
                <ul className="divide-y divide-[rgb(var(--v2-border))]">
                  {sectioned.debts.new_receivables.list.map((d) => (
                    <li key={d.id} className="px-3 py-2 text-xs flex items-center justify-between">
                      <span className="text-[rgb(var(--v2-ink))]">{d.counterparty}</span>
                      <span className="text-emerald-600 dark:text-emerald-300 font-medium">+{formatCurrency(d.amount, "TRY")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </GroupCard>
            <GroupCard title="Yeni Verecekler" count={sectioned.debts.new_payables.count} total={sectioned.debts.new_payables.total}>
              {sectioned.debts.new_payables.list.length === 0 ? <Empty msg="—" /> : (
                <ul className="divide-y divide-[rgb(var(--v2-border))]">
                  {sectioned.debts.new_payables.list.map((d) => (
                    <li key={d.id} className="px-3 py-2 text-xs flex items-center justify-between">
                      <span className="text-[rgb(var(--v2-ink))]">{d.counterparty}</span>
                      <span className="text-rose-600 dark:text-rose-300 font-medium">−{formatCurrency(d.amount, "TRY")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </GroupCard>
          </Section>

          {/* BÖLÜM E: Harcamalar (sadece NAKIT, nakit/transfer alt-gruplu) */}
          <Section title="Harcamalar" icon={TrendingDown} color="rose"
            count={sectioned.expenses.grand_count} total={sectioned.expenses.grand_total}
            action={!isReadOnly && <AddBtn label="+ Harcama" color="rose" onClick={() => setQuickAddSection("expense")} />}>
            {sectioned.expenses.grand_count === 0 ? (
              <Empty msg="Bu gün nakit harcama yok." />
            ) : (
              <>
                {sectioned.expenses.nakit.count > 0 && (
                  <GroupCard title="Nakit" count={sectioned.expenses.nakit.count} total={sectioned.expenses.nakit.total}>
                    <TxList txs={sectioned.expenses.nakit.list} />
                  </GroupCard>
                )}
                {sectioned.expenses.transfer.count > 0 && (
                  <GroupCard title="Transfer" count={sectioned.expenses.transfer.count} total={sectioned.expenses.transfer.total}>
                    <TxList txs={sectioned.expenses.transfer.list} />
                  </GroupCard>
                )}
              </>
            )}
          </Section>

          {/* SUMMARY */}
          <section className="v2-card p-5 space-y-3">
            <h2 className="text-sm font-bold text-[rgb(var(--v2-ink))] flex items-center gap-2">
              <BarChart3 size={14} className="text-accent" />
              Gün Özeti
            </h2>
            <div className="space-y-1.5 text-xs">
              <Row label="Açılış Bakiyesi" value={opening} />
              <Row label="+ POS Hacmi" value={sectioned.pos.grand_total} colorClass="text-emerald-600 dark:text-emerald-300" />
              <Row label="+ Gelen Havale" value={sectioned.transfers.incoming_external.total} colorClass="text-emerald-600 dark:text-emerald-300" />
              <Row label="− Dışarı Giden" value={sectioned.transfers.outgoing_external.total} colorClass="text-rose-600 dark:text-rose-300" prefix="−" />
              <Row label="− Harcamalar" value={sectioned.expenses.grand_total} colorClass="text-rose-600 dark:text-rose-300" prefix="−" />
              <Row label="± İç Transfer (net 0)" value={0} colorClass="text-[rgb(var(--v2-muted))]" />
              <div className="border-t border-[rgb(var(--v2-border))] pt-2 mt-2 flex justify-between font-bold text-sm">
                <span className="text-[rgb(var(--v2-ink))]">Hesaplanan Kapanış</span>
                <span className="text-emerald-600 dark:text-emerald-300">{formatCurrency(computed, "TRY")}</span>
              </div>
            </div>

            {!isReadOnly && (
              <form onSubmit={saveClosure} className="space-y-3 pt-3 border-t border-[rgb(var(--v2-border))]">
                <div>
                  <label className="text-[10px] uppercase text-[rgb(var(--v2-muted))] mb-1 block">Fiili Bakiye</label>
                  <input
                    type="number"
                    step="0.01"
                    value={actualBalanceStr}
                    onChange={(e) => setActualBalanceStr(e.target.value)}
                    className="field-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-[rgb(var(--v2-muted))] mb-1 block">Açıklama (opsiyonel)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="field-sm"
                  />
                </div>
                {error && (
                  <div className="p-2 rounded-lg bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs flex items-start gap-2">
                    <AlertTriangle size={12} className="mt-0.5" /> {error}
                  </div>
                )}
                {success && (
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 size={12} /> {success}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={savingClose}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {savingClose && <Loader2 size={14} className="animate-spin" />}
                  Kapanışı Kaydet
                </button>
              </form>
            )}
            {isReadOnly && (
              <div className="pt-3 border-t border-[rgb(var(--v2-border))] text-center text-xs text-[rgb(var(--v2-muted))]">
                {alreadyClosed ? "Bu gün kapatıldı — read-only." : "Geçmiş tarih — read-only."}
              </div>
            )}
          </section>
        </>
      )}

      {/* WP 08617251: inline tx ekleme modal — section seçildiğinde açılır */}
      {quickAddSection && businessId && (
        <ClosureQuickAddModal
          section={quickAddSection}
          businessId={businessId}
          closureSessionId={sessionId}
          onClose={() => setQuickAddSection(null)}
          onCreated={handleQuickAddCreated}
        />
      )}
    </div>
  );
}

// ─────────── small components ───────────

/** WP 08617251: section header'ında inline tx ekleme butonu. */
function AddBtn({ label, color, onClick }: {
  label: string;
  color: string;
  onClick: () => void;
}) {
  const colorMap: Record<string, string> = {
    blue:    "bg-accent/10 hover:bg-accent/20 text-accent border-accent/40",
    rose:    "bg-rose-600/20 hover:bg-rose-600/30 text-rose-700 dark:text-rose-300 border-rose-500/40",
    emerald: "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
    amber:   "bg-amber-600/20 hover:bg-amber-600/30 text-amber-700 dark:text-amber-300 border-amber-500/40",
    indigo:  "bg-accent/10 hover:bg-accent/20 text-accent border-accent/40",
  };
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        "text-[10px] px-2 py-1 rounded-md border font-medium inline-flex items-center gap-1 shrink-0",
        colorMap[color] || colorMap.blue,
      )}
    >
      <Plus size={10} /> {label}
    </button>
  );
}

function Section({ title, icon: Icon, color, count, total, action, children }: {
  title: string;
  icon: typeof CreditCard;
  color: string;
  count?: number;
  total?: number;
  /** WP 08617251: header sağında inline aksiyon (+ İşlem Ekle butonu). */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const colorMap: Record<string, string> = {
    blue: "text-accent",
    purple: "text-accent",
    amber: "text-amber-600 dark:text-amber-400",
    indigo: "text-accent",
    rose: "text-rose-600 dark:text-rose-400",
  };
  return (
    <section className="v2-card overflow-hidden">
      <div className="w-full px-4 py-3 border-b border-[rgb(var(--v2-border))] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-left flex-1 hover:opacity-80"
        >
          <Icon size={16} className={colorMap[color]} />
          <div>
            <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))]">{title}</h2>
            {count != null && (
              <p className="text-[10px] text-[rgb(var(--v2-muted))]">
                {count} işlem
                {total != null && total > 0 && <> · {formatCurrency(total, "TRY")}</>}
              </p>
            )}
          </div>
        </button>
        <div className="flex items-center gap-1.5">
          {action}
          {open ? <ChevronUp size={14} className="text-[rgb(var(--v2-muted))]" /> : <ChevronDown size={14} className="text-[rgb(var(--v2-muted))]" />}
        </div>
      </div>
      {open && <div className="p-3 space-y-3">{children}</div>}
    </section>
  );
}

function GroupCard({ title, count, total, children }: {
  title: string;
  count: number;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[rgb(var(--v2-border))] overflow-hidden">
      <div className="px-3 py-2 bg-[rgb(var(--v2-sunken))] flex items-center justify-between">
        <span className="text-xs font-semibold text-[rgb(var(--v2-ink))]">{title}</span>
        <span className="text-[11px] text-[rgb(var(--v2-muted))]">
          {count} · {formatCurrency(total, "TRY")}
        </span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function TxList({ txs }: { txs: TxSummary[] }) {
  if (txs.length === 0) return <Empty msg="—" />;
  return (
    <ul className="divide-y divide-[rgb(var(--v2-border))]">
      {txs.map((t) => (
        <li key={t.id} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[rgb(var(--v2-ink))] truncate">
              {t.description || "—"}
            </p>
            <p className="text-[10px] text-[rgb(var(--v2-muted))] truncate">
              {t.payment_method}
              {t.pos_device_name && ` · ${t.pos_device_name}`}
              {t.counterpart_name && ` · ${t.counterpart_name}`}
              {t.bank_account_name && ` · ${t.bank_account_name}`}
            </p>
          </div>
          <span className={cn(
            "font-medium shrink-0",
            t.direction === "INCOME" ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300",
          )}>
            {t.direction === "INCOME" ? "+" : "−"}{formatCurrency(t.amount, "TRY")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function GrandRow({ label, count, total }: { label: string; count: number; total: number }) {
  return (
    <div className="rounded-xl border-2 border-accent/40 bg-accent/10 px-3 py-2.5 flex items-center justify-between">
      <span className="text-xs font-bold text-accent">{label}</span>
      <span className="text-sm font-bold text-[rgb(var(--v2-ink))]">
        {count} işlem · {formatCurrency(total, "TRY")}
      </span>
    </div>
  );
}

function Row({ label, value, colorClass, prefix }: {
  label: string;
  value: number;
  colorClass?: string;
  prefix?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-[rgb(var(--v2-muted))]">{label}</span>
      <span className={cn("font-mono", colorClass || "text-[rgb(var(--v2-ink))]")}>
        {prefix || ""}{formatCurrency(Math.abs(value), "TRY")}
      </span>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="px-3 py-3 text-[11px] text-[rgb(var(--v2-muted))] italic">{msg}</p>;
}

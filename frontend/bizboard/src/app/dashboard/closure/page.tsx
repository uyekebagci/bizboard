"use client";

/**
 * Beta v1.1: /dashboard/closure — Gün Kapanışı sayfası.
 *
 * <p>5 ana section: POS by sub-cash, Transfers, Cash Withdrawals,
 * Debt hareketleri, Expenses + Summary. Aynı sayfa /closure/[date]
 * route üzerinden geçmiş tarih için read-only.</p>
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp,
  CreditCard, ArrowLeftRight, Banknote, FileText, TrendingDown, BarChart3,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

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
    groups: Array<{ sub_cash_id: string | null; sub_cash_name: string; tx_list: TxSummary[]; tx_count: number; total: number }>;
    grand_total: number;
    grand_count: number;
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
  expenses: { list: TxSummary[]; count: number; total: number };
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

  useEffect(() => {
    api.get<Array<{ id: string; name: string }>>("/businesses")
      .then((bs) => {
        setBusinesses(bs || []);
        if (!businessId && bs && bs.length > 0) setBusinessId(bs[0].id);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    Promise.all([
      api.get<SectionedClosure>(
        `/closings/sectioned?business_id=${businessId}&date=${closureDate}`,
      ).catch((err) => {
        logger.error("api", "sectioned closure fetch failed", { businessId, date: closureDate }, err);
        return null;
      }),
      api.get<PreviewBasic>(`/closings/preview?business_id=${businessId}`).catch(() => null),
    ])
      .then(([s, b]) => {
        setSectioned(s);
        setBasic(b);
        if (b && actualBalanceStr === "") {
          setActualBalanceStr(String(b.computed_closing));
        }
      })
      .finally(() => setLoading(false));
  }, [businessId, closureDate]); // eslint-disable-line react-hooks/exhaustive-deps

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
      });
      triggerRefresh();
      setSuccess("Kapanış başarıyla kaydedildi.");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kapanış kaydedilemedi");
    } finally {
      setSavingClose(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
          >
            <ArrowLeft size={20} className="text-surface-300" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white truncate">
              Gün Kapanışı — {closureDate}
            </h1>
            {isPast && (
              <p className="text-[11px] text-amber-300">Geçmiş tarih (read-only)</p>
            )}
            {alreadyClosed && (
              <p className="text-[11px] text-emerald-300">Bu gün kapatıldı</p>
            )}
          </div>
        </div>
        <Link href="/dashboard/closures" className="text-xs text-surface-400 hover:text-surface-200">
          ← Tümü
        </Link>
      </div>

      {businesses.length > 1 && (
        <div className="card p-3">
          <label className="text-[10px] uppercase text-surface-400 mb-1 block">İşletme</label>
          <select
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-600 text-white text-sm"
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-surface-500" />
        </div>
      ) : !sectioned ? (
        <div className="card p-6 text-center text-sm text-red-300">
          Veri yüklenemedi.
        </div>
      ) : (
        <>
          {/* BÖLÜM A: POS */}
          <Section title="POS İşlemleri" icon={CreditCard} count={sectioned.pos.grand_count} total={sectioned.pos.grand_total} color="blue">
            {sectioned.pos.groups.length === 0 ? (
              <Empty msg="Bu gün POS işlemi yok." />
            ) : (
              sectioned.pos.groups.map((g, i) => (
                <GroupCard key={i} title={g.sub_cash_name} count={g.tx_count} total={g.total}>
                  <TxList txs={g.tx_list} />
                </GroupCard>
              ))
            )}
            <GrandRow label="GENEL POS TOPLAMI" count={sectioned.pos.grand_count} total={sectioned.pos.grand_total} />
          </Section>

          {/* BÖLÜM B: Transferler */}
          <Section title="Transferler" icon={ArrowLeftRight} color="purple"
            count={sectioned.transfers.outgoing_external.count + sectioned.transfers.internal.count + sectioned.transfers.incoming_external.count}>
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
            count={sectioned.cash_withdrawals.count} total={sectioned.cash_withdrawals.total}>
            {sectioned.cash_withdrawals.count === 0 ? (
              <Empty msg="Bu gün hesaptan para çekme yok." />
            ) : (
              <TxList txs={sectioned.cash_withdrawals.list} />
            )}
          </Section>

          {/* BÖLÜM D: Debt hareketleri */}
          <Section title="Borç / Alacak Hareketleri" icon={FileText} color="indigo">
            <GroupCard title="Yeni Alacaklar" count={sectioned.debts.new_receivables.count} total={sectioned.debts.new_receivables.total}>
              {sectioned.debts.new_receivables.list.length === 0 ? <Empty msg="—" /> : (
                <ul className="divide-y divide-surface-700">
                  {sectioned.debts.new_receivables.list.map((d) => (
                    <li key={d.id} className="px-3 py-2 text-xs flex items-center justify-between">
                      <span className="text-surface-200">{d.counterparty}</span>
                      <span className="text-emerald-300 font-medium">+{formatCurrency(d.amount, "TRY")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </GroupCard>
            <GroupCard title="Yeni Verecekler" count={sectioned.debts.new_payables.count} total={sectioned.debts.new_payables.total}>
              {sectioned.debts.new_payables.list.length === 0 ? <Empty msg="—" /> : (
                <ul className="divide-y divide-surface-700">
                  {sectioned.debts.new_payables.list.map((d) => (
                    <li key={d.id} className="px-3 py-2 text-xs flex items-center justify-between">
                      <span className="text-surface-200">{d.counterparty}</span>
                      <span className="text-rose-300 font-medium">−{formatCurrency(d.amount, "TRY")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </GroupCard>
          </Section>

          {/* BÖLÜM E: Expenses */}
          <Section title="Harcamalar" icon={TrendingDown} color="rose"
            count={sectioned.expenses.count} total={sectioned.expenses.total}>
            {sectioned.expenses.count === 0 ? (
              <Empty msg="Bu gün non-HESAPDAN harcama yok." />
            ) : (
              <TxList txs={sectioned.expenses.list} />
            )}
          </Section>

          {/* SUMMARY */}
          <section className="card p-5 space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart3 size={14} className="text-emerald-400" />
              Gün Özeti
            </h2>
            <div className="space-y-1.5 text-xs">
              <Row label="Açılış Bakiyesi" value={opening} />
              <Row label="+ POS Hacmi" value={sectioned.pos.grand_total} colorClass="text-emerald-300" />
              <Row label="+ Gelen Havale" value={sectioned.transfers.incoming_external.total} colorClass="text-emerald-300" />
              <Row label="− Dışarı Giden" value={sectioned.transfers.outgoing_external.total} colorClass="text-rose-300" prefix="−" />
              <Row label="− Harcamalar" value={sectioned.expenses.total} colorClass="text-rose-300" prefix="−" />
              <Row label="± İç Transfer (net 0)" value={0} colorClass="text-surface-500" />
              <div className="border-t border-surface-700 pt-2 mt-2 flex justify-between font-bold text-sm">
                <span className="text-white">Hesaplanan Kapanış</span>
                <span className="text-emerald-300">{formatCurrency(computed, "TRY")}</span>
              </div>
            </div>

            {!isReadOnly && (
              <form onSubmit={saveClosure} className="space-y-3 pt-3 border-t border-surface-700">
                <div>
                  <label className="text-[10px] uppercase text-surface-400 mb-1 block">Fiili Bakiye</label>
                  <input
                    type="number"
                    step="0.01"
                    value={actualBalanceStr}
                    onChange={(e) => setActualBalanceStr(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-surface-400 mb-1 block">Açıklama (opsiyonel)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                {error && (
                  <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
                    <AlertTriangle size={12} className="mt-0.5" /> {error}
                  </div>
                )}
                {success && (
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
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
              <div className="pt-3 border-t border-surface-700 text-center text-xs text-surface-400">
                {alreadyClosed ? "Bu gün kapatıldı — read-only." : "Geçmiş tarih — read-only."}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ─────────── small components ───────────

function Section({ title, icon: Icon, color, count, total, children }: {
  title: string;
  icon: typeof CreditCard;
  color: string;
  count?: number;
  total?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const colorMap: Record<string, string> = {
    blue: "text-blue-400",
    purple: "text-purple-400",
    amber: "text-amber-400",
    indigo: "text-indigo-400",
    rose: "text-rose-400",
  };
  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 border-b border-surface-700 flex items-center justify-between hover:bg-surface-700/30"
      >
        <div className="flex items-center gap-2 text-left">
          <Icon size={16} className={colorMap[color]} />
          <div>
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            {count != null && (
              <p className="text-[10px] text-surface-400">
                {count} işlem
                {total != null && total > 0 && <> · {formatCurrency(total, "TRY")}</>}
              </p>
            )}
          </div>
        </div>
        {open ? <ChevronUp size={14} className="text-surface-400" /> : <ChevronDown size={14} className="text-surface-400" />}
      </button>
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
    <div className="rounded-xl border border-surface-700 overflow-hidden">
      <div className="px-3 py-2 bg-surface-700/40 flex items-center justify-between">
        <span className="text-xs font-semibold text-surface-200">{title}</span>
        <span className="text-[11px] text-surface-300">
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
    <ul className="divide-y divide-surface-700">
      {txs.map((t) => (
        <li key={t.id} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-surface-200 truncate">
              {t.description || "—"}
            </p>
            <p className="text-[10px] text-surface-500 truncate">
              {t.payment_method}
              {t.pos_device_name && ` · ${t.pos_device_name}`}
              {t.counterpart_name && ` · ${t.counterpart_name}`}
              {t.bank_account_name && ` · ${t.bank_account_name}`}
            </p>
          </div>
          <span className={cn(
            "font-medium shrink-0",
            t.direction === "INCOME" ? "text-emerald-300" : "text-rose-300",
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
    <div className="rounded-xl border-2 border-blue-500/40 bg-blue-500/10 px-3 py-2.5 flex items-center justify-between">
      <span className="text-xs font-bold text-blue-200">{label}</span>
      <span className="text-sm font-bold text-blue-100">
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
      <span className="text-surface-400">{label}</span>
      <span className={cn("font-mono", colorClass || "text-surface-200")}>
        {prefix || ""}{formatCurrency(Math.abs(value), "TRY")}
      </span>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="px-3 py-3 text-[11px] text-surface-500 italic">{msg}</p>;
}

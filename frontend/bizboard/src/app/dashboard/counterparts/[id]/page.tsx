"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft, Phone, Mail, MapPin, Calendar, RefreshCw,
  TrendingUp, TrendingDown, FileText, Printer,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import { formatCurrency, cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import type { Counterpart, CounterpartStatement, CounterpartRole } from "@/types";

const ROLE_LABEL: Record<CounterpartRole, string> = {
  CUSTOMER: "Musteri",
  SUPPLIER: "Tedarikci",
  BOTH: "Her ikisi",
  OTHER: "Diger",
};

const ROLE_BADGE: Record<CounterpartRole, string> = {
  CUSTOMER: "bg-green-500/20 text-green-400",
  SUPPLIER: "bg-blue-500/20 text-blue-400",
  BOTH: "bg-purple-500/20 text-purple-400",
  OTHER: "bg-surface-600/40 text-surface-300",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthAgoISO(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(iso: string | null): string {
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
  const { profile } = useAppStore();
  const isAdmin = profile?.role === "admin";

  const [cp, setCp] = useState<Counterpart | null>(null);
  const [statement, setStatement] = useState<CounterpartStatement | null>(null);
  const [from, setFrom] = useState<string>(monthAgoISO());
  const [to, setTo] = useState<string>(todayISO());
  const [loading, setLoading] = useState(true);
  const [stmLoading, setStmLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  // İlk yükleme — counterpart kendisi + ilk ekstre çağrısı
  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const c = await api.get<Counterpart>(`/counterparts/${id}`);
        setCp(c);
        setError(null);
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function fetchStatement() {
    if (!id) return;
    setStmLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.append("from", from);
      if (to) qs.append("to", to);
      const s = await api.get<CounterpartStatement>(
        `/counterparts/${id}/statement${qs.toString() ? "?" + qs.toString() : ""}`
      );
      setStatement(s);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setStmLoading(false);
    }
  }

  useEffect(() => {
    if (cp) fetchStatement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cp]);

  async function handleRecompute() {
    if (!id) return;
    setRecomputing(true);
    try {
      await api.post(`/admin/counterparts/${id}/recompute`, {});
      // counterpart + statement yenile
      const c = await api.get<Counterpart>(`/counterparts/${id}`);
      setCp(c);
      await fetchStatement();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setRecomputing(false);
    }
  }

  if (loading) {
    return <div className="text-surface-400 text-sm">Yukleniyor...</div>;
  }
  if (!cp) {
    return (
      <div className="card p-8 text-center text-surface-400">
        {error || "Karsi firma bulunamadi"}
      </div>
    );
  }

  const balance = cp.current_balance ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="flex items-center gap-3">
        <button
          onClick={() => router.push("/dashboard/counterparts")}
          className="p-2 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white truncate">{cp.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded", ROLE_BADGE[cp.role])}>
              {ROLE_LABEL[cp.role]}
            </span>
            {cp.tax_id && <span className="text-[11px] text-surface-400">{cp.tax_id}</span>}
            {cp.payment_terms_days > 0 && (
              <span className="text-[11px] text-surface-400">
                Vade: {cp.payment_terms_days} gun
              </span>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Balance + meta */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-1">
          <p className="text-xs text-surface-400 mb-1">Guncel Bakiye</p>
          <p
            className={cn(
              "text-3xl font-bold",
              balance > 0 ? "text-green-400" : balance < 0 ? "text-red-400" : "text-white"
            )}
          >
            {formatCurrency(balance)}
          </p>
          <p className="text-[11px] text-surface-500 mt-2">
            {balance > 0 && "Firma bize borclu (alacak)"}
            {balance < 0 && "Biz firmaya borcluyuz (verecek)"}
            {balance === 0 && "Cari kapali"}
          </p>
          {isAdmin && (
            <button
              onClick={handleRecompute}
              disabled={recomputing}
              className="mt-3 flex items-center gap-2 text-xs text-brand-400 hover:text-brand-300 disabled:opacity-50"
            >
              <RefreshCw size={12} className={recomputing ? "animate-spin" : ""} />
              {recomputing ? "Hesaplaniyor..." : "Yeniden Hesapla"}
            </button>
          )}
        </div>

        <div className="card p-5 lg:col-span-2 space-y-3 text-sm">
          {cp.contact_name && (
            <div className="flex items-center gap-3 text-surface-300">
              <span className="text-surface-500 text-xs w-20 shrink-0">Yetkili</span>
              <span>{cp.contact_name}</span>
            </div>
          )}
          {cp.contact_phone && (
            <div className="flex items-center gap-3 text-surface-300">
              <Phone size={14} className="text-surface-500" />
              <a href={`tel:${cp.contact_phone}`} className="hover:text-brand-400">
                {cp.contact_phone}
              </a>
            </div>
          )}
          {cp.contact_email && (
            <div className="flex items-center gap-3 text-surface-300">
              <Mail size={14} className="text-surface-500" />
              <a href={`mailto:${cp.contact_email}`} className="hover:text-brand-400">
                {cp.contact_email}
              </a>
            </div>
          )}
          {cp.tax_office && (
            <div className="flex items-center gap-3 text-surface-300">
              <FileText size={14} className="text-surface-500" />
              <span>Vergi dairesi: {cp.tax_office}</span>
            </div>
          )}
          {cp.address && (
            <div className="flex items-start gap-3 text-surface-300">
              <MapPin size={14} className="text-surface-500 mt-0.5" />
              <span className="whitespace-pre-line">{cp.address}</span>
            </div>
          )}
          {cp.notes && (
            <div className="pt-3 border-t border-surface-700 text-surface-400 text-xs whitespace-pre-line">
              {cp.notes}
            </div>
          )}
        </div>
      </section>

      {/* Statement */}
      <section className="card overflow-hidden">
        <div className="p-4 border-b border-surface-700 flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between print:hidden">
          <div>
            <h2 className="text-lg font-semibold text-white">Cari Hesap Ekstresi</h2>
            <p className="text-xs text-surface-400">Donem hareketleri + acilis/kapanis bakiyesi</p>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col">
              <label className="text-[10px] text-surface-400 mb-1">Baslangic</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-surface-700/50 border border-surface-600 text-white text-xs"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] text-surface-400 mb-1">Bitis</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-surface-700/50 border border-surface-600 text-white text-xs"
              />
            </div>
            <button
              onClick={fetchStatement}
              disabled={stmLoading}
              className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2"
            >
              <Calendar size={12} />
              {stmLoading ? "Yukleniyor..." : "Uygula"}
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-200 text-xs font-semibold flex items-center gap-2"
              title="Yazdir / PDF olarak kaydet"
            >
              <Printer size={12} />
              Yazdir
            </button>
          </div>
        </div>

        {/* Opening/closing summary */}
        {statement && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-surface-700">
            <SummaryCell label="Acilis" value={statement.opening_balance} />
            <SummaryCell label="Toplam Alacak" value={statement.total_receivable} positive />
            <SummaryCell label="Toplam Borc" value={statement.total_payable} negative />
            <SummaryCell label="Kapanis" value={statement.closing_balance} />
          </div>
        )}

        {/* Entries table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-800/50 text-surface-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Tarih</th>
                <th className="text-left px-4 py-2 font-medium">Aciklama</th>
                <th className="text-left px-4 py-2 font-medium">Isletme</th>
                <th className="text-right px-4 py-2 font-medium">Tutar</th>
                <th className="text-right px-4 py-2 font-medium">Bakiye</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-700">
              {!statement || statement.entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-surface-400 text-xs">
                    Bu donemde hareket yok.
                  </td>
                </tr>
              ) : (
                statement.entries.map((e) => {
                  const isReceivable = e.direction === "RECEIVABLE";
                  return (
                    <tr key={e.debt_id} className={cn("hover:bg-surface-800/50", e.settled && "opacity-60")}>
                      <td className="px-4 py-2 text-surface-300 whitespace-nowrap text-xs">
                        {formatDateTime(e.created_at)}
                      </td>
                      <td className="px-4 py-2 text-surface-200">
                        <div className="flex items-center gap-2">
                          {isReceivable
                            ? <TrendingUp size={12} className="text-green-400" />
                            : <TrendingDown size={12} className="text-red-400" />}
                          <span className="truncate max-w-[200px]">
                            {e.description || `${e.instrument_type} (${isReceivable ? "Alacak" : "Borc"})`}
                          </span>
                          {e.settled && (
                            <span className="text-[9px] uppercase tracking-wide text-surface-500 px-1.5 py-0.5 rounded bg-surface-700">
                              Kapali
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-surface-400 text-xs whitespace-nowrap">
                        {e.business_name || "—"}
                      </td>
                      <td className={cn(
                        "px-4 py-2 text-right font-semibold whitespace-nowrap",
                        isReceivable ? "text-green-400" : "text-red-400"
                      )}>
                        {isReceivable ? "+" : "−"}{formatCurrency(Math.abs(e.amount))}
                      </td>
                      <td className="px-4 py-2 text-right text-surface-200 font-medium whitespace-nowrap">
                        {formatCurrency(e.running_balance)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCell({
  label, value, positive, negative,
}: { label: string; value: number; positive?: boolean; negative?: boolean }) {
  const color = positive ? "text-green-400" : negative ? "text-red-400" : value > 0 ? "text-green-400" : value < 0 ? "text-red-400" : "text-white";
  return (
    <div className="bg-surface-800 p-4">
      <p className="text-[10px] text-surface-400 uppercase tracking-wide">{label}</p>
      <p className={cn("text-sm font-bold mt-1", color)}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

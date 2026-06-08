"use client";

/**
 * v1.7.x (UI Fix WP 8b961444 TODO 1d5d526b): Verecekler sayfası —
 * Alacaklar'ın muadili. PAYABLE direction'lı debt'leri counterpart bazlı
 * agregate eder.
 *
 * <p>Veri: GET /debts (user-scoped) + client-side filtre direction=PAYABLE
 * ve settled=false. Counterpart bazlı grupla; tutar DESC default sıralama.</p>
 *
 * <p>"+ Verecek Ekle" butonu CounterpartDebtModal'ı direction=PAYABLE
 * ile açar.</p>
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, HandCoins, Plus, CalendarClock, Eye, EyeOff,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { formatCurrency, cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { Debt, Counterpart } from "@/types";
import { CounterpartDebtModal } from "@/components/debts/CounterpartDebtModal";

type SortMode = "amount_desc" | "due_asc" | "name_asc";

interface PayableAggregate {
  counterpart_id: string | null;
  counterpart_name: string;
  total_amount: number;
  currency: string;
  last_due_date: string | null;
  count: number;
}

export default function VereceklerPage() {
  const router = useRouter();
  const { refreshKey } = useAppStore();
  const [rows, setRows] = useState<PayableAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("amount_desc");
  const [showAddModal, setShowAddModal] = useState(false);
  // Sansür (privacy) — alacaklar ile aynı: ayrı localStorage anahtarı.
  const [censored, setCensored] = useState(false);
  useEffect(() => {
    try { setCensored(localStorage.getItem("cati-verecekler-censor") === "1"); } catch { /* ignore */ }
  }, []);
  function toggleCensor() {
    setCensored((prev) => {
      const next = !prev;
      try { localStorage.setItem("cati-verecekler-censor", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }
  const censorCls = censored ? "blur-[6px] select-none" : "";

  useEffect(() => {
    async function load() {
      try {
        // v1.7.x net-balance: PAYABLE debt'leri counterpart bazlı grupla,
        // sonra counterpart entity'sinin current_balance'ı ile NET'le.
        // current_balance < 0 ise (= net borçluyuz) bu counterpart'ı göster,
        // abs(balance) tutar olarak. RECEIVABLE varsa zaten karşılıklı düşülmüş olur.
        const [debts, allCps] = await Promise.all([
          api.get<Debt[]>("/debts").catch(() => [] as Debt[]),
          api.get<Counterpart[]>("/counterparts").catch(() => [] as Counterpart[]),
        ]);
        const balanceById = new Map<string, number>();
        for (const c of (allCps || [])) balanceById.set(c.id, c.current_balance ?? 0);

        // PAYABLE'i grupla — last_due_date / count bilgisi için
        const open = (debts || []).filter((d) => d.direction === "PAYABLE" && !d.is_settled);
        const grouped = new Map<string, PayableAggregate>();
        for (const d of open) {
          const key = d.counterpart_id || `name:${(d.counterparty ?? "").toLowerCase()}`;
          const existing = grouped.get(key);
          if (existing) {
            existing.total_amount += d.amount;
            existing.count += 1;
            if (d.due_date) {
              if (!existing.last_due_date || d.due_date > existing.last_due_date) {
                existing.last_due_date = d.due_date;
              }
            }
          } else {
            grouped.set(key, {
              counterpart_id: d.counterpart_id || null,
              counterpart_name: d.counterparty || "Bilinmiyor",
              total_amount: d.amount,
              currency: d.currency || "TRY",
              last_due_date: d.due_date,
              count: 1,
            });
          }
        }

        // Net override: current_balance < 0 → abs olarak göster, > 0 → bu counterpart aslında
        // alacaklı tarafa düştü, Verecekler'den gizle.
        const netted: PayableAggregate[] = [];
        for (const r of grouped.values()) {
          const balance = r.counterpart_id ? balanceById.get(r.counterpart_id) : null;
          if (balance != null && balance < 0) {
            netted.push({ ...r, total_amount: Math.abs(balance) });
          } else if (balance == null) {
            // counterpart_id yok (legacy free-text). Gross olarak göster.
            netted.push(r);
          }
          // balance >= 0 ise: net borç kalmadı → gizle
        }
        setRows(netted);
      } catch (err) {
        logger.error("api", "Payables fetch failed", undefined, err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [refreshKey]);

  const total = rows.reduce((a, r) => a + (r.total_amount || 0), 0);
  const totalCount = rows.reduce((a, r) => a + (r.count || 0), 0);

  const sorted = useMemo(() => {
    const out = [...rows];
    if (sortMode === "amount_desc") {
      out.sort((a, b) => b.total_amount - a.total_amount);
    } else if (sortMode === "due_asc") {
      out.sort((a, b) => {
        const ax = a.last_due_date ? new Date(a.last_due_date).getTime() : Number.POSITIVE_INFINITY;
        const bx = b.last_due_date ? new Date(b.last_due_date).getTime() : Number.POSITIVE_INFINITY;
        return ax - bx;
      });
    } else {
      out.sort((a, b) => a.counterpart_name.localeCompare(b.counterpart_name, "tr"));
    }
    return out;
  }, [rows, sortMode]);

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
        >
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <HandCoins size={20} className="text-red-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Verecekler</h1>
            <p className="text-xs text-surface-400">
              Açık (ödenmemiş) verecekler — kişi/firma bazlı özet
            </p>
          </div>
        </div>
        {/* Sansür toggle (privacy) — göz ikonu ile tutarları gizle/göster. */}
        <button
          onClick={toggleCensor}
          aria-pressed={censored}
          title={censored ? "Tutarları göster" : "Tutarları gizle"}
          aria-label={censored ? "Tutarları göster" : "Tutarları gizle"}
          className="p-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-300 hover:text-white transition-colors"
        >
          {censored ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
        >
          <Plus size={16} />
          Verecek Ekle
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-red-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <HandCoins size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Açık verecek yok</p>
          <p className="text-surface-400 text-sm mt-1">
            Yukarıdaki &quot;+ Verecek Ekle&quot; butonu ile yeni bir verecek kaydı oluşturabilirsin.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
          >
            <Plus size={16} />
            Verecek Ekle
          </button>
        </div>
      ) : (
        <>
          {/* Totals */}
          <section className="grid grid-cols-2 gap-3">
            <div className="glass-card p-4">
              <p className="text-[11px] text-surface-400 uppercase tracking-wider">Toplam Verecek</p>
              <p className={cn("mt-1 text-2xl font-bold text-red-300 transition-[filter]", censorCls)}>
                {formatCurrency(total, "TRY")}
              </p>
            </div>
            <div className="glass-card p-4">
              <p className="text-[11px] text-surface-400 uppercase tracking-wider">Açık Kayıt</p>
              <p className="mt-1 text-2xl font-bold text-white">{totalCount}</p>
              <p className="text-[11px] text-surface-400 mt-0.5">
                {rows.length} farklı kişi/firma
              </p>
            </div>
          </section>

          {/* Sort chips */}
          <section className="flex items-center justify-between gap-2">
            <span className="text-xs text-surface-400">Sırala:</span>
            <div className="flex gap-2">
              {([
                { v: "amount_desc", label: "Tutar (çok→az)" },
                { v: "due_asc", label: "Vade (yakın→uzak)" },
                { v: "name_asc", label: "İsim (A-Z)" },
              ] as { v: SortMode; label: string }[]).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setSortMode(opt.v)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    sortMode === opt.v
                      ? "bg-red-500/20 border-red-400 text-red-200"
                      : "bg-surface-700 border-surface-600 text-surface-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          {/* List */}
          <section className="glass-card divide-y divide-surface-700">
            {sorted.map((r) => {
              const key = r.counterpart_id || `name:${r.counterpart_name}`;
              const href = r.counterpart_id ? `/dashboard/counterparts/${r.counterpart_id}` : null;
              const Inner = (
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">
                      {r.counterpart_name || "Bilinmiyor"}
                    </p>
                    {r.last_due_date && (
                      <p className="mt-1.5 text-[11px] text-surface-400 flex items-center gap-1">
                        <CalendarClock size={11} />
                        Son vade: {new Date(r.last_due_date).toLocaleDateString("tr-TR", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn("text-base font-semibold text-red-300 transition-[filter]", censorCls)}>
                      {formatCurrency(r.total_amount, r.currency)}
                    </p>
                    <p className="text-[11px] text-surface-400">{r.count} kayıt</p>
                  </div>
                </div>
              );
              return href ? (
                <Link key={key} href={href} className="block hover:bg-surface-700 transition-colors">
                  {Inner}
                </Link>
              ) : (
                <div key={key}>{Inner}</div>
              );
            })}
          </section>
        </>
      )}

      {/* v1.7.x (UI Fix WP TODO 1d5d526b): + Verecek Ekle modal */}
      {showAddModal && (
        <CounterpartDebtModal
          direction="PAYABLE"
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

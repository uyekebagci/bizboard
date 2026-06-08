"use client";

/**
 * v1.6.6: Alacaklar sayfası — counterpart bazlı açık (settled=false) RECEIVABLE özeti.
 *
 * Veri: GET /api/receivables (v1.6.5)
 *
 * Sütunlar: Kişi/Firma, Tutar (₺), Tip(ler), Vade.
 * Default sıralama: tutar DESC (backend zaten DESC döner; client ayrıca sort opsiyonu sağlar).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, HandCoins, Plus, CalendarClock,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { ReceivableAggregate, ReceivableTypeBreakdown, Counterpart, Business } from "@/types";
import { CounterpartDebtModal } from "@/components/debts/CounterpartDebtModal";
import { NotesModule } from "@/components/business/NotesModule";
import { ExchangeRateBar } from "@/components/debts/ExchangeRateBar";

type SortMode = "amount_desc" | "due_asc" | "name_asc";

export default function AlacaklarPage() {
  const router = useRouter();
  const { refreshKey, triggerRefresh } = useAppStore();
  const [rows, setRows] = useState<ReceivableAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("amount_desc");
  // v1.7.x (UI Fix WP TODO 2c83bc5c): + Alacak Ekle modal
  const [showAddModal, setShowAddModal] = useState(false);
  // WP a9da4e9d: Alacaklar sayfasına notlar — businessId resolve (tek işletme
  // ise direkt; çoklu ise selector). DGR tek işletme → selector görünmez.
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [notesBusinessId, setNotesBusinessId] = useState<string>("");

  useEffect(() => {
    async function load() {
      try {
        // v1.7.x net-balance fix:
        // /receivables gross RECEIVABLE breakdown verir; ama counterpart'ta
        // karşı PAYABLE varsa karşılıklı net'leme gerekli. Counterpart entity'sinin
        // current_balance'ı zaten net (R − P) tutuyor; onu otoritatif kabul edip
        // total_amount'u override ediyoruz. Net <= 0 olan counterpart'lar burada
        // gözükmez (artık Verecekler tarafında).
        const [recv, allCps] = await Promise.all([
          api.get<ReceivableAggregate[]>("/receivables").catch(() => [] as ReceivableAggregate[]),
          api.get<Counterpart[]>("/counterparts").catch(() => [] as Counterpart[]),
        ]);
        const balanceById = new Map<string, number>();
        for (const c of (allCps || [])) balanceById.set(c.id, c.current_balance ?? 0);

        const netted: ReceivableAggregate[] = [];
        for (const r of (recv || [])) {
          const net = r.counterpart_id ? (balanceById.get(r.counterpart_id) ?? r.total_amount) : r.total_amount;
          if (net > 0) {
            netted.push({ ...r, total_amount: net });
          }
        }
        setRows(netted);
      } catch (err) {
        logger.error("api", "Receivables fetch failed", undefined, err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [refreshKey]);

  // WP a9da4e9d: notlar için işletme listesi (tek ise auto-select).
  useEffect(() => {
    api.get<Business[]>("/businesses")
      .then((r) => {
        const list = r || [];
        setBusinesses(list);
        if (list.length >= 1) setNotesBusinessId((prev) => prev || list[0].id);
      })
      .catch(() => { /* sessiz — notlar bölümü görünmez */ });
  }, []);

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
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <HandCoins size={20} className="text-amber-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Alacaklar</h1>
            <p className="text-xs text-surface-400">
              Acik (tahsil edilmemis) alacaklarin kisi bazli ozeti
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold"
        >
          <Plus size={16} />
          Alacak Ekle
        </button>
      </div>

      {/* WP a9da4e9d (USD+Altın): güncel kur + "Anlık Güncelle". */}
      <ExchangeRateBar onRefreshed={triggerRefresh} />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-amber-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <HandCoins size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Acik alacaginiz yok</p>
          <p className="text-surface-400 text-sm mt-1">
            Yukaridaki &quot;+ Alacak Ekle&quot; butonu ile yeni bir alacak kaydi olusturabilirsiniz.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold"
          >
            <Plus size={16} />
            Alacak Ekle
          </button>
        </div>
      ) : (
        <>
          {/* Totals */}
          <section className="grid grid-cols-2 gap-3">
            <div className="glass-card p-4">
              <p className="text-[11px] text-surface-400 uppercase tracking-wider">Toplam Alacak</p>
              <p className="mt-1 text-2xl font-bold text-amber-300">
                {formatCurrency(total, "TRY")}
              </p>
            </div>
            <div className="glass-card p-4">
              <p className="text-[11px] text-surface-400 uppercase tracking-wider">Acik Kayit</p>
              <p className="mt-1 text-2xl font-bold text-white">
                {totalCount}
              </p>
              <p className="text-[11px] text-surface-400 mt-0.5">
                {rows.length} farkli kisi/firma
              </p>
            </div>
          </section>

          {/* WP a9da4e9d fix: Alacaklara ÖZEL notlar (scope=RECEIVABLES) — işletme
              detayındaki BUSINESS notlarından tamamen ayrı küme. DGR tek işletme →
              selector görünmez; çoklu işletmede basit seçici. */}
          {notesBusinessId && (
            <section className="space-y-2">
              {businesses.length > 1 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-surface-400">Notlar — İşletme:</label>
                  <select
                    value={notesBusinessId}
                    onChange={(e) => setNotesBusinessId(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-600 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <NotesModule businessId={notesBusinessId} scope="RECEIVABLES" />
            </section>
          )}

          {/* Sort chips */}
          <section className="flex items-center justify-between gap-2">
            <span className="text-xs text-surface-400">Sirala:</span>
            <div className="flex gap-2">
              {([
                { v: "amount_desc", label: "Tutar (cok→az)" },
                { v: "due_asc", label: "Vade (yakin→uzak)" },
                { v: "name_asc", label: "Isim (A-Z)" },
              ] as { v: SortMode; label: string }[]).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setSortMode(opt.v)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    sortMode === opt.v
                      ? "bg-amber-500/20 border-amber-400 text-amber-200"
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
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {r.receivable_types.map((b, i) => (
                        <TypeBadge key={`${b.type}-${i}`} breakdown={b} currency={r.currency} />
                      ))}
                    </div>
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
                    {/* total_amount güncel TL net toplam → her zaman ₺ (USD sembolü bug fix). */}
                    <p className="text-base font-semibold text-amber-300">
                      {formatCurrency(r.total_amount, "TRY")}
                    </p>
                    <p className="text-[11px] text-surface-400">
                      {r.count} kayit
                    </p>
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

      {/* v1.7.x (UI Fix WP TODO 2c83bc5c): + Alacak Ekle modal */}
      {showAddModal && (
        <CounterpartDebtModal
          direction="RECEIVABLE"
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

function TypeBadge({
  breakdown,
  currency,
}: {
  breakdown: ReceivableTypeBreakdown;
  currency: string;
}) {
  const labelMap: Record<string, string> = {
    SENET: "Senet",
    CEK: "Cek",
    ALTIN: "Altin",
    NAKIT: "Nakit",
    DIGER: breakdown.label || "Diger",
    UNSPECIFIED: "Belirtilmemis",
  };
  const colorMap: Record<string, string> = {
    SENET: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    CEK: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    ALTIN: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    NAKIT: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    DIGER: "bg-pink-500/15 text-pink-300 border-pink-500/30",
    UNSPECIFIED: "bg-surface-600 text-surface-300 border-surface-500",
  };
  const cls = colorMap[breakdown.type] || colorMap.UNSPECIFIED;
  const label = labelMap[breakdown.type] || breakdown.type;
  // breakdown.amount güncel TL toplam → her zaman ₺ (USD sembolü bug fix).
  void currency;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cls}`}
      title={`${label}: ${formatCurrency(breakdown.amount, "TRY")} (${breakdown.count} kayit)`}
    >
      <span>{label}</span>
      <span className="opacity-70">·</span>
      <span>{formatCurrency(breakdown.amount, "TRY")}</span>
    </span>
  );
}

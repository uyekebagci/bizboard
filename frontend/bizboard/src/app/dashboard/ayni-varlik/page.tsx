"use client";

/**
 * Ledger v2 (Faz D, §3.1 / §7): Ayni Varlık (ASSET) envanteri.
 *
 * <p>İş karşılığı alınan araba/mal → ASSET hesabına defter değeriyle giriş;
 * satılınca P&L gelirine/zararına döner. Mevcut envanter modülünden AYRI
 * (ASSET account tipi + Posting çekirdeği).</p>
 */

import { useEffect, useMemo, useState } from "react";
import { Car, Plus, Loader2, AlertTriangle, Tag, Archive } from "lucide-react";
import { api } from "@/lib/api/client";
import { useBusinesses } from "@/hooks/useBusinesses";
import { useAssets, type Asset, type AcquireAssetInput } from "@/hooks/useAssets";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { BankAccountListItem, Counterpart } from "@/types";

export default function AssetsPage() {
  const { businesses } = useBusinesses();
  const businessId = businesses?.[0]?.id ?? null;
  const [includeSold, setIncludeSold] = useState(false);
  const { list, loading, error, acquire, sell } = useAssets(businessId, includeSold);

  const [accounts, setAccounts] = useState<BankAccountListItem[]>([]);
  const [counterparts, setCounterparts] = useState<Counterpart[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    api.get<BankAccountListItem[]>("/bank-accounts").then((r) => setAccounts(r ?? [])).catch(() => setAccounts([]));
    api.get<Counterpart[]>("/counterparts").then((r) => setCounterparts(r ?? [])).catch(() => setCounterparts([]));
  }, []);

  const NON_MONEY = ["POS_SETTLEMENT", "RECEIVABLE", "PAYABLE", "ASSET"];
  const moneyAccounts = useMemo(
    () => accounts.filter((a) => !NON_MONEY.includes(a.type as string)),
    [accounts],
  );

  const totalBook = list.filter((a) => a.active).reduce((s, a) => s + (a.book_value || 0), 0);

  async function handleSell(a: Asset) {
    if (moneyAccounts.length === 0) { toast.error("Para hesabı yok"); return; }
    const accId = window.prompt(
      `Satış bedeli hangi hesaba? (id):\n${moneyAccounts.map((m) => `${m.name} → ${m.id}`).join("\n")}`,
      moneyAccounts[0].id,
    );
    if (!accId) return;
    const priceStr = window.prompt(`Satış bedeli (defter değeri: ${a.book_value}):`, String(a.book_value));
    if (priceStr == null) return;
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) { toast.error("Geçerli bedel girin"); return; }
    setBusyId(a.account_id);
    try {
      await sell({ asset_account_id: a.account_id, money_account_id: accId.trim(), sale_price: price });
      const gain = price - a.book_value;
      toast.success(`Satıldı — ${gain >= 0 ? "kâr" : "zarar"} ${formatCurrency(Math.abs(gain), "TRY")}`);
    } catch (e) { toast.error(e); } finally { setBusyId(null); }
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
          <Car size={20} className="text-amber-300" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-surface-100">Ayni Varlık</h1>
          <p className="text-xs text-surface-400">İş karşılığı alınan araba/mal · satışta P&amp;L&apos;e döner</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold"
        >
          <Plus size={16} /> Edin
        </button>
      </div>

      <section className="grid grid-cols-2 gap-3">
        <div className="glass-card p-3">
          <p className="text-[10px] text-surface-400 uppercase">Portföy Defter Değeri</p>
          <p className="mt-1 text-lg font-bold text-amber-300">{formatCurrency(totalBook, "TRY")}</p>
        </div>
        <div className="glass-card p-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-surface-400 uppercase">Kayıt</p>
            <p className="mt-1 text-lg font-bold text-surface-100">{list.length}</p>
          </div>
          <button
            onClick={() => setIncludeSold((v) => !v)}
            className={cn("text-[11px] px-2 py-1 rounded-md border",
              includeSold ? "bg-surface-700 text-surface-200 border-surface-500" : "text-surface-400 border-surface-600")}
          >
            <Archive size={11} className="inline mr-1" />Satılanlar
          </button>
        </div>
      </section>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-amber-400" />
        </div>
      ) : list.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Car size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Henüz ayni varlık yok</p>
        </div>
      ) : (
        <section className="glass-card divide-y divide-surface-700">
          {list.map((a) => (
            <div key={a.account_id} className={cn("p-4 flex items-center justify-between gap-3", !a.active && "opacity-60")}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-surface-100 truncate">{a.name}</p>
                <p className="text-[11px] text-surface-400 mt-0.5">
                  {a.active ? "Portföyde" : "Satıldı / elden çıktı"}
                  {a.notes && <> · {a.notes}</>}
                </p>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                <p className="text-sm font-semibold text-amber-300">{formatCurrency(a.book_value, "TRY")}</p>
                {a.active && (
                  <button
                    onClick={() => handleSell(a)}
                    disabled={busyId === a.account_id}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 disabled:opacity-50"
                  >
                    {busyId === a.account_id ? <Loader2 size={10} className="animate-spin" /> : <Tag size={10} />}
                    Sat
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {showAdd && (
        <AcquireAssetModal
          counterparts={counterparts}
          onClose={() => setShowAdd(false)}
          onSubmit={async (input) => { await acquire(input); setShowAdd(false); toast.success("Ayni varlık edinildi"); }}
        />
      )}
    </div>
  );
}

function AcquireAssetModal({
  counterparts, onClose, onSubmit,
}: {
  counterparts: Counterpart[];
  onClose: () => void;
  onSubmit: (input: AcquireAssetInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [bookValue, setBookValue] = useState("");
  const [counterpartId, setCounterpartId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const v = parseFloat(bookValue);
    if (!name.trim()) { toast.error("Varlık adı girin"); return; }
    if (!v || v <= 0) { toast.error("Geçerli defter değeri girin"); return; }
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), book_value: v, counterpart_id: counterpartId || null });
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onClose}>
      <div className="glass-card w-full sm:max-w-md p-5 space-y-3 rounded-t-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-surface-100">Ayni Varlık Edin</h2>
        <input placeholder="Varlık adı (ör. Ford Transit 2019)" value={name} onChange={(e) => setName(e.target.value)} className="field w-full" />
        <input type="number" inputMode="decimal" placeholder="Defter değeri" value={bookValue} onChange={(e) => setBookValue(e.target.value)} className="field w-full" />
        <select value={counterpartId} onChange={(e) => setCounterpartId(e.target.value)} className="field w-full">
          <option value="">Malı veren (opsiyonel)</option>
          {counterparts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-surface-700 text-surface-300 text-sm font-medium">İptal</button>
          <button onClick={submit} disabled={busy} className="flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

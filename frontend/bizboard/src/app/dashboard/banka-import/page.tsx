"use client";

/**
 * Ledger v2 (Faz B, §3.8 / §5): Banka Hareketi Import — MANUEL satır girişi.
 *
 * <p>PDF auto-parse ERTELENDİ (KARAR A4). Bugün: parti aç (banka hesabı seç) →
 * elle satır ekle (tarih/tutar/karşı-taraf) → kategorile (karşı-taraf→kategori
 * öneri) → postala (ledger'a). Çift tema.</p>
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Plus, Check, Flag, Send, Landmark,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useBusinesses } from "@/hooks/useBusinesses";
import { useBankImport } from "@/hooks/useBankImport";
import { formatCurrency, formatMoneyInput, parseMoneyInput, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { BankAccountListItem, BankImportBatch, BankImportLine, Category } from "@/types";

export default function BankaImportPage() {
  const router = useRouter();
  const { businesses } = useBusinesses();
  const businessId = businesses?.[0]?.id ?? null;
  const { batches, loading, createBatch, getBatch, addLine, categorize, flag, postLine } =
    useBankImport(businessId);

  const [accounts, setAccounts] = useState<BankAccountListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [active, setActive] = useState<BankImportBatch | null>(null);

  useEffect(() => {
    api.get<BankAccountListItem[]>("/bank-accounts").then(setAccounts).catch(() => setAccounts([]));
  }, []);
  useEffect(() => {
    if (!businessId) return;
    api.get<Category[]>(`/businesses/${businessId}/categories`).then(setCategories).catch(() => setCategories([]));
  }, [businessId]);

  const reloadActive = useCallback(async (batchId: string) => {
    try { setActive(await getBatch(batchId)); } catch { /* noop */ }
  }, [getBatch]);

  async function handleCreate() {
    if (!selectedAccount) { toast.info("Banka hesabı seçin"); return; }
    try {
      const b = await createBatch(selectedAccount);
      toast.success("Parti açıldı");
      await reloadActive(b.id);
    } catch (err) { toast.error(err); }
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors">
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Banka Hareketi Import</h1>
          <p className="text-xs text-surface-400">Manuel satır girişi (PDF otomatik okuma yakında)</p>
        </div>
      </div>

      {/* Yeni parti */}
      <section className="card p-4 space-y-3">
        <p className="label flex items-center gap-1.5"><Landmark size={13} /> Yeni Parti</p>
        <div className="flex gap-2">
          <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}
            className="input flex-1">
            <option value="">Banka hesabı seç...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button onClick={handleCreate}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold flex items-center gap-1.5 shrink-0">
            <Plus size={15} /> Aç
          </button>
        </div>
      </section>

      {/* Aktif parti — satırlar */}
      {active && (
        <ActiveBatchPanel batch={active} categories={categories}
          onAddLine={async (input) => { await addLine(active.id, input); await reloadActive(active.id); }}
          onCategorize={async (lineId, catId) => { await categorize(lineId, catId); await reloadActive(active.id); }}
          onFlag={async (lineId) => { await flag(lineId); await reloadActive(active.id); }}
          onPost={async (lineId) => { await postLine(lineId); await reloadActive(active.id); }} />
      )}

      {/* Parti listesi */}
      <section className="space-y-2">
        <p className="text-sm font-semibold text-white">Partiler</p>
        {loading && batches.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={24} className="animate-spin text-surface-400" />
          </div>
        ) : batches.length === 0 ? (
          <div className="glass-card p-6 text-center text-surface-400 text-sm">Henüz parti yok</div>
        ) : (
          <div className="glass-card divide-y divide-surface-700">
            {batches.map((b) => (
              <button key={b.id} onClick={() => reloadActive(b.id)}
                className="w-full p-3 flex items-center justify-between gap-2 hover:bg-surface-700/40 text-left">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{b.account_name}</p>
                  <p className="text-[11px] text-surface-400">
                    {b.line_count} satır · {b.matched_count} eşleşti · {b.unexplained_count} açıklanamayan
                  </p>
                </div>
                <span className="text-[10px] uppercase text-surface-400">{b.status}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ActiveBatchPanel({ batch, categories, onAddLine, onCategorize, onFlag, onPost }: {
  batch: BankImportBatch;
  categories: Category[];
  onAddLine: (input: { parsedDate?: string | null; parsedAmount: number; parsedCounterpart?: string | null }) => Promise<void>;
  onCategorize: (lineId: string, catId: string) => Promise<void>;
  onFlag: (lineId: string) => Promise<void>;
  onPost: (lineId: string) => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [counterpart, setCounterpart] = useState("");
  const [adding, setAdding] = useState(false);

  async function add() {
    const raw = parseMoneyInput(amount);
    if (!raw) { toast.info("Tutar girin"); return; }
    const signed = direction === "OUT" ? -Math.abs(raw) : Math.abs(raw);
    setAdding(true);
    try {
      await onAddLine({ parsedDate: date || null, parsedAmount: signed, parsedCounterpart: counterpart || null });
      setAmount(""); setCounterpart("");
      toast.success("Satır eklendi");
    } catch (err) { toast.error(err); } finally { setAdding(false); }
  }

  return (
    <section className="card p-4 space-y-3 border border-brand-500/20">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{batch.account_name} — Satırlar</p>
        <span className="text-[10px] uppercase text-surface-400">{batch.status}</span>
      </div>

      {/* Yeni satır */}
      <div className="grid grid-cols-12 gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="input col-span-4" />
        <div className="col-span-3 flex rounded-xl overflow-hidden border border-surface-600">
          <button type="button" onClick={() => setDirection("IN")}
            className={cn("flex-1 text-xs font-semibold py-2 transition-colors",
              direction === "IN" ? "bg-emerald-600/25 text-emerald-300" : "bg-surface-700 text-surface-400")}>
            Giriş
          </button>
          <button type="button" onClick={() => setDirection("OUT")}
            className={cn("flex-1 text-xs font-semibold py-2 transition-colors",
              direction === "OUT" ? "bg-red-600/25 text-red-300" : "bg-surface-700 text-surface-400")}>
            Çıkış
          </button>
        </div>
        <input type="text" inputMode="numeric" value={amount}
          onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
          className="input col-span-3" placeholder="Tutar" />
        <button onClick={add} disabled={adding}
          className="col-span-2 px-2 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold flex items-center justify-center">
          {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
        </button>
      </div>
      <input type="text" value={counterpart} onChange={(e) => setCounterpart(e.target.value)}
        className="input" placeholder="Karşı taraf (kategori önerisi için)" />

      {/* Satır listesi */}
      <div className="glass-card divide-y divide-surface-700">
        {(batch.lines ?? []).length === 0 && (
          <p className="p-3 text-xs text-surface-400">Satır yok — yukarıdan ekleyin.</p>
        )}
        {(batch.lines ?? []).map((l) => (
          <LineRow key={l.id} line={l} categories={categories}
            onCategorize={onCategorize} onFlag={onFlag} onPost={onPost} />
        ))}
      </div>
    </section>
  );
}

function LineRow({ line, categories, onCategorize, onFlag, onPost }: {
  line: BankImportLine; categories: Category[];
  onCategorize: (lineId: string, catId: string) => Promise<void>;
  onFlag: (lineId: string) => Promise<void>;
  onPost: (lineId: string) => Promise<void>;
}) {
  const posted = line.status === "POSTED";
  const flagged = line.status === "FLAGGED";
  const catId = line.confirmed_category_id ?? line.suggested_category_id ?? "";
  return (
    <div className="p-3 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-semibold num",
            line.parsed_amount < 0 ? "text-red-300" : "text-emerald-300")}>
            {line.parsed_amount > 0 ? "+" : ""}{formatCurrency(line.parsed_amount, "TRY")}
          </span>
          <span className="text-xs text-surface-300 truncate">{line.parsed_counterpart ?? "—"}</span>
          {flagged && (
            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/25">
              Açıklanamayan
            </span>
          )}
          {posted && (
            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
              Postalandı
            </span>
          )}
        </div>
        {line.suggested_category_name && !line.confirmed_category_id && (
          <p className="text-[11px] text-brand-300 mt-0.5">Öneri: {line.suggested_category_name}</p>
        )}
      </div>
      {!posted && (
        <div className="flex items-center gap-1.5 shrink-0">
          <select value={catId} onChange={(e) => onCategorize(line.id, e.target.value)}
            className="input py-1.5 text-xs max-w-[120px]">
            <option value="">Kategori...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button onClick={() => onFlag(line.id)} title="Açıklanamayan"
            className="p-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-amber-300">
            <Flag size={13} />
          </button>
          <button onClick={() => onPost(line.id)} disabled={!line.confirmed_category_id} title="Ledger'a postala"
            className="p-1.5 rounded-lg bg-brand-600/20 text-brand-300 border border-brand-600/30 disabled:opacity-40">
            <Send size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * Ledger v2 (Faz B, §3.8 / §5): Banka Hareketi Import.
 *
 * <p>İki giriş yolu: (1) banka ekstresi PDF yükle → otomatik satır (PDFBox
 * parse), (2) elle satır ekle. Akış: parti aç (banka hesabı seç) → satır
 * (PDF/elle) → kategorile (karşı-taraf→kategori öneri) → postala (ledger'a).
 * Çift tema.</p>
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2, Plus, Flag, Send, Landmark, FileUp,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useBusinesses } from "@/hooks/useBusinesses";
import { useBankImport } from "@/hooks/useBankImport";
import { formatCurrency, formatMoneyInput, parseMoneyInput, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { BankAccountListItem, BankImportBatch, BankImportLine, BankImportPdfResult, Category } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListSkeleton } from "@/components/shared/Skeleton";

export default function BankaImportPage() {
  const { businesses } = useBusinesses();
  const businessId = businesses?.[0]?.id ?? null;
  const { batches, loading, createBatch, getBatch, addLine, importPdf, categorize, flag, postLine } =
    useBankImport(businessId);

  const [accounts, setAccounts] = useState<BankAccountListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [active, setActive] = useState<BankImportBatch | null>(null);

  // BUG fix (banka-import "Aç" → 403 "Yetki yok"): hesap dropdown'ı SEÇİLİ
  // işletmeyle (businessId) DARALTILMALI. Aksi hâlde /bank-accounts param'sız
  // çağrılınca erişilebilir TÜM işletmelerin hesapları listeleniyordu; çoklu
  // işletmeli (admin/QA) kullanıcı businesses[0] dışındaki bir "Ana Kasa"yı
  // seçince createBatch(business_id=businesses[0]) backend'in cross-tenant
  // guard'ına takılıp SecurityException → 403 dönüyordu. Tenant-scope KORUNUR:
  // gevşetme değil, doğru scope. business_id değişince yeniden yüklenir ve
  // stale seçim sıfırlanır.
  useEffect(() => {
    if (!businessId) { setAccounts([]); setSelectedAccount(""); return; }
    api.get<BankAccountListItem[]>(`/bank-accounts?business_id=${businessId}`)
      .then(setAccounts)
      .catch(() => setAccounts([]));
    setSelectedAccount("");
  }, [businessId]);
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
      <PageHeader
        title="Banka Hareketi Import"
        subtitle="Banka ekstresi PDF yükle veya elle satır gir"
        icon={Landmark}
      />

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
            className="v2-btn v2-btn--accent px-4 py-2 text-sm font-semibold flex items-center gap-1.5 shrink-0">
            <Plus size={15} /> Aç
          </button>
        </div>
      </section>

      {/* Aktif parti — satırlar */}
      {active && (
        <ActiveBatchPanel batch={active} categories={categories}
          onAddLine={async (input) => { await addLine(active.id, input); await reloadActive(active.id); }}
          onImportPdf={async (file) => {
            const r = await importPdf(active.id, file);
            await reloadActive(active.id);
            return r;
          }}
          onCategorize={async (lineId, catId) => { await categorize(lineId, catId); await reloadActive(active.id); }}
          onFlag={async (lineId) => { await flag(lineId); await reloadActive(active.id); }}
          onPost={async (lineId) => { await postLine(lineId); await reloadActive(active.id); }} />
      )}

      {/* Parti listesi */}
      <section className="space-y-2">
        <p className="text-sm font-semibold text-[rgb(var(--v2-ink))]">Partiler</p>
        {loading && batches.length === 0 ? (
          <ListSkeleton rows={3} />
        ) : batches.length === 0 ? (
          <EmptyState icon={Landmark} title="Henüz parti yok" size="sm" />
        ) : (
          <div className="v2-card divide-y divide-[rgb(var(--v2-border))]">
            {batches.map((b) => (
              <button key={b.id} onClick={() => reloadActive(b.id)}
                className="w-full p-3 flex items-center justify-between gap-2 hover:bg-[rgb(var(--v2-sunken))] text-left">
                <div className="min-w-0">
                  <p className="text-sm text-[rgb(var(--v2-ink))] truncate">{b.account_name}</p>
                  <p className="text-[11px] text-[rgb(var(--v2-muted))]">
                    {b.line_count} satır · {b.matched_count} eşleşti · {b.unexplained_count} açıklanamayan
                  </p>
                </div>
                <span className="text-[10px] uppercase text-[rgb(var(--v2-muted))]">{b.status}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ActiveBatchPanel({ batch, categories, onAddLine, onImportPdf, onCategorize, onFlag, onPost }: {
  batch: BankImportBatch;
  categories: Category[];
  onAddLine: (input: { parsedDate?: string | null; parsedAmount: number; parsedCounterpart?: string | null }) => Promise<void>;
  onImportPdf: (file: File) => Promise<BankImportPdfResult>;
  onCategorize: (lineId: string, catId: string) => Promise<void>;
  onFlag: (lineId: string) => Promise<void>;
  onPost: (lineId: string) => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [counterpart, setCounterpart] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  async function handlePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = ""; // aynı dosya tekrar seçilebilsin
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Lütfen bir PDF dosyası seçin");
      return;
    }
    setUploading(true);
    try {
      const r = await onImportPdf(file);
      const parts = [`${r.imported_count} satır eklendi`];
      if (r.skipped_duplicate_count > 0) parts.push(`${r.skipped_duplicate_count} çift atlandı`);
      if (r.flagged_count > 0) parts.push(`${r.flagged_count} işaretlendi`);
      if (!r.chain_consistent) {
        toast.error(`PDF okundu ama bakiye zinciri tutmadı — ${parts.join(", ")}. İşaretli satırları kontrol edin.`);
      } else {
        toast.success(`PDF okundu: ${parts.join(", ")}`);
      }
    } catch (err) { toast.error(err); } finally { setUploading(false); }
  }

  return (
    <section className="card p-4 space-y-3 border border-brand-500/20">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[rgb(var(--v2-ink))]">{batch.account_name} — Satırlar</p>
        <span className="text-[10px] uppercase text-[rgb(var(--v2-muted))]">{batch.status}</span>
      </div>

      {/* PDF yükle */}
      <div className="flex items-center gap-2 rounded-xl bg-[rgb(var(--v2-sunken))] border border-dashed border-[rgb(var(--v2-border))] p-3">
        <FileUp size={18} className="text-accent shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[rgb(var(--v2-ink))]">Banka ekstresi PDF</p>
          <p className="text-[11px] text-[rgb(var(--v2-muted))]">PDF yükle → hareketler otomatik satır olur</p>
        </div>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={handlePdf} className="hidden" />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="v2-btn v2-btn--accent px-3 py-2 text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-60">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
          {uploading ? "Okunuyor..." : "PDF Yükle"}
        </button>
      </div>

      {/* Yeni satır */}
      <div className="grid grid-cols-12 gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="input col-span-4" />
        <div className="col-span-3 flex rounded-xl overflow-hidden border border-[rgb(var(--v2-border))]">
          <button type="button" onClick={() => setDirection("IN")}
            className={cn("flex-1 text-xs font-semibold py-2 transition-colors",
              direction === "IN" ? "bg-emerald-600/25 text-emerald-700 dark:text-emerald-300" : "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))]")}>
            Giriş
          </button>
          <button type="button" onClick={() => setDirection("OUT")}
            className={cn("flex-1 text-xs font-semibold py-2 transition-colors",
              direction === "OUT" ? "bg-red-600/25 text-red-700 dark:text-red-300" : "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))]")}>
            Çıkış
          </button>
        </div>
        <input type="text" inputMode="numeric" value={amount}
          onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
          className="input col-span-3" placeholder="Tutar" />
        <button onClick={add} disabled={adding}
          className="v2-btn v2-btn--accent col-span-2 px-2 py-2 text-sm font-semibold flex items-center justify-center">
          {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
        </button>
      </div>
      <input type="text" value={counterpart} onChange={(e) => setCounterpart(e.target.value)}
        className="input" placeholder="Karşı taraf (kategori önerisi için)" />

      {/* Satır listesi */}
      <div className="v2-card divide-y divide-[rgb(var(--v2-border))]">
        {(batch.lines ?? []).length === 0 && (
          <p className="p-3 text-xs text-[rgb(var(--v2-muted))]">Satır yok — yukarıdan ekleyin.</p>
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
            line.parsed_amount < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300")}>
            {line.parsed_amount > 0 ? "+" : ""}{formatCurrency(line.parsed_amount, "TRY")}
          </span>
          <span className="text-xs text-[rgb(var(--v2-muted))] truncate">{line.parsed_counterpart ?? "—"}</span>
          {flagged && (
            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/25">
              Açıklanamayan
            </span>
          )}
          {posted && (
            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
              Postalandı
            </span>
          )}
        </div>
        {line.suggested_category_name && !line.confirmed_category_id && (
          <p className="text-[11px] text-accent mt-0.5">Öneri: {line.suggested_category_name}</p>
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
            className="p-1.5 rounded-lg bg-[rgb(var(--v2-sunken))] hover:bg-[rgb(var(--v2-border))] text-amber-700 dark:text-amber-300">
            <Flag size={13} />
          </button>
          <button onClick={() => onPost(line.id)} disabled={!line.confirmed_category_id} title="Ledger'a postala"
            className="p-1.5 rounded-lg bg-accent/20 text-accent border border-accent/30 disabled:opacity-40">
            <Send size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

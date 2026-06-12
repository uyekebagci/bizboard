"use client";

/**
 * Ledger v2 (Faz D, §3.7): Çek/Senet portföyü (Posting çekirdeğine bağlı).
 *
 * <p>v1.7 /cheques sayfasından AYRI — bu, ledger-v2 Instrument modelidir:
 * alınan (RECEIVABLE) / verilen (PAYABLE), vade, banka, durum (portföyde/tahsil/
 * ödendi/karşılıksız), ciro. Tahsil/ödeme → para hesabına Σ=0 posting.</p>
 *
 * <p>Telegram-foto/OCR girişi ileride ayrı modülde (PENDING_OCR kayıtları burada
 * onaylanabilir); şimdilik manuel giriş + tahsil/ödeme/karşılıksız/ciro.</p>
 */

import { useEffect, useMemo, useState } from "react";
import {
  FileText, Plus, Loader2, AlertTriangle, Check, XCircle, ArrowRightLeft, BadgeCheck, Undo2,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useBusinesses } from "@/hooks/useBusinesses";
import { useInstruments, type Instrument, type CreateInstrumentInput } from "@/hooks/useInstruments";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { BankAccountListItem, Counterpart } from "@/types";
import { CashLedgerInstrumentModal } from "@/components/instruments/CashLedgerInstrumentModal";

const STATUS_LABEL: Record<string, string> = {
  PENDING_OCR: "OCR Bekliyor",
  CONFIRMED: "Portföyde",
  CASHED: "Tahsil/Ödendi",
  BOUNCED: "Karşılıksız",
  ENDORSED: "Ciro Edildi",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING_OCR: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  CONFIRMED: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  CASHED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  BOUNCED: "bg-red-500/15 text-red-300 border-red-500/30",
  ENDORSED: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};

export default function InstrumentsPage() {
  const { businesses } = useBusinesses();
  const businessId = businesses?.[0]?.id ?? null;
  const { list, loading, error, create, cash, uncash, bounce, endorse } = useInstruments(businessId);

  const [accounts, setAccounts] = useState<BankAccountListItem[]>([]);
  const [counterparts, setCounterparts] = useState<Counterpart[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Çek/senet ↔ nakit tahsilat bağlama modalı (prompt() yerine proper modal).
  const [cashTarget, setCashTarget] = useState<Instrument | null>(null);

  useEffect(() => {
    api.get<BankAccountListItem[]>("/bank-accounts").then((r) => setAccounts(r ?? [])).catch(() => setAccounts([]));
    api.get<Counterpart[]>("/counterparts").then((r) => setCounterparts(r ?? [])).catch(() => setCounterparts([]));
  }, []);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const portfolio = list.filter((i) => i.status === "CONFIRMED" || i.status === "PENDING_OCR");
  const totalReceivable = portfolio.filter((i) => i.direction === "RECEIVED").reduce((a, x) => a + (x.amount || 0), 0);
  const totalPayable = portfolio.filter((i) => i.direction === "GIVEN").reduce((a, x) => a + (x.amount || 0), 0);

  // Tahsil/öde → proper modal (CashLedgerInstrumentModal) aç; modal cash() çağırır.
  function handleCash(ins: Instrument) {
    setCashTarget(ins);
  }

  // Çek/senet ↔ nakit tahsilat BAĞINI KOPAR (reverse → CONFIRMED). P&L-nötr.
  async function handleUncash(ins: Instrument) {
    if (!window.confirm(
      "Tahsil/ödeme bağı kopartılsın mı? Para hesabına yazılan hareket geri alınır, evrak portföye döner. (Karşılıksız DEĞİL — sadece yanlış bağlamayı düzeltir.)",
    )) return;
    setBusyId(ins.id);
    try { await uncash(ins.id); toast.success("Bağ kopartıldı — portföye döndü"); }
    catch (e) { toast.error(e); } finally { setBusyId(null); }
  }

  async function handleBounce(ins: Instrument) {
    if (!window.confirm("Karşılıksız olarak işaretlensin mi?")) return;
    setBusyId(ins.id);
    try { await bounce(ins.id); toast.success("Karşılıksız işaretlendi"); }
    catch (e) { toast.error(e); } finally { setBusyId(null); }
  }

  async function handleEndorse(ins: Instrument) {
    const firms = counterparts;
    if (firms.length === 0) { toast.error("Devralan için cari yok"); return; }
    const cpId = window.prompt(
      `Ciro — devralan cari (id):\n${firms.map((c) => `${c.name} → ${c.id}`).join("\n")}`,
      firms[0].id,
    );
    if (!cpId) return;
    setBusyId(ins.id);
    try { await endorse(ins.id, cpId.trim()); toast.success("Ciro edildi"); }
    catch (e) { toast.error(e); } finally { setBusyId(null); }
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
          <FileText size={20} className="text-purple-300" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-surface-100">Çek / Senet (Ledger)</h1>
          <p className="text-xs text-surface-400">Portföy · tahsil/ödeme → kasa posting · ciro</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold"
        >
          <Plus size={16} /> Ekle
        </button>
      </div>

      <section className="grid grid-cols-3 gap-3">
        <div className="glass-card p-3">
          <p className="text-[10px] text-surface-400 uppercase">Alacak (Portföy)</p>
          <p className="mt-1 text-lg font-bold text-emerald-300">{formatCurrency(totalReceivable, "TRY")}</p>
        </div>
        <div className="glass-card p-3">
          <p className="text-[10px] text-surface-400 uppercase">Borç (Portföy)</p>
          <p className="mt-1 text-lg font-bold text-red-300">{formatCurrency(totalPayable, "TRY")}</p>
        </div>
        <div className="glass-card p-3">
          <p className="text-[10px] text-surface-400 uppercase">Toplam Kayıt</p>
          <p className="mt-1 text-lg font-bold text-surface-100">{list.length}</p>
        </div>
      </section>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-purple-400" />
        </div>
      ) : list.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <FileText size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Henüz çek/senet yok</p>
        </div>
      ) : (
        <section className="glass-card divide-y divide-surface-700">
          {list.map((i) => {
            const overdue = i.due_date < today && (i.status === "CONFIRMED" || i.status === "PENDING_OCR");
            const canAct = i.status === "CONFIRMED";
            return (
              <div key={i.id} className={cn("p-4 flex items-start justify-between gap-3", overdue && "bg-red-500/5")}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      "text-[9px] uppercase px-1.5 py-0.5 rounded-full border",
                      i.direction === "RECEIVED" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-red-500/15 text-red-300 border-red-500/30",
                    )}>
                      {i.direction === "RECEIVED" ? "Alacak" : "Borç"}
                    </span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-surface-700 text-surface-300 border border-surface-600">
                      {i.type === "CHECK" ? "Çek" : "Senet"}
                    </span>
                    <span className={cn("text-[9px] uppercase px-1.5 py-0.5 rounded-full border", STATUS_STYLE[i.status])}>
                      {STATUS_LABEL[i.status] ?? i.status}
                    </span>
                    {overdue && (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">Vade Geçti</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-surface-100 mt-1 truncate">{i.issuer_name ?? "—"}</p>
                  <p className="text-[11px] text-surface-400 mt-0.5">
                    Vade {new Date(i.due_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
                    {i.bank_name && <> · {i.bank_name}</>}
                    {i.serial_no && <> · #{i.serial_no}</>}
                    {i.endorsed_to_name && <> · ciro → {i.endorsed_to_name}</>}
                    {i.cashed_account_name && <> · {i.cashed_account_name}</>}
                  </p>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                  <p className={cn("text-sm font-semibold", i.direction === "RECEIVED" ? "text-emerald-300" : "text-red-300")}>
                    {formatCurrency(i.amount, i.currency || "TRY")}
                  </p>
                  {canAct && (
                    <div className="flex gap-1">
                      <button onClick={() => handleCash(i)} disabled={busyId === i.id}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 disabled:opacity-50">
                        {busyId === i.id ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                        {i.direction === "RECEIVED" ? "Tahsil" : "Öde"}
                      </button>
                      {i.direction === "RECEIVED" && (
                        <button onClick={() => handleEndorse(i)} disabled={busyId === i.id}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 border border-violet-500/30 disabled:opacity-50">
                          <ArrowRightLeft size={10} /> Ciro
                        </button>
                      )}
                      <button onClick={() => handleBounce(i)} disabled={busyId === i.id}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/30 disabled:opacity-50">
                        <XCircle size={10} /> K.sız
                      </button>
                    </div>
                  )}
                  {i.status === "CASHED" && (
                    <div className="flex flex-col items-end gap-1">
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                        <BadgeCheck size={11} /> {i.direction === "RECEIVED" ? "Tahsil edildi" : "Ödendi"}
                      </span>
                      {/* Cross-link: hangi hesaba bağlandı (tahsilat işlemi) */}
                      {i.cashed_account_name && (
                        <span className="text-[9px] text-surface-400">
                          → {i.cashed_account_name}
                          {i.cashed_at && ` · ${new Date(i.cashed_at).toLocaleDateString("tr-TR")}`}
                        </span>
                      )}
                      {/* Reverse: bağı kopar (yanlış bağladıysa) — P&L-nötr geri al */}
                      <button onClick={() => handleUncash(i)} disabled={busyId === i.id}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30 disabled:opacity-50">
                        {busyId === i.id ? <Loader2 size={10} className="animate-spin" /> : <Undo2 size={10} />}
                        Bağı Kopar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {showAdd && (
        <AddInstrumentModal
          accounts={accounts}
          counterparts={counterparts}
          onClose={() => setShowAdd(false)}
          onSubmit={async (input) => { await create(input); setShowAdd(false); toast.success("Çek/senet eklendi"); }}
        />
      )}

      {/* Çek/senet ↔ nakit tahsilat BAĞLAMA modalı (P&L-nötr cash()) */}
      {cashTarget && (
        <CashLedgerInstrumentModal
          instrument={cashTarget}
          onCash={cash}
          onClose={() => setCashTarget(null)}
        />
      )}
    </div>
  );
}

function AddInstrumentModal({
  counterparts, onClose, onSubmit,
}: {
  accounts: BankAccountListItem[];
  counterparts: Counterpart[];
  onClose: () => void;
  onSubmit: (input: CreateInstrumentInput) => Promise<void>;
}) {
  const [type, setType] = useState("CHECK");
  const [direction, setDirection] = useState("RECEIVED");
  const [amount, setAmount] = useState("");
  const [issuerId, setIssuerId] = useState("");
  const [bankName, setBankName] = useState("");
  const [serialNo, setSerialNo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("Geçerli tutar girin"); return; }
    if (!dueDate) { toast.error("Vade tarihi zorunlu"); return; }
    setBusy(true);
    try {
      await onSubmit({
        type, direction, amount: amt, due_date: dueDate,
        issuer_counterpart_id: issuerId || null,
        bank_name: bankName || null, serial_no: serialNo || null,
      });
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onClose}>
      <div className="glass-card w-full sm:max-w-md p-5 space-y-3 rounded-t-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-surface-100">Çek / Senet Ekle</h2>
        <div className="grid grid-cols-2 gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className="field">
            <option value="CHECK">Çek</option>
            <option value="PROMISSORY_NOTE">Senet</option>
          </select>
          <select value={direction} onChange={(e) => setDirection(e.target.value)} className="field">
            <option value="RECEIVED">Alacak (alınan)</option>
            <option value="GIVEN">Borç (verilen)</option>
          </select>
        </div>
        <input type="number" inputMode="decimal" placeholder="Tutar" value={amount} onChange={(e) => setAmount(e.target.value)} className="field w-full" />
        <select value={issuerId} onChange={(e) => setIssuerId(e.target.value)} className="field w-full">
          <option value="">Keşideci / Karşı taraf (opsiyonel)</option>
          {counterparts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Banka" value={bankName} onChange={(e) => setBankName(e.target.value)} className="field" />
          <input placeholder="Çek/Seri No" value={serialNo} onChange={(e) => setSerialNo(e.target.value)} className="field" />
        </div>
        <div>
          <label className="text-xs text-surface-400">Vade</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="field w-full" />
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-surface-700 text-surface-300 text-sm font-medium">İptal</button>
          <button onClick={submit} disabled={busy} className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

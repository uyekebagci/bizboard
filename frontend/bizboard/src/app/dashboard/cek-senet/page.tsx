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
  PENDING_OCR: "bg-status-warning/15 text-status-warning border-status-warning/30",
  CONFIRMED: "bg-accent/15 text-accent-strong dark:text-accent border-accent/30",
  CASHED: "bg-accent/15 text-accent-strong dark:text-accent border-accent/30",
  BOUNCED: "bg-status-danger/15 text-status-danger border-status-danger/30",
  ENDORSED: "bg-status-warning/15 text-status-warning border-status-warning/30",
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
        <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
          <FileText size={20} className="text-accent-strong dark:text-accent" />
        </div>
        <div className="flex-1">
          <h1 className="v2-display text-xl">Çek / Senet (Ledger)</h1>
          <p className="text-xs text-[rgb(var(--v2-muted))]">Portföy · tahsil/ödeme → kasa posting · ciro</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="v2-btn v2-btn--ink v2-press flex items-center gap-1.5"
        >
          <Plus size={16} /> Ekle
        </button>
      </div>

      <section className="grid grid-cols-3 gap-3">
        <div className="v2-card p-3">
          <p className="v2-eyebrow text-[10px]">Alacak (Portföy)</p>
          <p className="mt-1 text-lg font-bold num text-accent-strong dark:text-accent">{formatCurrency(totalReceivable, "TRY")}</p>
        </div>
        <div className="v2-card p-3">
          <p className="v2-eyebrow text-[10px]">Borç (Portföy)</p>
          <p className="mt-1 text-lg font-bold num text-status-danger">{formatCurrency(totalPayable, "TRY")}</p>
        </div>
        <div className="v2-card p-3">
          <p className="v2-eyebrow text-[10px]">Toplam Kayıt</p>
          <p className="mt-1 text-lg font-bold text-[rgb(var(--v2-ink))]">{list.length}</p>
        </div>
      </section>

      {error && (
        <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-status-danger text-sm flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-accent-strong dark:text-accent" />
        </div>
      ) : list.length === 0 ? (
        <div className="v2-card p-8 text-center">
          <FileText size={32} className="mx-auto text-[rgb(var(--v2-muted))] mb-2" />
          <p className="text-[rgb(var(--v2-ink))] font-medium">Henüz çek/senet yok</p>
        </div>
      ) : (
        <section className="v2-card divide-y divide-[rgb(var(--v2-border))] overflow-hidden">
          {list.map((i) => {
            const overdue = i.due_date < today && (i.status === "CONFIRMED" || i.status === "PENDING_OCR");
            const canAct = i.status === "CONFIRMED";
            return (
              <div key={i.id} className={cn("p-4 flex items-start justify-between gap-3", overdue && "bg-status-danger/5")}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      "text-[9px] uppercase px-1.5 py-0.5 rounded-full border",
                      i.direction === "RECEIVED" ? "bg-accent/15 text-accent-strong dark:text-accent border-accent/30" : "bg-status-danger/15 text-status-danger border-status-danger/30",
                    )}>
                      {i.direction === "RECEIVED" ? "Alacak" : "Borç"}
                    </span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full v2-sunken text-[rgb(var(--v2-muted))] border border-[rgb(var(--v2-border))]">
                      {i.type === "CHECK" ? "Çek" : "Senet"}
                    </span>
                    <span className={cn("text-[9px] uppercase px-1.5 py-0.5 rounded-full border", STATUS_STYLE[i.status])}>
                      {STATUS_LABEL[i.status] ?? i.status}
                    </span>
                    {overdue && (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-status-danger/15 text-status-danger border border-status-danger/30">Vade Geçti</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-[rgb(var(--v2-ink))] mt-1 truncate">{i.issuer_name ?? "—"}</p>
                  <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">
                    Vade {new Date(i.due_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
                    {i.bank_name && <> · {i.bank_name}</>}
                    {i.serial_no && <> · #{i.serial_no}</>}
                    {i.endorsed_to_name && <> · ciro → {i.endorsed_to_name}</>}
                    {i.cashed_account_name && <> · {i.cashed_account_name}</>}
                  </p>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                  <p className={cn("text-sm font-semibold num", i.direction === "RECEIVED" ? "text-accent-strong dark:text-accent" : "text-status-danger")}>
                    {formatCurrency(i.amount, i.currency || "TRY")}
                  </p>
                  {canAct && (
                    <div className="flex gap-1">
                      <button onClick={() => handleCash(i)} disabled={busyId === i.id}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-accent/15 text-accent-strong dark:text-accent hover:bg-accent/25 border border-accent/30 disabled:opacity-50 v2-press">
                        {busyId === i.id ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                        {i.direction === "RECEIVED" ? "Tahsil" : "Öde"}
                      </button>
                      {i.direction === "RECEIVED" && (
                        <button onClick={() => handleEndorse(i)} disabled={busyId === i.id}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-status-warning/15 text-status-warning hover:bg-status-warning/25 border border-status-warning/30 disabled:opacity-50 v2-press">
                          <ArrowRightLeft size={10} /> Ciro
                        </button>
                      )}
                      <button onClick={() => handleBounce(i)} disabled={busyId === i.id}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-status-danger/15 text-status-danger hover:bg-status-danger/25 border border-status-danger/30 disabled:opacity-50 v2-press">
                        <XCircle size={10} /> K.sız
                      </button>
                    </div>
                  )}
                  {i.status === "CASHED" && (
                    <div className="flex flex-col items-end gap-1">
                      <span className="flex items-center gap-1 text-[10px] text-accent-strong dark:text-accent">
                        <BadgeCheck size={11} /> {i.direction === "RECEIVED" ? "Tahsil edildi" : "Ödendi"}
                      </span>
                      {/* Cross-link: hangi hesaba bağlandı (tahsilat işlemi) */}
                      {i.cashed_account_name && (
                        <span className="text-[9px] text-[rgb(var(--v2-muted))]">
                          → {i.cashed_account_name}
                          {i.cashed_at && ` · ${new Date(i.cashed_at).toLocaleDateString("tr-TR")}`}
                        </span>
                      )}
                      {/* Reverse: bağı kopar (yanlış bağladıysa) — P&L-nötr geri al */}
                      <button onClick={() => handleUncash(i)} disabled={busyId === i.id}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-status-warning/15 text-status-warning hover:bg-status-warning/25 border border-status-warning/30 disabled:opacity-50 v2-press">
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

  const fieldCls = "w-full px-3 py-2 text-sm rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] placeholder:text-[rgb(var(--v2-muted))] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all";
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="v2-card shadow-v2-hover w-full sm:max-w-md p-5 space-y-3 rounded-t-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[rgb(var(--v2-ink))]">Çek / Senet Ekle</h2>
        <div className="grid grid-cols-2 gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className={fieldCls}>
            <option value="CHECK">Çek</option>
            <option value="PROMISSORY_NOTE">Senet</option>
          </select>
          <select value={direction} onChange={(e) => setDirection(e.target.value)} className={fieldCls}>
            <option value="RECEIVED">Alacak (alınan)</option>
            <option value="GIVEN">Borç (verilen)</option>
          </select>
        </div>
        <input type="number" inputMode="decimal" placeholder="Tutar" value={amount} onChange={(e) => setAmount(e.target.value)} className={fieldCls} />
        <select value={issuerId} onChange={(e) => setIssuerId(e.target.value)} className={fieldCls}>
          <option value="">Keşideci / Karşı taraf (opsiyonel)</option>
          {counterparts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Banka" value={bankName} onChange={(e) => setBankName(e.target.value)} className={fieldCls} />
          <input placeholder="Çek/Seri No" value={serialNo} onChange={(e) => setSerialNo(e.target.value)} className={fieldCls} />
        </div>
        <div>
          <label className="text-xs text-[rgb(var(--v2-muted))]">Vade</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={fieldCls} />
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl v2-sunken hover:border-accent/50 text-[rgb(var(--v2-ink))] text-sm font-medium v2-press">İptal</button>
          <button onClick={submit} disabled={busy} className="flex-1 py-2 v2-btn v2-btn--ink v2-press text-sm font-semibold disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

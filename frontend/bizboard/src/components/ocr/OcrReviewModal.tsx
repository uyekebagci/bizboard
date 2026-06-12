"use client";

/**
 * OCR Modülü (WP 1bdb8116) — tarama sonucu review/confirm modalı.
 *
 * <p>OCR çıktısı kullanıcıya gösterilir: her alan düzenlenebilir + confidence
 * göstergesi (düşük güven vurgulu). Belge tipine göre hedef seçilir
 * (TRANSACTION fiş/dekont · INSTRUMENT çek/senet). Onayda mevcut create
 * servisleri çağrılır (yeni finansal mantık yok). Çift tema (.glass-card /
 * surface token'ları).</p>
 */

import { useMemo, useState } from "react";
import { X, AlertTriangle, Check, Loader2, ScanLine, FileText, Receipt } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type {
  BankAccountListItem,
  Category,
  Counterpart,
  OcrConfirmRequest,
  OcrScan,
} from "@/types";

interface Props {
  scan: OcrScan;
  categories: Category[];
  accounts: BankAccountListItem[];
  counterparts: Counterpart[];
  onClose: () => void;
  onConfirmed: () => void;
  onConfirm: (scanId: string, payload: OcrConfirmRequest) => Promise<OcrScan>;
}

type Target = "TRANSACTION" | "INSTRUMENT";

/** OCR alan değerini (string) sayıya çevir (TR format toleranslı). */
function toNumber(v: string | null | undefined): string {
  if (!v) return "";
  const cleaned = v.replace(/[^\d.,-]/g, "");
  if (cleaned.includes(",")) return cleaned.replace(/\./g, "").replace(",", ".");
  return cleaned;
}

/** OCR alan değerini ISO tarihe çevir (DD.MM.YYYY / DD/MM/YYYY → YYYY-MM-DD). */
function toIsoDate(v: string | null | undefined): string {
  if (!v) return "";
  const iso = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const tr = v.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (tr) {
    const dd = tr[1].padStart(2, "0");
    const mm = tr[2].padStart(2, "0");
    let yyyy = tr[3];
    if (yyyy.length === 2) yyyy = "20" + yyyy;
    return `${yyyy}-${mm}-${dd}`;
  }
  return "";
}

export function OcrReviewModal({
  scan,
  categories,
  accounts,
  counterparts,
  onClose,
  onConfirmed,
  onConfirm,
}: Props) {
  const fieldMap = useMemo(() => {
    const m: Record<string, { value: string | null; confidence: number | null; low: boolean }> = {};
    scan.fields.forEach((f) => {
      m[f.key] = { value: f.value, confidence: f.confidence, low: f.low_confidence };
    });
    return m;
  }, [scan.fields]);

  const initialTarget: Target =
    scan.document_type === "CHECK" || scan.document_type === "PROMISSORY_NOTE"
      ? "INSTRUMENT"
      : "TRANSACTION";

  const [target, setTarget] = useState<Target>(initialTarget);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Ortak alanlar (OCR'dan ön-doldurulmuş) ──
  const [amount, setAmount] = useState(toNumber(fieldMap.amount?.value));
  const [description, setDescription] = useState("");

  // ── TRANSACTION (fiş/dekont) ──
  const [direction, setDirection] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [date, setDate] = useState(toIsoDate(fieldMap.date?.value));
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"NAKIT" | "HESAPDAN">("NAKIT");
  const [bankAccountId, setBankAccountId] = useState("");

  // ── INSTRUMENT (çek/senet) ──
  const [instrumentType, setInstrumentType] = useState<"CHECK" | "PROMISSORY_NOTE">(
    scan.document_type === "PROMISSORY_NOTE" ? "PROMISSORY_NOTE" : "CHECK"
  );
  const [instrumentDirection, setInstrumentDirection] = useState<"RECEIVED" | "GIVEN">("RECEIVED");
  const [dueDate, setDueDate] = useState(toIsoDate(fieldMap.due_date?.value));
  const [bankName, setBankName] = useState(fieldMap.bank_name?.value ?? "");
  const [serialNo, setSerialNo] = useState(fieldMap.serial_no?.value ?? "");
  const [issuerCounterpartId, setIssuerCounterpartId] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setError("Tutar geçerli ve sıfırdan büyük olmalı");
      return;
    }
    const payload: OcrConfirmRequest = { target, amount: amt, description: description || null };
    if (target === "TRANSACTION") {
      if (!categoryId) { setError("Kategori seçin"); return; }
      payload.direction = direction;
      payload.date = date || null;
      payload.category_id = categoryId;
      payload.payment_method = paymentMethod;
      if (paymentMethod === "HESAPDAN") {
        if (!bankAccountId) { setError("Banka hesabı seçin"); return; }
        payload.bank_account_id = bankAccountId;
      }
    } else {
      if (!dueDate) { setError("Vade (due_date) zorunlu"); return; }
      payload.instrument_type = instrumentType;
      payload.instrument_direction = instrumentDirection;
      payload.due_date = dueDate;
      payload.bank_name = bankName || null;
      payload.serial_no = serialNo || null;
      if (issuerCounterpartId) payload.issuer_counterpart_id = issuerCounterpartId;
    }

    setSubmitting(true);
    try {
      await onConfirm(scan.id, payload);
      toast.success(
        target === "INSTRUMENT" ? "Çek/senet oluşturuldu" : "İşlem oluşturuldu"
      );
      onConfirmed();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Onaylanamadı");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
      >
        <div className="modal-header">
          <h3 className="modal-title flex items-center gap-2">
            <ScanLine size={16} className="text-brand-300" />
            OCR Sonucu — Onayla
          </h3>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Kapat">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sol: belge önizleme + OCR meta */}
          <div className="space-y-3">
            {scan.file_url ? (
              <div className="rounded-xl overflow-hidden border border-surface-600 bg-surface-900/40">
                {/* image/pdf — image inline, pdf link */}
                <DocPreview url={scan.file_url} />
              </div>
            ) : (
              <div className="rounded-xl border border-surface-600 p-6 text-center text-surface-400 text-sm">
                Önizleme yok
              </div>
            )}
            <div className="text-xs text-surface-400 space-y-1">
              <p>
                Sağlayıcı:{" "}
                <span className="text-surface-200 font-medium">{scan.ocr_provider ?? "—"}</span>
              </p>
              <p>
                Genel güven:{" "}
                <span className="text-surface-200 font-medium">
                  {scan.overall_confidence != null
                    ? `%${Math.round(scan.overall_confidence * 100)}`
                    : "—"}
                </span>
              </p>
            </div>
            {scan.note && (
              <div
                className={cn(
                  "p-2.5 rounded-lg text-xs flex items-start gap-2",
                  scan.has_low_confidence
                    ? "bg-amber-500/10 border border-amber-500/30 text-amber-300"
                    : "bg-surface-700/40 text-surface-300"
                )}
              >
                {scan.has_low_confidence && <AlertTriangle size={13} className="shrink-0 mt-0.5" />}
                <span>{scan.note}</span>
              </div>
            )}
            {/* Ham çıkarılan alanlar (confidence göstergeli) */}
            <div className="space-y-1.5">
              <p className="label text-[11px]">Çıkarılan alanlar</p>
              {scan.fields.length === 0 && (
                <p className="text-xs text-surface-400">Alan çıkarılamadı — manuel girin.</p>
              )}
              {scan.fields.map((f) => (
                <div
                  key={f.key}
                  className="flex items-center justify-between gap-2 text-xs px-2 py-1 rounded-md bg-surface-700/30"
                >
                  <span className="text-surface-400">{f.key}</span>
                  <span className="text-surface-200 truncate max-w-[55%]">{f.value || "—"}</span>
                  <ConfidenceBadge confidence={f.confidence} low={f.low_confidence} />
                </div>
              ))}
            </div>
          </div>

          {/* Sağ: düzenlenebilir onay formu */}
          <div className="space-y-3">
            {error && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle size={13} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Hedef seçici */}
            <div>
              <label className="label text-[11px]">Hedef kayıt tipi</label>
              <div className="flex rounded-xl overflow-hidden border border-surface-600 mt-1">
                <button
                  type="button"
                  onClick={() => setTarget("TRANSACTION")}
                  className={cn(
                    "flex-1 text-xs font-semibold py-2 flex items-center justify-center gap-1.5 transition-colors",
                    target === "TRANSACTION"
                      ? "bg-brand-600/25 text-brand-200"
                      : "bg-surface-700 text-surface-400"
                  )}
                >
                  <Receipt size={13} /> Fiş / İşlem
                </button>
                <button
                  type="button"
                  onClick={() => setTarget("INSTRUMENT")}
                  className={cn(
                    "flex-1 text-xs font-semibold py-2 flex items-center justify-center gap-1.5 transition-colors",
                    target === "INSTRUMENT"
                      ? "bg-brand-600/25 text-brand-200"
                      : "bg-surface-700 text-surface-400"
                  )}
                >
                  <FileText size={13} /> Çek / Senet
                </button>
              </div>
            </div>

            {/* Tutar (ortak) */}
            <Field label="Tutar *" confidence={fieldMap.amount?.confidence} low={fieldMap.amount?.low}>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input"
                placeholder="0.00"
              />
            </Field>

            {target === "TRANSACTION" ? (
              <>
                <div>
                  <label className="label text-[11px]">Yön</label>
                  <div className="flex rounded-xl overflow-hidden border border-surface-600 mt-1">
                    <button type="button" onClick={() => setDirection("EXPENSE")}
                      className={cn("flex-1 text-xs font-semibold py-2 transition-colors",
                        direction === "EXPENSE" ? "bg-red-600/25 text-red-300" : "bg-surface-700 text-surface-400")}>
                      Gider
                    </button>
                    <button type="button" onClick={() => setDirection("INCOME")}
                      className={cn("flex-1 text-xs font-semibold py-2 transition-colors",
                        direction === "INCOME" ? "bg-emerald-600/25 text-emerald-300" : "bg-surface-700 text-surface-400")}>
                      Gelir
                    </button>
                  </div>
                </div>
                <Field label="Tarih" confidence={fieldMap.date?.confidence} low={fieldMap.date?.low}>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
                </Field>
                <div>
                  <label className="label text-[11px]">Kategori *</label>
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input mt-1">
                    <option value="">Kategori seç...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label text-[11px]">Ödeme yöntemi</label>
                  <div className="flex rounded-xl overflow-hidden border border-surface-600 mt-1">
                    <button type="button" onClick={() => setPaymentMethod("NAKIT")}
                      className={cn("flex-1 text-xs font-semibold py-2 transition-colors",
                        paymentMethod === "NAKIT" ? "bg-brand-600/25 text-brand-200" : "bg-surface-700 text-surface-400")}>
                      Nakit
                    </button>
                    <button type="button" onClick={() => setPaymentMethod("HESAPDAN")}
                      className={cn("flex-1 text-xs font-semibold py-2 transition-colors",
                        paymentMethod === "HESAPDAN" ? "bg-brand-600/25 text-brand-200" : "bg-surface-700 text-surface-400")}>
                      Hesaptan
                    </button>
                  </div>
                </div>
                {paymentMethod === "HESAPDAN" && (
                  <div>
                    <label className="label text-[11px]">Banka hesabı *</label>
                    <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className="input mt-1">
                      <option value="">Hesap seç...</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <label className="label text-[11px]">Evrak tipi</label>
                  <select value={instrumentType} onChange={(e) => setInstrumentType(e.target.value as "CHECK" | "PROMISSORY_NOTE")} className="input mt-1">
                    <option value="CHECK">Çek</option>
                    <option value="PROMISSORY_NOTE">Senet</option>
                  </select>
                </div>
                <div>
                  <label className="label text-[11px]">Yön</label>
                  <div className="flex rounded-xl overflow-hidden border border-surface-600 mt-1">
                    <button type="button" onClick={() => setInstrumentDirection("RECEIVED")}
                      className={cn("flex-1 text-xs font-semibold py-2 transition-colors",
                        instrumentDirection === "RECEIVED" ? "bg-emerald-600/25 text-emerald-300" : "bg-surface-700 text-surface-400")}>
                      Alınan (alacak)
                    </button>
                    <button type="button" onClick={() => setInstrumentDirection("GIVEN")}
                      className={cn("flex-1 text-xs font-semibold py-2 transition-colors",
                        instrumentDirection === "GIVEN" ? "bg-red-600/25 text-red-300" : "bg-surface-700 text-surface-400")}>
                      Verilen (borç)
                    </button>
                  </div>
                </div>
                <Field label="Vade *" confidence={fieldMap.due_date?.confidence} low={fieldMap.due_date?.low}>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
                </Field>
                <Field label="Banka" confidence={fieldMap.bank_name?.confidence} low={fieldMap.bank_name?.low}>
                  <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} className="input" placeholder="Banka adı" />
                </Field>
                <Field label="Seri / Çek no" confidence={fieldMap.serial_no?.confidence} low={fieldMap.serial_no?.low}>
                  <input type="text" value={serialNo} onChange={(e) => setSerialNo(e.target.value)} className="input" placeholder="Çek/senet no" />
                </Field>
                <div>
                  <label className="label text-[11px]">Keşideci (karşı taraf)</label>
                  <select value={issuerCounterpartId} onChange={(e) => setIssuerCounterpartId(e.target.value)} className="input mt-1">
                    <option value="">Seç (opsiyonel)...</option>
                    {counterparts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="label text-[11px]">Açıklama</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="input mt-1" placeholder="Opsiyonel" />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            İptal
          </button>
          <button type="submit" disabled={submitting} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Onayla & Oluştur
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  confidence,
  low,
  children,
}: {
  label: string;
  confidence?: number | null;
  low?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="label text-[11px]">{label}</label>
        {confidence != null && <ConfidenceBadge confidence={confidence} low={!!low} />}
      </div>
      {children}
    </div>
  );
}

function ConfidenceBadge({ confidence, low }: { confidence: number | null; low: boolean }) {
  if (confidence == null) {
    return (
      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-surface-700/60 text-surface-400">
        ? güven
      </span>
    );
  }
  const pct = Math.round(confidence * 100);
  return (
    <span
      className={cn(
        "text-[9px] uppercase px-1.5 py-0.5 rounded-full border",
        low
          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
          : "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
      )}
    >
      %{pct}
    </span>
  );
}

function DocPreview({ url }: { url: string }) {
  // file_url backend'de "/files/{id}" — image içerik inline servis edilir.
  // PDF ise yeni sekmede aç linki gösteriyoruz (inline render iframe yerine basit tutuldu).
  const [imgError, setImgError] = useState(false);
  if (imgError) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block p-6 text-center text-brand-300 text-sm hover:underline"
      >
        Belgeyi yeni sekmede aç
      </a>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt="Taranan belge"
      className="w-full max-h-[280px] object-contain bg-surface-900/40"
      onError={() => setImgError(true)}
    />
  );
}

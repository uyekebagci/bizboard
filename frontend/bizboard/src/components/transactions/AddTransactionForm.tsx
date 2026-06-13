"use client";

/**
 * v1.6.23.26 (UI Fix WP TODO 06c8f232): Yeni işlem formu — reusable component.
 *
 * <p>Daha önce {@code /dashboard/add-transaction/page.tsx} içinde monolitik
 * 500+ satır forma vardı. v1.6.23.26'da form bu standalone component'e
 * taşındı; hem o page (URL route) hem de yeni {@link AddTransactionModal}
 * (Son İşlemler widget'ından inline açma) bu component'i kullanır.</p>
 *
 * <p>API: {@code POST /businesses/{id}/transactions}. Submit başarılı olursa
 * {@code onSuccess} ile parent'a haber verir — parent cache invalidate eder
 * (refreshConsolidated + refreshClosing + triggerRefresh).</p>
 */

import { useEffect, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Calendar, Clock, Tag, FileText,
  Loader2, CreditCard, Banknote, Plus, HandCoins, ArrowRight, ScrollText,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { cn, formatMoneyInput, parseMoneyInput, formatCurrency } from "@/lib/utils";
import type { AccountStatement } from "@/types";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { InlineFileUpload } from "@/components/shared/FileUploadButton";
import type { Business, Category, FileUploadInfo, PaymentMethod, Counterpart, PosDeviceListItem } from "@/types";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { QuickCounterpartModal } from "@/components/counterparts/QuickCounterpartModal";
import { QuickCategoryModal } from "@/components/transactions/QuickCategoryModal";
import type { Instrument } from "@/hooks/useInstruments";
import { CashLedgerInstrumentModal } from "@/components/instruments/CashLedgerInstrumentModal";

export interface AddTransactionFormProps {
  /** İşletme önceden seçili — modal "/business/[id]" pano'sundan açılırken kullanılır. */
  preselectedBusinessId?: string;
  /** "income" | "expense" — POS shortcut "income" varsayar. */
  preselectedType?: "income" | "expense" | null;
  /** "POS" | "NAKIT" — Son İşlemler shortcut'larından geçer. */
  preselectedPaymentMethod?: PaymentMethod | null;
  /** Submit başarılı olunca çağrılır — parent modal'ı kapatır ve cache'i invalidate eder. */
  onSuccess?: (transactionId: string) => void;
  /** Vazgeç butonuna basılınca veya modal kapanınca çağrılır. */
  onCancel?: () => void;
  /** Modal içinde mi render ediliyor? Submit sonrası router.back() yapma. */
  compact?: boolean;
  /**
   * v1.7.0.x dedicated page: direction toggle'ı gizle ve preselectedType'ı zorunlu kıl.
   * /dashboard/add-transaction/income ve /expense sayfaları kullanır.
   */
  lockDirection?: boolean;
  /**
   * v1.7.0.x dedicated page: payment method seçicisini gizle ve
   * preselectedPaymentMethod'u zorunlu kıl. /dashboard/add-transaction/pos
   * sayfası POS'a kilitler.
   */
  lockPaymentMethod?: boolean;
  /**
   * WP 08617251 (Beta v1.1 Closure Modülü): inline tx ekleme akışı.
   * Verilirse submit body'sine closure_session_id eklenir; tx draft
   * olarak işaretlenir. Closure finalize → strip, rollback → delete.
   */
  closureSessionId?: string;
}

export function AddTransactionForm({
  preselectedBusinessId = "",
  preselectedType = null,
  preselectedPaymentMethod = null,
  onSuccess,
  onCancel,
  compact = false,
  lockDirection = false,
  lockPaymentMethod = false,
  closureSessionId,
}: AddTransactionFormProps) {
  const { triggerRefresh } = useAppStore();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingBiz, setIsLoadingBiz] = useState(true);
  const [isLoadingCat, setIsLoadingCat] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Gün Açılışı enforcement: gün AÇIK değilken işlem reddedildiğinde (409
  // [DAY_NOT_OPEN]) "Günü Aç" yönlendirmesi göster (NON-BREAKING — flag kapalıyken
  // bu hata hiç oluşmaz).
  const [dayNotOpen, setDayNotOpen] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [businessId, setBusinessId] = useState(preselectedBusinessId);
  const [direction, setDirection] = useState<"income" | "expense">(preselectedType || "expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [categoryId, setCategoryId] = useState("");
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<FileUploadInfo[]>([]);

  // WP e4dc5271 (Beta v1.4) TODO 8c2d953d: Hızlı işlemlere kaydet
  const [saveAsQuickAction, setSaveAsQuickAction] = useState(false);
  const [quickActionName, setQuickActionName] = useState("");

  // Beta v1.1: tx-time manuel alt kasa atama (otomatik attribution'a EK).
  const [addToSubCash, setAddToSubCash] = useState(false);
  const [manualSubCashId, setManualSubCashId] = useState("");
  const [subCashList, setSubCashList] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api.get<Array<{ id: string; name: string; type: string }>>("/bank-accounts")
      .then((all) => {
        setSubCashList((all || []).filter((b) => b.type === "SUB_CASH"));
      })
      .catch(() => setSubCashList([]));
  }, []);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    preselectedPaymentMethod || "NAKIT",
  );
  // v1.7.x (POS Komisyon WP TODO 54f94805): pos_rate = BANKA oranı;
  // our_commission_rate = BİZİM müşteriden aldığımız oran.
  // Beta v1.1: POS komisyon state'i KALDIRILDI. Form submit body'sine
  // pos_rate/our_commission_rate gönderilmez; backend NULL kaydeder.
  // İlgili setter'ları PaymentMethod toggle'ında ihmal ediyoruz.

  const [counterparts, setCounterparts] = useState<Counterpart[]>([]);
  const [targetCounterpartId, setTargetCounterpartId] = useState<string>("");
  const [showCreateCounterpart, setShowCreateCounterpart] = useState(false);

  // cari-tahsilat-ux: Seçili karşı tarafın AÇIK alacak/verecek özeti.
  // Düz gelir/gider yerine yanlışlıkla tahsilat/ödeme girmeyi önlemek için
  // AKILLI YÖNLENDİRME katmanı besler. Mevcut /account-statement endpoint'i
  // reuse edilir (yeni ağır endpoint açılmaz); param yoksa öneri çıkmaz.
  const [cariOpen, setCariOpen] = useState<{
    receivable: number;
    payable: number;
  } | null>(null);
  const [cariLoading, setCariLoading] = useState(false);

  // çek/senet-tahsilat-ux: seçili cari'nin AÇIK (CONFIRMED) çek/senet evrakları,
  // yöne göre (income→RECEIVED alacak, expense→GIVEN borç). Nakit/banka GİRİŞİ
  // girilirken "bu bir çek/senet tahsilatı mı?" önerisini besler. Seçilince
  // P&L-nötr cash() çağrılır (düz gelir YERİNE — çift sayım yok). Cross-link
  // bağı kurar (instrument ↔ tahsilat hareketi). Boş liste → öneri çıkmaz.
  const [openInstruments, setOpenInstruments] = useState<Instrument[]>([]);
  const [instrumentToCash, setInstrumentToCash] = useState<Instrument | null>(null);

  const [posDevices, setPosDevices] = useState<PosDeviceListItem[]>([]);
  const [posDeviceId, setPosDeviceId] = useState<string>("");
  // BUG-2 (POS bank_account): POS GELİR'in düşeceği kasa/hesap seçimi. Boş
  // bırakılırsa backend sistem "Genel Nakit" kasasına route eder (gün-kapanışı/
  // mutabakata girer); seçilirse POS geliri belirtilen kasaya düşer.
  const [posIncomeBankAccountId, setPosIncomeBankAccountId] = useState<string>("");

  // v1.7.x hotfix: compact (modal) modunda outer 3'lü toggle Gelir/Gider arası
  // geçince form'un internal direction state'i de sync olmalı (initial useState
  // değeri ikinci kez tetiklenmediği için manuel sync gerekiyor).
  useEffect(() => {
    if (preselectedType && preselectedType !== direction) {
      setDirection(preselectedType);
      // Paylaşımlı kategori: yön değişse de seçim geçerli kalır (sıfırlama yok).
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedType]);

  // WP b446c696 (Beta v1.1 Hotfix): POS gider akışı GERİ GETİRİLDİ.
  // POS+EXPENSE artık geçerli; auto-NAKIT zorlaması kaldırıldı.

  // WP b446c696: POS gider alt-tipi (NAKIT default, kullanıcı Transfer'a geçer)
  // ve opsiyonel ilgili banka hesabı.
  const [posTxSubtype, setPosTxSubtype] = useState<"NAKIT" | "TRANSFER">("NAKIT");
  const [relatedBankAccountId, setRelatedBankAccountId] = useState<string>("");
  const [relatedBankAccounts, setRelatedBankAccounts] = useState<
    Array<{ id: string; name: string; type: string; current_balance?: number }>
  >([]);

  useEffect(() => {
    // POS gider TRANSFER alt-tipinde dropdown için aktif banka hesapları.
    if (!businessId) { setRelatedBankAccounts([]); return; }
    api.get<Array<{ id: string; name: string; type: string; current_balance?: number; is_active?: boolean; business_id?: string }>>(
      `/bank-accounts`,
    )
      .then((accs) => {
        setRelatedBankAccounts(
          (accs || [])
            .filter((a) => a.is_active !== false)
            .filter((a) => !a.business_id || a.business_id === businessId)
            .filter((a) => ["CHECKING", "SAVINGS", "CASH_HOLDER", "MAIN_CASH", "SUB_CASH"].includes(a.type)),
        );
      })
      .catch(() => setRelatedBankAccounts([]));
  }, [businessId]);

  // Beta v1.1 hotfix: subtype hem POS+EXPENSE hem NAKIT+EXPENSE için anlamlı.
  // Diğer durumlarda state temizle.
  useEffect(() => {
    const acceptsSubtype = direction === "expense"
      && (paymentMethod === "POS" || paymentMethod === "NAKIT");
    if (!acceptsSubtype) {
      if (posTxSubtype !== "NAKIT") setPosTxSubtype("NAKIT");
      if (relatedBankAccountId !== "") setRelatedBankAccountId("");
    }
  }, [paymentMethod, direction, posTxSubtype, relatedBankAccountId]);

  useEffect(() => {
    api.get<Counterpart[]>("/counterparts")
      .then((r) => setCounterparts(r || []))
      .catch(() => { /* silent */ });
  }, []);

  // cari-tahsilat-ux: Karşı taraf seçilince açık alacak/verecek özetini çek.
  // /counterparts/{id}/account-statement reuse — open_debts içinden RECEIVABLE
  // ve PAYABLE kalan tutarları toplar (kısmi ödeme aware: remaining_amount).
  // Hata/boş → öneri gösterme (silent, NON-BREAKING). Karşı taraf yoksa temizle.
  useEffect(() => {
    if (!targetCounterpartId) {
      setCariOpen(null);
      return;
    }
    let cancelled = false;
    setCariLoading(true);
    api.get<AccountStatement>(`/counterparts/${targetCounterpartId}/account-statement`)
      .then((s) => {
        if (cancelled) return;
        const debts = s?.open_debts ?? [];
        const receivable = debts
          .filter((d) => d.direction === "RECEIVABLE")
          .reduce((sum, d) => sum + (d.remaining_amount || 0), 0);
        const payable = debts
          .filter((d) => d.direction === "PAYABLE")
          .reduce((sum, d) => sum + (d.remaining_amount || 0), 0);
        setCariOpen({ receivable, payable });
      })
      .catch(() => { if (!cancelled) setCariOpen(null); })
      .finally(() => { if (!cancelled) setCariLoading(false); });
    return () => { cancelled = true; };
  }, [targetCounterpartId]);

  // çek/senet-tahsilat-ux: cari + yön değişince açık çek/senet evraklarını çek.
  // GET /instruments/open?counterpart_id=&direction=. Hata/boş → öneri yok
  // (silent, NON-BREAKING). business_id query'de zorunlu.
  useEffect(() => {
    if (!targetCounterpartId || !businessId) { setOpenInstruments([]); return; }
    let cancelled = false;
    const dir = direction === "income" ? "RECEIVED" : "GIVEN";
    api.get<Instrument[]>(
      `/instruments/open?business_id=${businessId}&counterpart_id=${targetCounterpartId}&direction=${dir}`,
    )
      .then((rows) => { if (!cancelled) setOpenInstruments(rows ?? []); })
      .catch(() => { if (!cancelled) setOpenInstruments([]); });
    return () => { cancelled = true; };
  }, [targetCounterpartId, businessId, direction]);

  useEffect(() => {
    api.get<PosDeviceListItem[]>("/pos-devices")
      .then((r) => setPosDevices(r || []))
      .catch(() => { /* silent */ });
  }, []);

  function handlePosDeviceChange(devId: string) {
    setPosDeviceId(devId);
    // Beta v1.1: komisyon auto-fill kaldırıldı (UI alanları yok).
  }

  useEffect(() => {
    async function fetchBusinesses() {
      try {
        const data = await api.get<Business[]>("/businesses");
        setBusinesses(data || []);
        if (data.length === 1 && !businessId) {
          setBusinessId(data[0].id);
        }
      } catch (err: unknown) {
        logger.error("api", "Add transaction businesses fetch failed", undefined, err);
      } finally {
        setIsLoadingBiz(false);
      }
    }
    fetchBusinesses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!businessId) {
      setCategories([]);
      return;
    }
    async function fetchCategories() {
      setIsLoadingCat(true);
      try {
        const data = await api.get<Category[]>(`/businesses/${businessId}/categories`);
        setCategories(data || []);
      } catch {
        setCategories([]);
      } finally {
        setIsLoadingCat(false);
      }
    }
    fetchCategories();
  }, [businessId]);

  // Ledger v2 (Faz A, §3.9): hibrit uygulanabilirlik süzme. Kategoriler
  // paylaşımlı (BOTH) ya da tek-tarafa kilitli (INCOME_ONLY/EXPENSE_ONLY)
  // olabilir. İşlem formu o anki yöne göre süzer: BOTH her zaman + yöne uygun
  // olan. applicability alanı yoksa (eski API) BOTH varsayılır → kırılma yok.
  const dirEnum = direction === "income" ? "INCOME" : "EXPENSE";
  const filteredCategories = [...categories]
    .filter((c) => {
      const appl = c.applicability ?? "BOTH";
      if (appl === "BOTH") return true;
      if (appl === "INCOME_ONLY") return dirEnum === "INCOME";
      return dirEnum === "EXPENSE"; // EXPENSE_ONLY
    })
    .sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "tr"),
    );

  // A7 (KİLİTLİ): tek-tarafa-kilit ihlali HARD-BLOCK DEĞİL — seçili kategori
  // o anki yöne uymuyorsa uyarı gösterilir ama kayıt engellenmez (STRICT, soft).
  const selectedCat = categories.find((c) => c.id === categoryId);
  const applicabilityWarning =
    selectedCat &&
    (selectedCat.applicability ?? "BOTH") !== "BOTH" &&
    !(
      (selectedCat.applicability === "INCOME_ONLY" && dirEnum === "INCOME") ||
      (selectedCat.applicability === "EXPENSE_ONLY" && dirEnum === "EXPENSE")
    )
      ? `"${selectedCat.name}" kategorisi ${
          selectedCat.applicability === "INCOME_ONLY" ? "yalnız gelir" : "yalnız gider"
        } için işaretli — bu ${direction === "income" ? "gelir" : "gider"} işlemine yine de izin verilir.`
      : null;

  // cari-tahsilat-ux: AKILLI YÖNLENDİRME (engelleme değil).
  // GELİR + açık ALACAK → "Bu bir tahsilat mı?" önerisi.
  // GİDER + açık VERECEK → "Bu bir ödeme mi?" önerisi.
  // Kullanıcı yine de düz gelir/gider girebilir (zorlama yok).
  const cariSuggestion =
    !targetCounterpartId || cariLoading || !cariOpen
      ? null
      : direction === "income" && cariOpen.receivable > 0
        ? {
            kind: "collect" as const,
            amount: cariOpen.receivable,
            title: "Bu bir TAHSİLAT olabilir",
            body: `Bu carinin ${formatCurrency(cariOpen.receivable, "TRY")} açık alacağı var. Düz gelir yerine Alacaklar'dan kapatmak (tahsilat) defteri doğru tutar — tahsilat P&L'i şişirmez.`,
            cta: "Tahsilat olarak gir",
          }
        : direction === "expense" && cariOpen.payable > 0
          ? {
              kind: "pay" as const,
              amount: cariOpen.payable,
              title: "Bu bir ÖDEME olabilir",
              body: `Bu carinin ${formatCurrency(cariOpen.payable, "TRY")} açık vereceği var. Düz gider yerine Verecekler'den kapatmak (ödeme) defteri doğru tutar — ödeme P&L'i şişirmez.`,
              cta: "Ödeme olarak gir",
            }
          : null;

  function goToPaymentFlow() {
    if (!cariSuggestion || !targetCounterpartId) return;
    const action = cariSuggestion.kind === "collect" ? "collect" : "pay";
    const url = `/dashboard/counterparts/${targetCounterpartId}?action=${action}`;
    // Modal (compact) içindeyse önce parent'a kapan sinyali ver, sonra yönlendir.
    if (onCancel) onCancel();
    window.location.href = url;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessId || !amount || !date || !time) return;
    // Kategori artık ZORUNLU — seçilmeden kayıt yok.
    if (!categoryId) {
      setError("Lütfen bir kategori seçin (zorunlu).");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setDayNotOpen(null);

    try {
      // Beta v1.1: POS komisyon alanları UI'dan kaldırıldı. Body'ye
      // pos_rate / our_commission_rate gönderilmez; backend NULL kaydeder.
      // KONSOLİDE NET legacy-aware (eski rate'li tx'ler korunur).
      const tx = await api.post<{ id: string }>(`/businesses/${businessId}/transactions`, {
        direction,
        amount: parseMoneyInput(amount),
        description: description || null,
        date,
        category_id: categoryId,
        payment_method: paymentMethod,
        target_counterpart_id: targetCounterpartId || null,
        pos_device_id: paymentMethod === "POS" && posDeviceId ? posDeviceId : null,
        // BUG-2 (POS bank_account): POS GELİR için seçilen kasa/hesap. Boşsa
        // backend sistem "Genel Nakit" kasasına route eder (gün-kapanışı/mutabakat).
        bank_account_id:
          paymentMethod === "POS" && direction === "income" && posIncomeBankAccountId
            ? posIncomeBankAccountId
            : null,
        // WP b446c696 (Beta v1.1 Hotfix): POS+EXPENSE ve NAKIT+EXPENSE için subtype.
        pos_tx_subtype:
          direction === "expense" && (paymentMethod === "POS" || paymentMethod === "NAKIT")
            ? posTxSubtype : null,
        related_bank_account_id:
          direction === "expense" && (paymentMethod === "POS" || paymentMethod === "NAKIT")
            && posTxSubtype === "TRANSFER" && relatedBankAccountId
            ? relatedBankAccountId
            : null,
        // Beta v1.1: tx-time manuel alt kasa atama
        manual_sub_cash_id: addToSubCash && manualSubCashId ? manualSubCashId : null,
        // WP 08617251: closure session etiketi (inline tx)
        closure_session_id: closureSessionId || null,
      });

      if (uploadedFiles.length > 0 && tx?.id) {
        for (const f of uploadedFiles) {
          try {
            await api.patch(`/files/${f.id}/link`, {
              entity_type: "transaction",
              entity_id: tx.id,
            });
          } catch {
            /* dosya linklemesi başarısız olsa bile devam et */
          }
        }
      }

      // WP e4dc5271 (Beta v1.4) TODO 8c2d953d: Hızlı işlem olarak kaydet
      if (saveAsQuickAction && quickActionName.trim()) {
        try {
          await api.post("/quick-actions", {
            business_id: businessId,
            name: quickActionName.trim(),
            tx_template: {
              direction,
              kind: "NORMAL",
              amount: parseMoneyInput(amount),
              payment_method: paymentMethod,
              bank_account_id: null, // AddTransactionForm bank seçimi yok
              pos_device_id: paymentMethod === "POS" && posDeviceId ? posDeviceId : null,
              counterpart_id: targetCounterpartId || null,
              // Beta v1.1: POS komisyon snapshot kaldırıldı
              applied_pos_rate: null,
              applied_our_commission_rate: null,
              category_id: categoryId,
              description: description || null,
              // Beta v1.1 hotfix: alt kasa atamasını da template'a kaydet —
              // hızlı işlem çağrılınca aynı sub-cash'e MANUAL inclusion eklenir.
              manual_sub_cash_id:
                addToSubCash && manualSubCashId ? manualSubCashId : null,
            },
          });
        } catch (qaErr: unknown) {
          // tx başarılı oldu ama hızlı işlem kayıt başarısız — yumuşak hata.
          logger.warn("api", "quick-action save failed (tx succeeded)", { err: String(qaErr) });
        }
      }

      setSuccess(true);
      triggerRefresh();
      const successMsg = paymentMethod === "POS"
        ? "POS işlemi kaydedildi"
        : direction === "income"
          ? "Gelir kaydedildi"
          : "Gider kaydedildi";
      toast.success(successMsg);
      // v1.6.23.26: callback ile parent'a haber ver; eski navigation logic
      // sadece page route'unda kalır.
      if (onSuccess) {
        setTimeout(() => onSuccess(tx.id), compact ? 400 : 1200);
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err, "İşlem eklenirken bir hata oluştu");
      // Gün Açılışı enforcement reddi → özel "Günü Aç" yönlendirmesi.
      if (msg.includes("[DAY_NOT_OPEN]")) {
        setDayNotOpen(msg.replace("[DAY_NOT_OPEN]", "").trim());
        setError(null);
      } else {
        setError(msg);
      }
      toast.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <form onSubmit={handleSubmit} className={cn("space-y-5", compact && "space-y-4")}>
      {/* Success Banner */}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-center">
          <p className="text-green-700 dark:text-green-300 text-sm font-medium">İşlem başarıyla eklendi!</p>
        </div>
      )}

      {/* Direction Toggle —
          v1.7.x hotfix: compact (modal) modunda outer AddTransactionModal'ın
          3'lü toggle'ı (Gelir/Gider/Transfer) direction'ı yönetir; iç toggle
          duplicate olmasın diye sadece standalone page'de gösterilir.
          v1.7.0.x: lockDirection ise dedicated page kendi yön kilidini
          tutar (chooser üzerinden gelir/gider seçildi). */}
      {!compact && !lockDirection && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setDirection("income")}
            className={cn(
              "v2-press flex items-center justify-center gap-2 py-3 rounded-2xl font-medium transition-all border-2",
              direction === "income"
                ? "bg-green-500/15 border-green-500/50 text-green-700 dark:text-green-300"
                : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50",
            )}
          >
            <ArrowDownLeft size={18} />
            Gelir
          </button>
          <button
            type="button"
            onClick={() => setDirection("expense")}
            className={cn(
              "v2-press flex items-center justify-center gap-2 py-3 rounded-2xl font-medium transition-all border-2",
              direction === "expense"
                ? "bg-red-500/15 border-red-500/50 text-red-700 dark:text-red-300"
                : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50",
            )}
          >
            <ArrowUpRight size={18} />
            Gider
          </button>
        </div>
      )}

      {/* Payment Method —
          WP b446c696 (Beta v1.1 Hotfix): POS gider akışı GERİ getirildi.
          POS butonu artık hem gelir hem gider için aktif. Gider modunda
          aşağıda "İşlem Tipi" alt-toggle çıkar (NAKIT / TRANSFER). */}
      <div>
        {!lockPaymentMethod && (
        <>
        <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">
          Ödeme Yöntemi *
        </label>
        <div className="grid gap-3 grid-cols-2">
          <button
            type="button"
            onClick={() => setPaymentMethod("NAKIT")}
            className={cn(
              "v2-press flex items-center justify-center gap-2 py-3 rounded-2xl font-medium transition-all border-2",
              paymentMethod === "NAKIT"
                ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-300"
                : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50",
            )}
          >
            <Banknote size={16} />
            Nakit
          </button>
          <button
            type="button"
            onClick={() => {
              setPaymentMethod("POS");
            }}
            className={cn(
              "v2-press flex items-center justify-center gap-2 py-3 rounded-2xl font-medium transition-all border-2",
              paymentMethod === "POS"
                ? "border-[rgb(var(--accent))]/60 bg-[rgb(var(--accent))]/12 text-accent-strong dark:text-accent"
                : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50",
            )}
          >
            <CreditCard size={16} />
            POS
          </button>
        </div>
        </>
        )}
        {paymentMethod === "POS" && (
          <>
            {posDevices.length > 0 && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-[rgb(var(--v2-muted))] mb-1.5">
                  POS Cihazi
                </label>
                <DarkSelect
                  value={posDeviceId}
                  onChange={handlePosDeviceChange}
                  placeholder="Cihaz seçin (opsiyonel)"
                  searchable={posDevices.length > 6}
                  options={posDevices.map((dev) => {
                    const bank = dev.last_used_rate ?? dev.default_rate;
                    const ours = dev.our_commission_rate;
                    const rateLabel =
                      bank != null && ours != null ? `banka %${bank} / biz %${ours}`
                      : bank != null ? `%${bank}`
                      : "";
                    return {
                      value: dev.id,
                      label: `${dev.name}${dev.bank_name ? " — " + dev.bank_name : ""}`,
                      meta: rateLabel,
                    };
                  })}
                  addOption={{
                    label: "+ Yeni POS Cihazı Ekle",
                    onClick: () => { window.location.href = "/dashboard/pos-cihazlari/yonetim"; },
                  }}
                />
              </div>
            )}
            {/* Beta v1.1: POS komisyon UI alanları kaldırıldı.
                Tx artık SADELEŞTİRİLDİ: tutar + cihaz + tarih + counterpart + açıklama.
                applied_pos_rate / applied_our_commission_rate backend tarafında
                NULL kaydedilir. KONSOLİDE NET formülü legacy-aware: eski rate'li
                tx'ler profit hesaplar, yeni'ler tam tutar income'a katkı yapar. */}

            {/* BUG-2 (POS bank_account): POS GELİR'in düşeceği kasa/hesap seçimi.
                Eskiden hiç gönderilmiyordu → POS geliri kasaya bağlanmıyor, gün-
                kapanışı/mutabakata girmiyordu. Boş = sistem "Genel Nakit" fallback. */}
            {direction === "income" && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-[rgb(var(--v2-muted))] mb-1.5">
                  Kasa / Hesap (POS geliri buraya düşer)
                </label>
                <DarkSelect
                  value={posIncomeBankAccountId}
                  onChange={setPosIncomeBankAccountId}
                  placeholder="Genel Nakit (varsayılan)"
                  searchable={relatedBankAccounts.length > 6}
                  options={relatedBankAccounts.map((a) => ({
                    value: a.id,
                    label: a.name,
                    meta: a.type,
                  }))}
                />
              </div>
            )}

          </>
        )}

        {/* WP b446c696 (Beta v1.1 Hotfix): Gider akışında alt-tip toggle —
            POS+EXPENSE veya NAKIT+EXPENSE durumunda görünür. */}
        {direction === "expense"
          && (paymentMethod === "POS" || paymentMethod === "NAKIT") && (
          <div className="mt-3 space-y-2">
            <label className="block text-xs font-medium text-[rgb(var(--v2-muted))]">
              İşlem Tipi
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["NAKIT", "TRANSFER"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setPosTxSubtype(opt)}
                  className={cn(
                    "v2-press py-2 px-3 rounded-xl text-xs font-medium border transition-all text-left",
                    posTxSubtype === opt
                      ? "border-[rgb(var(--accent))]/60 bg-[rgb(var(--accent))]/12 text-accent-strong dark:text-accent"
                      : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50",
                  )}
                >
                  <div className="font-semibold">
                    {opt === "NAKIT" ? "Nakit" : "Transfer"}
                  </div>
                  <div className="text-[10px] text-[rgb(var(--v2-muted))] mt-0.5">
                    {opt === "NAKIT"
                      ? (paymentMethod === "POS" ? "POS'tan nakit hareket" : "Elden nakit ödeme")
                      : "Banka hesabımıza/dan"}
                  </div>
                </button>
              ))}
            </div>

            {posTxSubtype === "TRANSFER" && (
              <div className="pt-1">
                <label className="block text-[11px] font-medium text-[rgb(var(--v2-muted))] mb-1">
                  İlgili Banka Hesabı (opsiyonel)
                </label>
                <DarkSelect
                  value={relatedBankAccountId}
                  onChange={setRelatedBankAccountId}
                  placeholder="Sonra seçebilirsin (opsiyonel)"
                  searchable={relatedBankAccounts.length > 6}
                  options={[
                    { value: "", label: "— (Atlanır)" },
                    ...relatedBankAccounts.map((b) => ({
                      value: b.id,
                      label: b.name,
                      meta: b.type,
                    })),
                  ]}
                />
                <p className="mt-1 text-[10px] text-[rgb(var(--v2-muted))]">
                  Sadece bilgi alanı — hesap bakiyesini etkilemez.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Amount */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">Tutar *</label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
            placeholder="0"
            required
            className="field py-3 text-2xl font-bold pr-14"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[rgb(var(--v2-muted))] font-medium">TRY</span>
        </div>
      </div>

      {/* Business */}
      {!preselectedBusinessId && (
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">İşletme *</label>
          {isLoadingBiz ? (
            <div className="h-12 v2-sunken rounded-xl animate-pulse" />
          ) : (
            <DarkSelect
              required
              value={businessId}
              onChange={(v) => { setBusinessId(v); setCategoryId(""); }}
              placeholder="İşletme seçin"
              searchable={businesses.length > 6}
              options={businesses.map((b) => ({ value: b.id, label: b.name }))}
              addOption={{
                label: "+ Yeni İşletme Ekle",
                onClick: () => { window.location.href = "/dashboard/businesses"; },
              }}
            />
          )}
        </div>
      )}

      {/* Counterpart */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">
          Karşı Taraf <span className="text-[rgb(var(--v2-muted))] font-normal text-xs">(opsiyonel)</span>
        </label>
        <DarkSelect
          value={targetCounterpartId}
          onChange={setTargetCounterpartId}
          placeholder="Seçim yapma"
          searchable={counterparts.length > 6}
          options={[
            ...counterparts
              .filter((c) => (c.kind ?? "FIRM") === "FIRM")
              .sort((a, b) => a.name.localeCompare(b.name, "tr"))
              .map((c) => ({ value: c.id, label: c.name, meta: "Firma" })),
            ...counterparts
              .filter((c) => c.kind === "PERSON")
              .sort((a, b) => a.name.localeCompare(b.name, "tr"))
              .map((c) => ({ value: c.id, label: c.name, meta: "Kişi" })),
          ]}
          addOption={{
            label: "+ Yeni Karşı Taraf Ekle",
            onClick: () => setShowCreateCounterpart(true),
          }}
        />

        {/* cari-tahsilat-ux: AKILLI YÖNLENDİRME — açık alacak/verecek varsa
            tahsilat/ödeme akışına yumuşak öneri (zorlama YOK, kısayol VAR). */}
        {cariSuggestion && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
            <div className="flex items-start gap-2.5">
              <HandCoins size={18} className="text-amber-300 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-200">
                  {cariSuggestion.title}
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-amber-100/90">
                  {cariSuggestion.body}
                </p>
                <button
                  type="button"
                  onClick={goToPaymentFlow}
                  className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors"
                >
                  {cariSuggestion.cta}
                  <ArrowRight size={14} />
                </button>
                <p className="mt-2 text-[10px] text-amber-200/70">
                  İstersen yine de düz {direction === "income" ? "gelir" : "gider"} olarak girebilirsin.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* çek/senet-tahsilat-ux: AKILLI ÖNERİ — bu cari'nin açık çek/senet'i
            varsa "bu bir çek/senet tahsilatı mı?" → P&L-nötr bağla (düz gelir
            yerine). POS'ta gizli (POS = kart/havuz; çek tahsilatı nakit/banka). */}
        {paymentMethod === "NAKIT" && openInstruments.length > 0 && (
          <div className="mt-3 rounded-xl border border-sky-500/40 bg-sky-500/10 p-3">
            <div className="flex items-start gap-2.5">
              <ScrollText size={18} className="text-sky-300 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-sky-200">
                  Bu bir ÇEK/SENET {direction === "income" ? "tahsilatı" : "ödemesi"} mi?
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-sky-100/90">
                  Bu carinin {openInstruments.length} açık çek/senet&apos;i var. Düz {direction === "income" ? "gelir" : "gider"} yerine
                  evrakı {direction === "income" ? "tahsil" : "ödeme"} olarak bağla — alacak/borç kapanır, P&amp;L şişmez (çift sayım yok).
                </p>
                <div className="mt-2.5 space-y-1.5">
                  {openInstruments.map((ins) => (
                    <button
                      key={ins.id}
                      type="button"
                      onClick={() => setInstrumentToCash(ins)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-left transition-colors"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-sky-100 truncate">
                          {ins.type === "CHECK" ? "Çek" : "Senet"}
                          {ins.serial_no ? ` #${ins.serial_no}` : ""}
                          {ins.bank_name ? ` · ${ins.bank_name}` : ""}
                        </span>
                        <span className="block text-[10px] text-sky-200/70">
                          Vade {ins.due_date}
                        </span>
                      </span>
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-sky-100">
                        {formatCurrency(ins.amount, ins.currency || "TRY")}
                        <ArrowRight size={13} />
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-sky-200/70">
                  İstersen yine de düz {direction === "income" ? "gelir" : "gider"} olarak girebilirsin.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Category — ZORUNLU. Form akışında öne çıkarıldı (kalın çerçeveli kart). */}
      <div
        className={cn(
          "rounded-2xl border-2 p-3 transition-colors",
          categoryId
            ? "border-[rgb(var(--accent))]/45 bg-[rgb(var(--accent))]/8"
            : "border-amber-500/40 bg-amber-500/5",
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-semibold text-[rgb(var(--v2-ink))]">
            <Tag size={14} className="inline mr-1" /> Kategori
            <span className="text-[rgb(var(--v2-muted))] font-normal text-[11px] ml-1">(ne tür?)</span>
            <span className="text-red-500 dark:text-red-400"> *</span>
          </label>
          {businessId && (
            <button
              type="button"
              onClick={() => setShowCreateCategory(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-strong dark:text-accent hover:opacity-80"
            >
              <Plus size={13} /> Yeni kategori
            </button>
          )}
        </div>
        {isLoadingCat ? (
          <div className="h-10 v2-sunken rounded-xl animate-pulse" />
        ) : filteredCategories.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {filteredCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryId(categoryId === cat.id ? "" : cat.id)}
                className={cn(
                  "v2-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                  categoryId === cat.id
                    ? "bg-[rgb(var(--accent))]/18 border-[rgb(var(--accent))]/60 text-accent-strong dark:text-accent"
                    : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50",
                )}
                style={
                  categoryId === cat.id && cat.color
                    ? { backgroundColor: `${cat.color}22`, borderColor: `${cat.color}88`, color: cat.color }
                    : undefined
                }
              >
                {cat.icon && <span>{cat.icon}</span>}
                {cat.name}
              </button>
            ))}
          </div>
        ) : businessId ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Henüz kategori yok — &quot;Yeni kategori&quot; ile hemen oluşturun.
          </p>
        ) : (
          <p className="text-xs text-[rgb(var(--v2-muted))]">Önce işletme seçin</p>
        )}
        {!categoryId && businessId && filteredCategories.length > 0 && (
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">Kayıt için bir kategori seçin.</p>
        )}
        {/* A7 (§3.9): tek-tarafa-kilit ihlali — uyarı, kayıt engellenmez. */}
        {applicabilityWarning && (
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">⚠️ {applicabilityWarning}</p>
        )}
      </div>

      {/* Date + Time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">
            <Calendar size={14} className="inline mr-1" /> Tarih *
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="field field-sm py-2.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">
            <Clock size={14} className="inline mr-1" /> Saat *
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            className="field field-sm py-2.5 dark:[&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-50"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">
          <FileText size={14} className="inline mr-1" /> Açıklama
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="İşlem açıklaması..."
          rows={2}
          className="field field-sm py-2.5 resize-none"
        />
      </div>

      {/* File Upload */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">Dosya / Fotoğraf</label>
        <InlineFileUpload
          category="receipt"
          entityType={businessId ? "business" : undefined}
          entityId={businessId || undefined}
          uploadedFiles={uploadedFiles}
          onUploaded={(f) => setUploadedFiles((prev) => [...prev, f])}
          onRemoveFile={(fid) => {
            setUploadedFiles((prev) => prev.filter((f) => f.id !== fid));
            api.delete(`/files/${fid}`).catch(() => {});
          }}
        />
      </div>

      {/* Beta v1.1: Bir alt kasaya da ekle (tx-time manuel atama) */}
      <div className="rounded-xl v2-sunken p-3 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={addToSubCash}
            onChange={(e) => setAddToSubCash(e.target.checked)}
            disabled={subCashList.length === 0}
            className="checkbox cursor-pointer"
          />
          <span className="text-sm font-medium text-[rgb(var(--v2-ink))]">
            🏦 Hesap / Alt-kasa
            <span className="text-[rgb(var(--v2-muted))] font-normal text-[11px] ml-1">(kim / nerede?)</span>
          </span>
          {subCashList.length === 0 && (
            <span className="text-[10px] text-[rgb(var(--v2-muted))]">(alt kasa yok)</span>
          )}
        </label>
        {addToSubCash && subCashList.length > 0 && (
          <div className="pl-6">
            <select
              value={manualSubCashId}
              onChange={(e) => setManualSubCashId(e.target.value)}
              className="field-sm"
            >
              <option value="">— Alt kasa seç —</option>
              {subCashList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-[rgb(var(--v2-muted))] mt-1">
              Otomatik attribution&apos;a EK — bu tx seçili alt kasaya da düşer.
            </p>
          </div>
        )}
      </div>

      {/* WP e4dc5271 (Beta v1.4) TODO 8c2d953d: Hızlı işlemlere kaydet */}
      <div className="rounded-xl v2-sunken p-3 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={saveAsQuickAction}
            onChange={(e) => setSaveAsQuickAction(e.target.checked)}
            className="checkbox cursor-pointer"
          />
          <span className="text-sm font-medium text-[rgb(var(--v2-ink))]">
            ⚡ Bu işlemi hızlı işlemlere kaydet
          </span>
        </label>
        {saveAsQuickAction && (
          <div className="pl-6 space-y-1">
            <input
              type="text"
              value={quickActionName}
              onChange={(e) => setQuickActionName(e.target.value)}
              placeholder='Örn: "Bi Dünya 300K POS", "Aylık Kira"'
              maxLength={100}
              className="field-sm"
            />
            <p className="text-[10px] text-[rgb(var(--v2-muted))]">
              Dashboard widget&apos;ından tek tıkla tekrar oluşturulabilir. Limit: 12/işletme.
            </p>
          </div>
        )}
      </div>

      {/* Gün Açılışı enforcement → "Günü Aç" yönlendirmesi */}
      {dayNotOpen && (
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-3 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sky-700 dark:text-sky-200 text-sm">{dayNotOpen}</p>
            <a href="/dashboard/gun-kapanisi"
              className="inline-block mt-2 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors">
              Günü Aç sayfasına git
            </a>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Submit + Cancel */}
      <div className={cn("flex gap-2", !compact && "flex-col")}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className={cn(
              "btn-secondary py-3 rounded-2xl",
              compact ? "flex-1" : "w-full order-2",
            )}
          >
            Vazgeç
          </button>
        )}
        <button
          type="submit"
          disabled={
            isSubmitting || !businessId || !amount || !categoryId || success ||
            // WP e4dc5271: toggle açıkken ad boş ise submit bloklu
            (saveAsQuickAction && !quickActionName.trim())
          }
          className={cn(
            "py-3 rounded-2xl font-semibold text-white flex items-center justify-center gap-2",
            "transition-all duration-150 hover:-translate-y-px active:translate-y-0",
            "disabled:opacity-50 disabled:pointer-events-none",
            direction === "income"
              ? "bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-600 shadow-[0_10px_22px_-12px_rgba(64,192,87,0.7)]"
              : "bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-600 shadow-[0_10px_22px_-12px_rgba(224,49,49,0.7)]",
            compact ? "flex-1" : "w-full order-1",
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Ekleniyor...
            </>
          ) : (
            <>
              {direction === "income" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
              {direction === "income" ? "Gelir Ekle" : "Gider Ekle"}
            </>
          )}
        </button>
      </div>
    </form>

    {showCreateCounterpart && (
      <QuickCounterpartModal
        businessId={businessId}
        onClose={() => setShowCreateCounterpart(false)}
        onCreated={(c) => {
          // Listeye ekle + otomatik seç
          setCounterparts((prev) => [...prev, c]);
          setTargetCounterpartId(c.id);
          setShowCreateCounterpart(false);
        }}
      />
    )}

    {showCreateCategory && (
      <QuickCategoryModal
        businessId={businessId}
        onClose={() => setShowCreateCategory(false)}
        onCreated={(c) => {
          // Paylaşımlı kategori: listeye ekle (varsa değiştir) + otomatik seç.
          // Yön filtresi olmadığı için yeni kategori chip listesinde ANINDA görünür.
          setCategories((prev) => {
            const exists = prev.some((p) => p.id === c.id);
            return exists ? prev.map((p) => (p.id === c.id ? c : p)) : [...prev, c];
          });
          setCategoryId(c.id);
          setShowCreateCategory(false);
        }}
      />
    )}

    {/* çek/senet-tahsilat-ux: seçilen evrakı P&L-nötr bağla (düz gelir YERİNE).
        cash() → POST /instruments/{id}/cash (Σ=0 posting, Net Kâr Δ=0). Başarılı
        olunca tx formunu KAPAT — bu tahsilat işlemi gelir kaydının yerine geçer. */}
    {instrumentToCash && (
      <CashLedgerInstrumentModal
        instrument={instrumentToCash}
        onCash={async (id, accountId, cashedDate) => {
          if (!businessId) throw new Error("İşletme seçili değil");
          return api.post(`/instruments/${id}/cash?business_id=${businessId}`, {
            account_id: accountId,
            cashed_date: cashedDate ?? null,
          });
        }}
        onClose={() => setInstrumentToCash(null)}
        onSuccess={() => {
          setInstrumentToCash(null);
          triggerRefresh();
          // Bu tahsilat düz gelir/gider'in yerine geçti → formu kapat.
          if (onSuccess) onSuccess("instrument-cash");
          else if (onCancel) onCancel();
        }}
      />
    )}
    </>
  );
}

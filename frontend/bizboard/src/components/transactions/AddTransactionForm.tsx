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
  Loader2, CreditCard, Banknote,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { cn, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { InlineFileUpload } from "@/components/shared/FileUploadButton";
import type { Business, Category, FileUploadInfo, PaymentMethod, Counterpart, PosDeviceListItem } from "@/types";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { QuickCounterpartModal } from "@/components/counterparts/QuickCounterpartModal";

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
  const [tags, setTags] = useState("");
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

  const [posDevices, setPosDevices] = useState<PosDeviceListItem[]>([]);
  const [posDeviceId, setPosDeviceId] = useState<string>("");

  // v1.7.x hotfix: compact (modal) modunda outer 3'lü toggle Gelir/Gider arası
  // geçince form'un internal direction state'i de sync olmalı (initial useState
  // değeri ikinci kez tetiklenmediği için manuel sync gerekiyor).
  useEffect(() => {
    if (preselectedType && preselectedType !== direction) {
      setDirection(preselectedType);
      setCategoryId("");
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

  // POS dışına geçilince state temizle.
  useEffect(() => {
    if (paymentMethod !== "POS" || direction !== "expense") {
      if (posTxSubtype !== "NAKIT") setPosTxSubtype("NAKIT");
      if (relatedBankAccountId !== "") setRelatedBankAccountId("");
    }
  }, [paymentMethod, direction, posTxSubtype, relatedBankAccountId]);

  useEffect(() => {
    api.get<Counterpart[]>("/counterparts")
      .then((r) => setCounterparts(r || []))
      .catch(() => { /* silent */ });
  }, []);

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

  const filteredCategories = categories.filter((c) => c.direction === direction);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessId || !amount || !date || !time) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Beta v1.1: POS komisyon alanları UI'dan kaldırıldı. Body'ye
      // pos_rate / our_commission_rate gönderilmez; backend NULL kaydeder.
      // KONSOLİDE NET legacy-aware (eski rate'li tx'ler korunur).
      const tx = await api.post<{ id: string }>(`/businesses/${businessId}/transactions`, {
        direction,
        amount: parseMoneyInput(amount),
        description: description || null,
        date,
        category_id: categoryId || null,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        payment_method: paymentMethod,
        target_counterpart_id: targetCounterpartId || null,
        pos_device_id: paymentMethod === "POS" && posDeviceId ? posDeviceId : null,
        // WP b446c696 (Beta v1.1 Hotfix): POS gider akışı.
        pos_tx_subtype:
          paymentMethod === "POS" && direction === "expense" ? posTxSubtype : null,
        related_bank_account_id:
          paymentMethod === "POS" && direction === "expense"
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
              category_id: categoryId || null,
              description: description || null,
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
      setError(getErrorMessage(err, "Islem eklenirken bir hata olustu"));
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
          <p className="text-green-300 text-sm font-medium">Islem basariyla eklendi!</p>
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
            onClick={() => { setDirection("income"); setCategoryId(""); }}
            className={cn(
              "flex items-center justify-center gap-2 py-3 rounded-2xl font-medium transition-all border-2",
              direction === "income"
                ? "bg-green-500/15 border-green-500/50 text-green-300"
                : "bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-300",
            )}
          >
            <ArrowDownLeft size={18} />
            Gelir
          </button>
          <button
            type="button"
            onClick={() => { setDirection("expense"); setCategoryId(""); }}
            className={cn(
              "flex items-center justify-center gap-2 py-3 rounded-2xl font-medium transition-all border-2",
              direction === "expense"
                ? "bg-red-500/15 border-red-500/50 text-red-300"
                : "bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-300",
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
        <label className="block text-sm font-medium text-surface-200 mb-1.5">
          Odeme Yontemi *
        </label>
        <div className="grid gap-3 grid-cols-2">
          <button
            type="button"
            onClick={() => setPaymentMethod("NAKIT")}
            className={cn(
              "flex items-center justify-center gap-2 py-3 rounded-2xl font-medium transition-all border-2",
              paymentMethod === "NAKIT"
                ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300"
                : "bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-300",
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
              "flex items-center justify-center gap-2 py-3 rounded-2xl font-medium transition-all border-2",
              paymentMethod === "POS"
                ? "bg-indigo-500/15 border-indigo-500/50 text-indigo-300"
                : "bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-300",
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
                <label className="block text-xs font-medium text-surface-300 mb-1.5">
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

            {/* WP b446c696 (Beta v1.1 Hotfix): POS gider akışı — alt-tip toggle */}
            {direction === "expense" && (
              <div className="mt-3 space-y-2">
                <label className="block text-xs font-medium text-surface-300">
                  İşlem Tipi
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["NAKIT", "TRANSFER"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setPosTxSubtype(opt)}
                      className={cn(
                        "py-2 px-3 rounded-xl text-xs font-medium border transition-all text-left",
                        posTxSubtype === opt
                          ? "bg-indigo-500/15 border-indigo-500/50 text-indigo-200"
                          : "bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-300",
                      )}
                    >
                      <div className="font-semibold">
                        {opt === "NAKIT" ? "Nakit" : "Transfer"}
                      </div>
                      <div className="text-[10px] text-surface-400 mt-0.5">
                        {opt === "NAKIT"
                          ? "POS'tan nakit hareket"
                          : "Banka hesabımıza/dan"}
                      </div>
                    </button>
                  ))}
                </div>

                {posTxSubtype === "TRANSFER" && (
                  <div className="pt-1">
                    <label className="block text-[11px] font-medium text-surface-300 mb-1">
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
                    <p className="mt-1 text-[10px] text-surface-500">
                      Sadece bilgi alanı — hesap bakiyesini etkilemez.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Amount */}
      <div>
        <label className="block text-sm font-medium text-surface-200 mb-1.5">Tutar *</label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
            placeholder="0"
            required
            className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-2xl font-bold text-white placeholder:text-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400 font-medium">TRY</span>
        </div>
      </div>

      {/* Business */}
      {!preselectedBusinessId && (
        <div>
          <label className="block text-sm font-medium text-surface-200 mb-1.5">Isletme *</label>
          {isLoadingBiz ? (
            <div className="h-12 bg-surface-700 rounded-xl animate-pulse" />
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
        <label className="block text-sm font-medium text-surface-200 mb-1.5">
          Karsi Taraf <span className="text-surface-400 font-normal text-xs">(opsiyonel)</span>
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
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-surface-200 mb-1.5">
          <Tag size={14} className="inline mr-1" /> Kategori
        </label>
        {isLoadingCat ? (
          <div className="h-12 bg-surface-700 rounded-xl animate-pulse" />
        ) : filteredCategories.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {filteredCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryId(categoryId === cat.id ? "" : cat.id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                  categoryId === cat.id
                    ? "bg-brand-500/15 border-brand-500/50 text-brand-300"
                    : "bg-surface-700 border-surface-600 text-surface-300 hover:border-surface-300",
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        ) : businessId ? (
          <p className="text-xs text-surface-400">Bu yonde kategori bulunamadi</p>
        ) : (
          <p className="text-xs text-surface-400">Once isletme secin</p>
        )}
      </div>

      {/* Date + Time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-surface-200 mb-1.5">
            <Calendar size={14} className="inline mr-1" /> Tarih *
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-200 mb-1.5">
            <Clock size={14} className="inline mr-1" /> Saat *
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-50"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-surface-200 mb-1.5">
          <FileText size={14} className="inline mr-1" /> Aciklama
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Islem aciklamasi..."
          rows={2}
          className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
        />
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-surface-200 mb-1.5">Etiketler</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Virgul ile ayirin: malzeme, ofis, fatura"
          className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* File Upload */}
      <div>
        <label className="block text-sm font-medium text-surface-200 mb-1.5">Dosya / Fotograf</label>
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
      <div className="rounded-xl border border-surface-600 bg-surface-700/40 p-3 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={addToSubCash}
            onChange={(e) => setAddToSubCash(e.target.checked)}
            disabled={subCashList.length === 0}
            className="w-4 h-4 rounded border-surface-500 bg-surface-800 accent-brand-500 cursor-pointer"
          />
          <span className="text-sm font-medium text-surface-200">
            🏦 Bir alt kasaya da ekle (manuel)
          </span>
          {subCashList.length === 0 && (
            <span className="text-[10px] text-surface-500">(alt kasa yok)</span>
          )}
        </label>
        {addToSubCash && subCashList.length > 0 && (
          <div className="pl-6">
            <select
              value={manualSubCashId}
              onChange={(e) => setManualSubCashId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">— Alt kasa seç —</option>
              {subCashList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-surface-400 mt-1">
              Otomatik attribution&apos;a EK — bu tx seçili alt kasaya da düşer.
            </p>
          </div>
        )}
      </div>

      {/* WP e4dc5271 (Beta v1.4) TODO 8c2d953d: Hızlı işlemlere kaydet */}
      <div className="rounded-xl border border-surface-600 bg-surface-700/40 p-3 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={saveAsQuickAction}
            onChange={(e) => setSaveAsQuickAction(e.target.checked)}
            className="w-4 h-4 rounded border-surface-500 bg-surface-800 accent-brand-500 cursor-pointer"
          />
          <span className="text-sm font-medium text-surface-200">
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
              className="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <p className="text-[10px] text-surface-400">
              Dashboard widget&apos;ından tek tıkla tekrar oluşturulabilir. Limit: 12/işletme.
            </p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          <p className="text-red-300 text-sm">{error}</p>
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
              "py-3 rounded-2xl font-semibold border border-surface-600 bg-surface-700 hover:bg-surface-600 text-surface-200 disabled:opacity-50",
              compact ? "flex-1" : "w-full order-2",
            )}
          >
            Vazgec
          </button>
        )}
        <button
          type="submit"
          disabled={
            isSubmitting || !businessId || !amount || success ||
            // WP e4dc5271: toggle açıkken ad boş ise submit bloklu
            (saveAsQuickAction && !quickActionName.trim())
          }
          className={cn(
            "py-3 rounded-2xl font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50",
            direction === "income"
              ? "bg-green-600 hover:bg-green-700"
              : "bg-red-600 hover:bg-red-700",
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
    </>
  );
}

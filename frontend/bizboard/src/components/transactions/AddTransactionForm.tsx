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
import { InlineFileUpload } from "@/components/shared/FileUploadButton";
import type { Business, Category, FileUploadInfo, PaymentMethod, Counterpart, PosDeviceListItem } from "@/types";
import { DarkSelect } from "@/components/shared/DarkSelect";

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
}

export function AddTransactionForm({
  preselectedBusinessId = "",
  preselectedType = null,
  preselectedPaymentMethod = null,
  onSuccess,
  onCancel,
  compact = false,
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    preselectedPaymentMethod || "NAKIT",
  );
  // v1.7.x (POS Komisyon WP TODO 54f94805): pos_rate = BANKA oranı;
  // our_commission_rate = BİZİM müşteriden aldığımız oran.
  const [posRate, setPosRate] = useState("");
  const [ourCommissionRate, setOurCommissionRate] = useState("");

  const [counterparts, setCounterparts] = useState<Counterpart[]>([]);
  const [targetCounterpartId, setTargetCounterpartId] = useState<string>("");

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

  // v1.7.x: Gider seçilince POS opsiyonu mantıksız → otomatik NAKIT'a çek.
  useEffect(() => {
    if (direction === "expense" && paymentMethod === "POS") {
      setPaymentMethod("NAKIT");
      setPosRate("");
      setOurCommissionRate("");
      setPosDeviceId("");
    }
  }, [direction, paymentMethod]);

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
    if (!devId) return;
    const dev = posDevices.find((p) => p.id === devId);
    if (!dev) return;
    // v1.7.x (POS Komisyon WP TODO 54f94805): cihaz seçilince hem banka oranı
    // hem bizim oran auto-fill (boşsa). Manuel override için zaten dolu olanı
    // tekrar yazma.
    const bankRate = dev.last_used_rate ?? dev.default_rate;
    if (bankRate != null) {
      setPosRate(String(bankRate));
    }
    if (dev.our_commission_rate != null) {
      setOurCommissionRate(String(dev.our_commission_rate));
    }
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
      const posRateValue =
        paymentMethod === "POS" && posRate.trim() !== ""
          ? Number(posRate.replace(",", "."))
          : null;
      // v1.7.x (POS Komisyon WP TODO 54f94805): bizim oran POS için zorunlu.
      const ourRateValue =
        paymentMethod === "POS" && ourCommissionRate.trim() !== ""
          ? Number(ourCommissionRate.replace(",", "."))
          : null;

      // Client-side validation: our >= bank (server da aynı kontrolü yapar)
      if (paymentMethod === "POS" && ourRateValue != null && posRateValue != null
          && ourRateValue < posRateValue) {
        setError("Bizim komisyonumuz banka komisyonundan düşük olamaz");
        setIsSubmitting(false);
        return;
      }

      const tx = await api.post<{ id: string }>(`/businesses/${businessId}/transactions`, {
        direction,
        amount: parseMoneyInput(amount),
        description: description || null,
        date,
        category_id: categoryId || null,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        payment_method: paymentMethod,
        pos_rate: posRateValue,
        our_commission_rate: ourRateValue,
        target_counterpart_id: targetCounterpartId || null,
        pos_device_id: paymentMethod === "POS" && posDeviceId ? posDeviceId : null,
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

      setSuccess(true);
      triggerRefresh();
      // v1.6.23.26: callback ile parent'a haber ver; eski navigation logic
      // sadece page route'unda kalır.
      if (onSuccess) {
        setTimeout(() => onSuccess(tx.id), compact ? 400 : 1200);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Islem eklenirken bir hata olustu"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
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
          duplicate olmasın diye sadece standalone page'de gösterilir. */}
      {!compact && (
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
          v1.7.x: POS yalnız Gelir yönünde anlamlıdır (komisyon = tahsilat
          kesintisi; gider akışında karşılığı yok). Gider seçiliyken POS
          butonu gizlenir, paymentMethod otomatik NAKIT'a çekilir. */}
      <div>
        <label className="block text-sm font-medium text-surface-200 mb-1.5">
          Odeme Yontemi *
        </label>
        <div className={cn(
          "grid gap-3",
          direction === "income" ? "grid-cols-2" : "grid-cols-1",
        )}>
          <button
            type="button"
            onClick={() => { setPaymentMethod("NAKIT"); setPosRate(""); setOurCommissionRate(""); }}
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
          {direction === "income" && (
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
          )}
        </div>
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
            {/* v1.7.x (POS Komisyon WP TODO 54f94805): iki oran input */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-surface-300 mb-1.5">
                  Banka Komisyonu (%)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={posRate}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^0-9.,]/g, "");
                      setPosRate(cleaned);
                    }}
                    placeholder="orn. 1.95"
                    className="w-full px-3 py-2 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 text-sm">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-300 mb-1.5">
                  Bizim Komisyonumuz (%)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={ourCommissionRate}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^0-9.,]/g, "");
                      setOurCommissionRate(cleaned);
                    }}
                    placeholder="orn. 5.50"
                    className="w-full px-3 py-2 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 text-sm">%</span>
                </div>
              </div>
            </div>
            {/* v1.7.x (POS Komisyon WP TODO 54f94805): inline validation + breakdown */}
            {(() => {
              const bank = posRate.trim() !== "" ? Number(posRate.replace(",", ".")) : NaN;
              const ours = ourCommissionRate.trim() !== "" ? Number(ourCommissionRate.replace(",", ".")) : NaN;
              const amt = parseMoneyInput(amount);
              if (!isNaN(bank) && !isNaN(ours) && ours < bank) {
                return (
                  <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    Bizim komisyonumuz banka komisyonundan düşük olamaz.
                  </div>
                );
              }
              if (!isNaN(bank) && !isNaN(ours) && amt > 0) {
                const bankAmt = (amt * bank) / 100;
                const ourAmt = (amt * ours) / 100;
                const profit = ourAmt - bankAmt;
                const fmt = (n: number) =>
                  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const fmtRate = (n: number) =>
                  `%${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                // v1.7.x (POS Komisyon WP TODO 54f94805): brief spec breakdown card
                return (
                  <div className="mt-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200 space-y-1">
                    <div className="flex justify-between">
                      <span>İşlem Tutarı:</span>
                      <span className="font-mono">₺{fmt(amt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Banka Komisyonu:</span>
                      <span className="font-mono">₺{fmt(bankAmt)} <span className="text-indigo-300/70">({fmtRate(bank)})</span></span>
                    </div>
                    <div className="flex justify-between">
                      <span>Bizim Komisyon:</span>
                      <span className="font-mono">₺{fmt(ourAmt)} <span className="text-indigo-300/70">({fmtRate(ours)})</span></span>
                    </div>
                    <div className="flex justify-between border-t border-indigo-500/30 pt-1 font-bold text-emerald-300">
                      <span>Net Kâr (gelir):</span>
                      <span className="font-mono">₺{fmt(profit)}</span>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
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
            onClick: () => { window.location.href = "/dashboard/counterparts"; },
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
          disabled={isSubmitting || !businessId || !amount || success}
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
  );
}

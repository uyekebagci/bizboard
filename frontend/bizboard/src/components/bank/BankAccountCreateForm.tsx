"use client";

/**
 * v1.6.23.26 (UI Fix WP TODO b12c1dce): Banka hesabı yarat formu — reusable.
 *
 * <p>İki yerde kullanılır:</p>
 * <ul>
 *   <li>{@code /dashboard/hesaplar} sayfasındaki standalone modal'da
 *       ({@code CreateBankAccountModal})</li>
 *   <li>"Para Bulunan Hesaplar" widget modal'ı içinde inline nested form
 *       olarak — modal dışına çıkmadan hesap/kasa ekleme</li>
 * </ul>
 *
 * <p>{@code mode="SUB_CASH"} prop'u ile tip seçici gizlenip yalnız SUB_CASH
 * yaratılır ("+ Kasa Oluştur" akışı için). {@code mode="ANY"} default —
 * kullanıcı CHECKING/SAVINGS/SUB_CASH/CASH_HOLDER seçer.</p>
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { cn, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { useBusinesses } from "@/hooks/useBusinesses";
import { toast } from "@/lib/toast";
import type { BankAccountType, MyCompany } from "@/types";

type CreatableType = Exclude<BankAccountType, "MAIN_CASH">;

const CREATABLE_TYPES: { value: CreatableType; label: string; hint?: string }[] = [
  { value: "CHECKING",    label: "Banka (Vadesiz)", hint: "Banka cari hesabı" },
  { value: "SAVINGS",     label: "Vadeli Hesap",     hint: "Vadeli mevduat hesabı" },
  { value: "SUB_CASH",    label: "Alt Kasa",         hint: "Ana kasa dışında ek nakit havuzu" },
  { value: "CASH_HOLDER", label: "Kişide Tutulan",   hint: "Bir kişide bulunan nakit (holder seç)" },
];

export interface BankAccountCreateFormProps {
  /** Mevcut görünen businesses (parent modal'ın bildiği) — boşsa useBusinesses fallback. */
  businesses?: { id: string; name: string }[];
  /** "ANY" = kullanıcı tip seçer, "SUB_CASH" = yalnız alt kasa (tip seçici gizli). */
  mode?: "ANY" | "SUB_CASH";
  /** Önceden seçili işletme (widget single-business context'inden gelir). */
  preselectedBusinessId?: string;
  onCancel: () => void;
  onCreated: () => void;
}

export function BankAccountCreateForm({
  businesses = [], mode = "ANY", preselectedBusinessId,
  onCancel, onCreated,
}: BankAccountCreateFormProps) {
  const { businesses: allBusinesses } = useBusinesses();
  const bizOptions = businesses.length > 0
    ? businesses
    : (allBusinesses ?? []).map((b) => ({ id: b.id, name: b.name }));

  const [businessId, setBusinessId] = useState<string>(
    preselectedBusinessId ?? bizOptions[0]?.id ?? "",
  );
  const [type, setType] = useState<CreatableType>(mode === "SUB_CASH" ? "SUB_CASH" : "CHECKING");
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  // Beta v1.1 (WP 2786a36e): CASH_HOLDER artık standalone — counterpart yok.
  const [holderName, setHolderName] = useState("");
  const [holderPhone, setHolderPhone] = useState("");
  const [holderNotes, setHolderNotes] = useState("");
  /** Kullanıcı hesap adını manuel düzeltirse otomatik suggest devre dışı. */
  const [nameTouched, setNameTouched] = useState(false);
  // v1.7.0.x: ownerMyCompany — banka hesabı kendi firmamıza bağlanabilir.
  const [ownerMyCompanyId, setOwnerMyCompanyId] = useState("");
  const [myCompanies, setMyCompanies] = useState<MyCompany[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Firmalarım listesi — tüm tipler için opsiyonel ek alan.
  useEffect(() => {
    api.get<MyCompany[]>("/firms")
      .then((all) => setMyCompanies(all || []))
      .catch(() => setMyCompanies([]));
  }, []);

  // Beta v1.1: CASH_HOLDER artık standalone — counterpart fetch kaldırıldı.
  // Holder adı yazıldıkça hesap adı auto-suggest ("<Okan> (Eldeki)").
  useEffect(() => {
    if (type !== "CASH_HOLDER") return;
    if (nameTouched) return;
    setName(holderName.trim() ? `${holderName.trim()} (Eldeki)` : "");
  }, [holderName, type, nameTouched]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!businessId) { setError("İşletme seçin"); return; }
    if (!name.trim()) { setError("Hesap adı zorunlu"); return; }
    if (type === "CASH_HOLDER" && !holderName.trim()) {
      setError("Kişide tutulan için kişi adı zorunlu");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        business_id: businessId,
        name: name.trim(),
        type,
      };
      if (bankName.trim()) body.bank_name = bankName.trim();
      if (iban.trim()) body.iban = iban.trim().toUpperCase();
      if (openingBalance) body.opening_balance = parseMoneyInput(openingBalance);
      if (type === "CASH_HOLDER") {
        // Beta v1.1: standalone — holder_name mandatory, telefon/notlar opsiyonel.
        body.holder_name = holderName.trim();
        if (holderPhone.trim()) body.holder_phone = holderPhone.trim();
        if (holderNotes.trim()) body.holder_notes = holderNotes.trim();
      }
      // v1.7.0.x: ownerMyCompany (opsiyonel) — null gönderilirse boş kalır.
      body.owner_my_company_id = ownerMyCompanyId || null;
      await api.post("/bank-accounts", body);
      toast.success("Hesap kaydedildi");
      onCreated();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Hesap olusturulamadi";
      setError(msg);
      logger.error("api", "bank-account create failed", { type, businessId }, err);
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* İşletme — preselected ise gizli */}
      {!preselectedBusinessId && (
        <div>
          <label className="text-[11px] text-surface-400 uppercase mb-1 block">İşletme</label>
          <DarkSelect
            required
            value={businessId}
            onChange={setBusinessId}
            placeholder={bizOptions.length === 0 ? "İşletme yok" : "İşletme seçin"}
            searchable={bizOptions.length > 6}
            options={bizOptions.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>
      )}

      {/* Tip seçici — sadece mode="ANY" */}
      {mode === "ANY" && (
        <div>
          <label className="text-[11px] text-surface-400 uppercase mb-1 block">Tip</label>
          <div className="grid grid-cols-2 gap-2">
            {CREATABLE_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={cn(
                  "p-2.5 rounded-lg border text-left transition-colors",
                  type === t.value
                    ? "border-brand-500 bg-brand-500/10 text-white"
                    : "border-surface-600 bg-surface-900 hover:border-surface-500 text-surface-200",
                )}
              >
                <p className="text-sm font-medium">{t.label}</p>
                {t.hint && <p className="text-[10px] text-surface-400 mt-0.5">{t.hint}</p>}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-amber-300/80 mt-1.5 flex items-center gap-1">
            <Lock size={9} />
            "Ana Kasa" otomatik yaratılır — yeni hesap olarak seçilemez.
          </p>
        </div>
      )}

      {mode === "SUB_CASH" && (
        <p className="text-[11px] text-emerald-300/80 flex items-center gap-1.5">
          <Lock size={10} />
          Yeni "Alt Kasa" oluşturuluyor. Ana Kasa dışında ek nakit havuzu.
        </p>
      )}

      {/* Hesap adı */}
      <div>
        <label className="text-[11px] text-surface-400 uppercase mb-1 block">Hesap Adı</label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
          placeholder={
            type === "SUB_CASH" ? "Ör. Kasa #2"
              : type === "CASH_HOLDER" ? "Ör. Okan (Eldeki)"
              : "Ör. Garanti Vakif"
          }
          className="field field-sm py-2"
          required
          autoFocus={type !== "CASH_HOLDER"}
        />
      </div>

      {/* Banka adı + IBAN — sadece CHECKING/SAVINGS için */}
      {(type === "CHECKING" || type === "SAVINGS") && (
        <>
          <div>
            <label className="text-[11px] text-surface-400 uppercase mb-1 block">Banka Adı</label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Ör. Garanti BBVA"
              className="field field-sm py-2"
            />
          </div>
          <div>
            <label className="text-[11px] text-surface-400 uppercase mb-1 block">IBAN</label>
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="TR..."
              className="field field-sm py-2 font-mono"
            />
          </div>
        </>
      )}

      {/* CASH_HOLDER — Beta v1.1 (WP 2786a36e): standalone, 3 free-text input.
          Counterpart yaratmaz; counterpart sayfası temiz kalır. */}
      {type === "CASH_HOLDER" && (
        <>
          <div>
            <label className="text-[11px] text-surface-400 uppercase mb-1 block">
              Kişi Adı <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder="Ör. Okan"
              className="field field-sm py-2"
              required
              autoFocus
              maxLength={200}
            />
            <p className="text-[10px] text-surface-500 mt-1">
              Hesap adı otomatik öneriliyor; istersen üstte değiştirebilirsin.
            </p>
          </div>
          <div>
            <label className="text-[11px] text-surface-400 uppercase mb-1 block">
              Telefon (opsiyonel)
            </label>
            <input
              type="tel"
              value={holderPhone}
              onChange={(e) => setHolderPhone(e.target.value)}
              placeholder="+90 5__ ___ __ __"
              className="field field-sm py-2"
              maxLength={20}
            />
          </div>
          <div>
            <label className="text-[11px] text-surface-400 uppercase mb-1 block">
              Not (opsiyonel)
            </label>
            <textarea
              value={holderNotes}
              onChange={(e) => setHolderNotes(e.target.value)}
              placeholder="Kısa açıklama (örn. saha şefi, eldeki avans)"
              rows={2}
              className="field field-sm py-2 resize-none"
            />
          </div>
        </>
      )}

      {/* v1.7.0.x: Sahip Firma (Firmalarım) — opsiyonel her tip için */}
      <div>
        <label className="text-[11px] text-surface-400 uppercase mb-1 block">
          Sahip Firma (Firmalarım, opsiyonel)
        </label>
        <DarkSelect
          value={ownerMyCompanyId}
          onChange={setOwnerMyCompanyId}
          placeholder={myCompanies.length === 0 ? "Firma yok" : "Firma seçin (opsiyonel)"}
          searchable={myCompanies.length > 6}
          options={[
            { value: "", label: "— (Firma yok)" },
            ...myCompanies.map((c) => ({ value: c.id, label: c.legal_name })),
          ]}
        />
        <p className="text-[10px] text-surface-500 mt-1">
          POS işlemleri ve transfer akışında otomatik filtre için.
        </p>
      </div>

      {/* Açılış bakiyesi */}
      <div>
        <label className="text-[11px] text-surface-400 uppercase mb-1 block">
          Açılış Bakiyesi (opsiyonel)
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={openingBalance}
          onChange={(e) => setOpeningBalance(formatMoneyInput(e.target.value))}
          placeholder="0"
          className="field field-sm py-2"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm disabled:opacity-50"
        >
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          Oluştur
        </button>
      </div>
    </form>
  );
}

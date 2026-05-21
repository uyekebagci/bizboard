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
import { cn } from "@/lib/utils";
import { useBusinesses } from "@/hooks/useBusinesses";
import type { BankAccountType } from "@/types";

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
  const [holderPersonId, setHolderPersonId] = useState("");
  const [persons, setPersons] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (type !== "CASH_HOLDER" || !businessId) {
      setPersons([]);
      return;
    }
    api.get<Array<{ id: string; name: string; business_id: string; kind?: string }>>(
      "/counterparts?kind=PERSON",
    )
      .then((all) => {
        const scoped = (all || []).filter((c) => c.business_id === businessId);
        setPersons(scoped);
        if (scoped.length > 0) setHolderPersonId(scoped[0].id);
      })
      .catch(() => setPersons([]));
  }, [type, businessId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!businessId) { setError("İşletme seçin"); return; }
    if (!name.trim()) { setError("Hesap adı zorunlu"); return; }
    if (type === "CASH_HOLDER" && !holderPersonId) {
      setError("Kişide tutulan için holder seçin (PERSON tipinde counterpart)");
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
      if (openingBalance) body.opening_balance = Number(openingBalance);
      if (type === "CASH_HOLDER") body.holder_person_id = holderPersonId;
      await api.post("/bank-accounts", body);
      onCreated();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Hesap olusturulamadi";
      setError(msg);
      logger.error("api", "bank-account create failed", { type, businessId }, err);
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
          <select
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-surface-900 border border-surface-600 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-brand-500/50"
            required
          >
            {bizOptions.length === 0 && <option value="">İşletme yok</option>}
            {bizOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
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
          onChange={(e) => setName(e.target.value)}
          placeholder={type === "SUB_CASH" ? "Ör. Kasa #2" : "Ör. Garanti Vakif"}
          className="w-full px-3 py-2 text-sm bg-surface-900 border border-surface-600 rounded-lg text-white placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
          required
          autoFocus
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
              className="w-full px-3 py-2 text-sm bg-surface-900 border border-surface-600 rounded-lg text-white placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
            />
          </div>
          <div>
            <label className="text-[11px] text-surface-400 uppercase mb-1 block">IBAN</label>
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="TR..."
              className="w-full px-3 py-2 text-sm bg-surface-900 border border-surface-600 rounded-lg text-white placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50 font-mono"
            />
          </div>
        </>
      )}

      {/* CASH_HOLDER → holder person */}
      {type === "CASH_HOLDER" && (
        <div>
          <label className="text-[11px] text-surface-400 uppercase mb-1 block">
            Kişi (counterpart, PERSON)
          </label>
          <select
            value={holderPersonId}
            onChange={(e) => setHolderPersonId(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-surface-900 border border-surface-600 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-brand-500/50"
            required
          >
            {persons.length === 0 && <option value="">PERSON kayıt yok — önce ekle</option>}
            {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {/* Açılış bakiyesi */}
      <div>
        <label className="text-[11px] text-surface-400 uppercase mb-1 block">
          Açılış Bakiyesi (opsiyonel)
        </label>
        <input
          type="number"
          step="0.01"
          value={openingBalance}
          onChange={(e) => setOpeningBalance(e.target.value)}
          placeholder="0.00"
          className="w-full px-3 py-2 text-sm bg-surface-900 border border-surface-600 rounded-lg text-white placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
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

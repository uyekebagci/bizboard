"use client";

/**
 * v1.7.x (UI Fix TODO d3c7a192): Tx formundan inline counterpart oluşturma modal'ı.
 *
 * <p>AddTransactionForm'daki "Karşı Taraf" DarkSelect'inde
 * "+ Yeni Karşı Taraf Ekle" seçilince açılır. Sayfa navigasyonu yapmaz;
 * oluşturulan counterpart parent'a geri döner, parent listeye ekleyip
 * otomatik seçer.</p>
 *
 * <p>business_id zorunlu — form'dan seçili businessId geçirilir.</p>
 */

import { useState } from "react";
import { X, Loader2, Building2, User as UserIcon } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { Counterpart } from "@/types";

type Kind = "FIRM" | "PERSON";

interface Props {
  /** Counterpart bu business'a bağlanır. Boşsa form gösterir uyarı. */
  businessId: string;
  onClose: () => void;
  onCreated: (c: Counterpart) => void;
}

export function QuickCounterpartModal({ businessId, onClose, onCreated }: Props) {
  const [kind, setKind] = useState<Kind>("FIRM");
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFirm = kind === "FIRM";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) { setError("Ad zorunlu"); return; }
    if (!businessId) { setError("Önce işletme seçin"); return; }
    setSubmitting(true);
    try {
      const created = await api.post<Counterpart>("/counterparts", {
        business_id: businessId,
        name: trimmed,
        kind,
        tax_id: taxId.trim() || null,
        contact_phone: phone.trim() || null,
        contact_email: email.trim() || null,
        role: "OTHER",
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Oluşturma başarısız");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-800 rounded-2xl border border-surface-600 w-full max-w-sm shadow-xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h3 className="text-base font-semibold text-white">Yeni Karşı Taraf</h3>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {error}
            </div>
          )}

          {/* Kind toggle */}
          <div className="flex rounded-xl border border-surface-600 overflow-hidden">
            <button type="button" onClick={() => setKind("FIRM")}
              className={cn("flex-1 py-2 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors",
                kind === "FIRM" ? "bg-brand-600 text-white"
                               : "bg-surface-800 text-surface-300 hover:bg-surface-700")}>
              <Building2 size={12} /> Firma
            </button>
            <button type="button" onClick={() => setKind("PERSON")}
              className={cn("flex-1 py-2 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors border-l border-surface-600",
                kind === "PERSON" ? "bg-brand-600 text-white"
                                 : "bg-surface-800 text-surface-300 hover:bg-surface-700")}>
              <UserIcon size={12} /> Kişi
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              {isFirm ? "Firma Adı" : "Ad Soyad"} *
            </label>
            <input
              autoFocus required value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isFirm ? "Firma adı" : "Ad Soyad"}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              {isFirm ? "VKN" : "TC Kimlik No"}
            </label>
            <input
              value={taxId}
              onChange={(e) => setTaxId(e.target.value.replace(/[^0-9]/g, ""))}
              maxLength={isFirm ? 10 : 11}
              placeholder={isFirm ? "10 hane" : "11 hane"}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-surface-200 mb-1.5">Telefon</label>
              <input type="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05XX..."
                className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-200 mb-1.5">E-posta</label>
              <input type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@..."
                className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {!businessId && (
            <p className="text-[11px] text-amber-300 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30">
              Karşı taraf oluşturmak için önce işletme seçin.
            </p>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-surface-700">
          <button type="button" onClick={onClose} disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium border border-surface-600 disabled:opacity-50">
            Vazgeç
          </button>
          <button type="submit" disabled={submitting || !name.trim() || !businessId}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Oluştur
          </button>
        </div>
      </form>
    </div>
  );
}

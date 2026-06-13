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
import { toast } from "@/lib/toast";
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
      toast.success("Cari oluşturuldu");
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Oluşturma başarısız");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="v2-card w-full max-w-sm shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgb(var(--v2-border))]">
          <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))]">Yeni Karşı Taraf</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs">
              {error}
            </div>
          )}

          {/* Kind toggle */}
          <div className="flex rounded-xl border border-[rgb(var(--v2-border))] overflow-hidden">
            <button
              type="button"
              onClick={() => setKind("FIRM")}
              className={cn(
                "flex-1 py-2 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors",
                kind === "FIRM"
                  ? "bg-[rgb(var(--v2-ink))] text-[rgb(var(--v2-card))]"
                  : "bg-[rgb(var(--v2-card))] text-[rgb(var(--v2-muted))] hover:bg-[rgb(var(--v2-sunken))]",
              )}
            >
              <Building2 size={12} /> Firma
            </button>
            <button
              type="button"
              onClick={() => setKind("PERSON")}
              className={cn(
                "flex-1 py-2 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors border-l border-[rgb(var(--v2-border))]",
                kind === "PERSON"
                  ? "bg-[rgb(var(--v2-ink))] text-[rgb(var(--v2-card))]"
                  : "bg-[rgb(var(--v2-card))] text-[rgb(var(--v2-muted))] hover:bg-[rgb(var(--v2-sunken))]",
              )}
            >
              <UserIcon size={12} /> Kişi
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">
              {isFirm ? "Firma Adı" : "Ad Soyad"} *
            </label>
            <input
              autoFocus required value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isFirm ? "Firma adı" : "Ad Soyad"}
              className="field field-sm py-2.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">
              {isFirm ? "VKN" : "TC Kimlik No"}
            </label>
            <input
              value={taxId}
              onChange={(e) => setTaxId(e.target.value.replace(/[^0-9]/g, ""))}
              maxLength={isFirm ? 10 : 11}
              placeholder={isFirm ? "10 hane" : "11 hane"}
              className="field field-sm py-2.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Telefon</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05XX..."
                className="field field-sm py-2.5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">E-posta</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@..."
                className="field field-sm py-2.5"
              />
            </div>
          </div>

          {!businessId && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30">
              Karşı taraf oluşturmak için önce işletme seçin.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 px-5 py-4 border-t border-[rgb(var(--v2-border))]">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-secondary flex-1 py-2.5 text-sm"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim() || !businessId}
            className="flex-1 py-2.5 rounded-xl bg-[rgb(var(--v2-ink))] hover:opacity-90 text-[rgb(var(--v2-card))] text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Oluştur
          </button>
        </div>
      </form>
    </div>
  );
}

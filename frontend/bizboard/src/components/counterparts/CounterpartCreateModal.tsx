"use client";

/**
 * v1.7.x (UI Fix WP 8b961444 TODO 0b78f4eb): Inline counterpart create
 * alt-modal'ı. CounterpartDebtModal'ın "+ Yeni Firma/Kişi Ekle"
 * opsiyonundan tetiklenir; submit sonrası parent'a yeni counterpart'ı
 * verir, parent dropdown'a ekleyip seçili duruma getirir.
 *
 * <p>Cross-tenant: business_id zorunlu (counterpart entity multi-tenant).
 * Parent modal'dan geçirilir; counterpart picker bu business'a bağlı.</p>
 */

import { useState } from "react";
import { X, Loader2, Building2, User as UserIcon } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { Counterpart } from "@/types";

type Kind = "FIRM" | "PERSON";

interface Props {
  kind: Kind;
  businessId: string;
  initialName?: string;
  onClose: () => void;
  onCreated: (c: Counterpart) => void;
}

export function CounterpartCreateModal({
  kind, businessId, initialName = "", onClose, onCreated,
}: Props) {
  const [name, setName] = useState(initialName);
  const [taxId, setTaxId] = useState("");      // VKN (FIRM 10) / TC (PERSON 11)
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");  // FIRM only
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFirm = kind === "FIRM";
  const taxLabel = isFirm ? "Vergi No (VKN)" : "TC Kimlik No";
  const nameLabel = isFirm ? "Firma Adı" : "Ad Soyad";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError(nameLabel + " zorunlu"); return; }
    setSubmitting(true);
    try {
      const created = await api.post<Counterpart>("/counterparts", {
        business_id: businessId,
        name: name.trim(),
        kind,
        tax_id: taxId.trim() || null,
        contact_phone: phone.trim() || null,
        contact_email: email.trim() || null,
        address: isFirm ? (address.trim() || null) : null,
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-800 rounded-2xl border border-surface-600 w-full max-w-md shadow-xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            {isFirm ? <Building2 size={16} className="text-brand-400" />
                    : <UserIcon size={16} className="text-brand-400" />}
            Yeni {isFirm ? "Firma" : "Kişi"} Ekle
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              {nameLabel} *
            </label>
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder={isFirm ? "Firma adı" : "Kişinin adı soyadı"}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              {taxLabel}
            </label>
            <input
              value={taxId}
              onChange={(e) => setTaxId(e.target.value.replace(/[^0-9]/g, ""))}
              maxLength={isFirm ? 10 : 11}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder={isFirm ? "10 hane" : "11 hane"}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              Telefon
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="05XX XXX XX XX"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              E-posta
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="ornek@firma.com"
            />
          </div>

          {isFirm && (
            <div>
              <label className="block text-xs font-medium text-surface-200 mb-1.5">
                Adres
              </label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                placeholder="Şehir / İlçe / Mahalle..."
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-surface-700">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium border border-surface-600 disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50",
              "bg-brand-600 hover:bg-brand-700",
            )}
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Oluştur
          </button>
        </div>
      </form>
    </div>
  );
}

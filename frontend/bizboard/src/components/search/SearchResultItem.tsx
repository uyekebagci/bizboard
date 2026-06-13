"use client";

/**
 * v2.2.0 — tek bir arama sonucu kartı (spec §10.2, §10.7).
 *
 * - `<mark>` snippet güvenle render (whitelist).
 * - Hassas alanlar (VKN/IBAN/maaş) maskeli + 🔒 ikon + tooltip.
 * - Tıklayınca deep-link'e gider.
 *
 * Çift tema: glass-card / surface-* token'ları.
 */

import Link from "next/link";
import { Lock } from "lucide-react";
import { ENTITY_LABELS, type SearchHit } from "@/lib/api/search";
import { renderSnippet } from "@/lib/searchHighlight";

function formatAmount(value: unknown): string | null {
  if (value == null || typeof value !== "number") return null;
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

interface MaskedField {
  label: string;
  value: string;
  masked: boolean;
}

/** metadata'dan gösterilecek maskeli/normal alanları çıkarır. */
function extractFields(hit: SearchHit): MaskedField[] {
  const m = hit.metadata;
  const fields: MaskedField[] = [];
  const amount = formatAmount(m.amount);
  if (amount) fields.push({ label: "Tutar", value: amount, masked: false });
  if (typeof m.category === "string") fields.push({ label: "Kategori", value: m.category, masked: false });
  if (typeof m.status === "string") fields.push({ label: "Durum", value: m.status, masked: false });
  if (typeof m.position === "string") fields.push({ label: "Pozisyon", value: m.position, masked: false });
  if (typeof m.bankName === "string") fields.push({ label: "Banka", value: m.bankName, masked: false });
  if (typeof m.phone === "string") fields.push({ label: "Telefon", value: m.phone, masked: false });
  if (typeof m.sku === "string") fields.push({ label: "SKU", value: m.sku, masked: false });
  if (typeof m.brand === "string") fields.push({ label: "Marka", value: m.brand, masked: false });
  if (typeof m.model === "string") fields.push({ label: "Model", value: m.model, masked: false });
  if (m.year != null) fields.push({ label: "Yıl", value: String(m.year), masked: false });
  if (typeof m.owner === "string") fields.push({ label: "Sahip", value: m.owner, masked: false });
  if (typeof m.chequeNo === "string") fields.push({ label: "Çek No", value: m.chequeNo, masked: false });
  if (typeof m.noteSerial === "string") fields.push({ label: "Seri", value: m.noteSerial, masked: false });
  if (m.taxId != null) fields.push({ label: "VKN", value: String(m.taxId), masked: m.taxIdMasked === true });
  if (m.iban != null) fields.push({ label: "IBAN", value: String(m.iban), masked: m.ibanMasked === true });
  if (m.mersis != null) fields.push({ label: "MERSIS", value: String(m.mersis), masked: m.mersisMasked === true });
  if (m.salary != null) fields.push({ label: "Maaş", value: String(m.salary), masked: m.salaryMasked === true });
  return fields;
}

export function SearchResultItem({ hit }: { hit: SearchHit }) {
  const fields = extractFields(hit);
  return (
    <Link
      href={hit.url}
      className="v2-card !rounded-xl block p-4 transition-colors hover:bg-[rgb(var(--v2-sunken))]"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-400">
          {ENTITY_LABELS[hit.type] ?? hit.type}
        </span>
        {hit.businessName && (
          <>
            <span className="text-[rgb(var(--v2-border))]">·</span>
            <span className="text-[11px] text-[rgb(var(--v2-muted))] truncate">{hit.businessName}</span>
          </>
        )}
      </div>

      <p className="text-sm text-[rgb(var(--v2-ink))] font-medium">
        {renderSnippet(hit.snippet)}
      </p>

      {fields.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {fields.map((f) => (
            <span key={f.label} className="inline-flex items-center gap-1 text-[12px] text-[rgb(var(--v2-muted))]">
              <span className="text-[rgb(var(--v2-muted))]/70">{f.label}:</span>
              <span className={f.masked ? "text-[rgb(var(--v2-muted))]" : "text-[rgb(var(--v2-ink))]"}>{f.value}</span>
              {f.masked && (
                <span
                  title="Tam görünüm için yöneticine başvur"
                  className="inline-flex"
                  aria-label="Maskeli alan"
                >
                  <Lock size={11} className="text-amber-400" />
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

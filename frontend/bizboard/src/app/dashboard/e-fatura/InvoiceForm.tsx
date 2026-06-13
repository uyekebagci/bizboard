"use client";

/**
 * e-Fatura oluşturma formu (modal içerik). Satıcı firma seçimi, alıcı (karşı
 * firma ya da serbest), satır kalemleri editörü + canlı KDV/toplam önizleme.
 *
 * <p>Tüm hesaplar görseldir; nihai/yetkili hesap backend'de BigDecimal ile
 * yapılır. Submit {@link CreateInvoiceInput} ile parent'a verilir.</p>
 */

import { useMemo, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Business,
  Counterpart,
  CreateInvoiceInput,
  CreateInvoiceLineInput,
  MyCompany,
} from "@/types";
import { formatMoney } from "./invoiceFormat";

interface LineRow extends CreateInvoiceLineInput {
  _key: string;
}

interface Props {
  business: Business;
  companies: MyCompany[];
  counterparts: Counterpart[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateInvoiceInput) => void;
}

function newLine(): LineRow {
  return {
    _key: Math.random().toString(36).slice(2),
    item_name: "",
    quantity: 1,
    unit_price: 0,
    vat_rate: 20,
    discount_amount: 0,
    unit_code: "C62",
  };
}

const inputCls =
  "w-full rounded-lg border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] px-3 py-2 text-sm text-[rgb(var(--v2-ink))] placeholder:text-[rgb(var(--v2-muted))] focus:border-brand focus:outline-none";

export function InvoiceForm({
  business,
  companies,
  counterparts,
  submitting,
  onCancel,
  onSubmit,
}: Props) {
  const defaultCompany =
    companies.find((c) => c.is_default) ?? companies[0];

  const [supplierCompanyId, setSupplierCompanyId] = useState<string>(
    defaultCompany?.id ?? ""
  );
  const [customerMode, setCustomerMode] = useState<"counterpart" | "manual">(
    counterparts.length > 0 ? "counterpart" : "manual"
  );
  const [customerCounterpartId, setCustomerCounterpartId] = useState<string>("");
  const [customerTitle, setCustomerTitle] = useState("");
  const [customerTaxId, setCustomerTaxId] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [scenario, setScenario] = useState<"TEMEL" | "TICARI">("TEMEL");
  const [invoiceType, setInvoiceType] = useState("SATIS");
  const [issueDate, setIssueDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>([newLine()]);

  function updateLine(key: string, patch: Partial<LineRow>) {
    setLines((rows) =>
      rows.map((r) => (r._key === key ? { ...r, ...patch } : r))
    );
  }
  function removeLine(key: string) {
    setLines((rows) => (rows.length > 1 ? rows.filter((r) => r._key !== key) : rows));
  }

  const totals = useMemo(() => {
    let ext = 0;
    let vat = 0;
    for (const l of lines) {
      const gross = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
      const lineExt = Math.max(0, gross - (Number(l.discount_amount) || 0));
      ext += lineExt;
      vat += (lineExt * (Number(l.vat_rate) || 0)) / 100;
    }
    return { ext, vat, total: ext + vat };
  }, [lines]);

  function handleSubmit() {
    const cleanLines: CreateInvoiceLineInput[] = lines
      .filter((l) => l.item_name.trim().length > 0)
      .map((l) => ({
        item_name: l.item_name.trim(),
        unit_code: l.unit_code || "C62",
        quantity: Number(l.quantity) || 0,
        unit_price: Number(l.unit_price) || 0,
        vat_rate: Number(l.vat_rate) || 0,
        discount_amount: Number(l.discount_amount) || 0,
      }));

    const input: CreateInvoiceInput = {
      business_id: business.id,
      supplier_company_id: supplierCompanyId || null,
      scenario,
      invoice_type: invoiceType as CreateInvoiceInput["invoice_type"],
      issue_date: issueDate || null,
      notes: notes.trim() || null,
      lines: cleanLines,
    };
    if (customerMode === "counterpart" && customerCounterpartId) {
      input.customer_counterpart_id = customerCounterpartId;
    } else {
      input.customer_title = customerTitle.trim();
      input.customer_tax_id = customerTaxId.trim() || null;
      input.customer_address = customerAddress.trim() || null;
    }
    onSubmit(input);
  }

  const canSubmit =
    !submitting &&
    supplierCompanyId &&
    lines.some((l) => l.item_name.trim().length > 0) &&
    (customerMode === "counterpart"
      ? !!customerCounterpartId
      : customerTitle.trim().length > 0);

  return (
    <div className="space-y-5">
      {/* Üst: satıcı + meta */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-[rgb(var(--v2-muted))]">Satıcı Firma</span>
          <select
            className={inputCls}
            value={supplierCompanyId}
            onChange={(e) => setSupplierCompanyId(e.target.value)}
          >
            <option value="">Seçin…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legal_name} {c.tax_id ? `(${c.tax_id})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[rgb(var(--v2-muted))]">Fatura Tarihi</span>
          <input
            type="date"
            className={inputCls}
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[rgb(var(--v2-muted))]">Senaryo</span>
          <select
            className={inputCls}
            value={scenario}
            onChange={(e) => setScenario(e.target.value as "TEMEL" | "TICARI")}
          >
            <option value="TEMEL">Temel Fatura</option>
            <option value="TICARI">Ticari Fatura</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[rgb(var(--v2-muted))]">Fatura Tipi</span>
          <select
            className={inputCls}
            value={invoiceType}
            onChange={(e) => setInvoiceType(e.target.value)}
          >
            <option value="SATIS">Satış</option>
            <option value="IADE">İade</option>
            <option value="TEVKIFAT">Tevkifat</option>
            <option value="ISTISNA">İstisna</option>
            <option value="OZELMATRAH">Özel Matrah</option>
          </select>
        </label>
      </div>

      {/* Alıcı */}
      <div className="rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] p-3">
        <div className="mb-2 flex items-center gap-3">
          <span className="text-sm font-medium text-[rgb(var(--v2-ink))]">Alıcı</span>
          <div className="ml-auto flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setCustomerMode("counterpart")}
              className={cn(
                "rounded-md px-2 py-1",
                customerMode === "counterpart"
                  ? "bg-brand/20 text-brand"
                  : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
              )}
            >
              Karşı Firma
            </button>
            <button
              type="button"
              onClick={() => setCustomerMode("manual")}
              className={cn(
                "rounded-md px-2 py-1",
                customerMode === "manual"
                  ? "bg-brand/20 text-brand"
                  : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
              )}
            >
              Serbest Giriş
            </button>
          </div>
        </div>
        {customerMode === "counterpart" ? (
          <select
            className={inputCls}
            value={customerCounterpartId}
            onChange={(e) => setCustomerCounterpartId(e.target.value)}
          >
            <option value="">Karşı firma seçin…</option>
            {counterparts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.tax_id ? `(${c.tax_id})` : ""}
              </option>
            ))}
          </select>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              className={inputCls}
              placeholder="Unvan / Ad Soyad"
              value={customerTitle}
              onChange={(e) => setCustomerTitle(e.target.value)}
            />
            <input
              className={inputCls}
              placeholder="VKN / TCKN"
              value={customerTaxId}
              onChange={(e) => setCustomerTaxId(e.target.value)}
            />
            <input
              className={cn(inputCls, "sm:col-span-2")}
              placeholder="Adres"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Satır kalemleri */}
      <div>
        <div className="mb-2 flex items-center">
          <span className="text-sm font-medium text-[rgb(var(--v2-ink))]">Satır Kalemleri</span>
          <button
            type="button"
            onClick={() => setLines((r) => [...r, newLine()])}
            className="ml-auto flex items-center gap-1 rounded-md bg-brand/15 px-2 py-1 text-xs text-brand hover:bg-brand/25"
          >
            <Plus className="h-3.5 w-3.5" /> Satır Ekle
          </button>
        </div>
        <div className="space-y-2">
          {lines.map((l) => {
            const gross = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
            const lineExt = Math.max(0, gross - (Number(l.discount_amount) || 0));
            return (
              <div
                key={l._key}
                className="grid grid-cols-12 gap-2 rounded-lg border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] p-2"
              >
                <input
                  className={cn(inputCls, "col-span-12 sm:col-span-4")}
                  placeholder="Mal / Hizmet"
                  value={l.item_name}
                  onChange={(e) => updateLine(l._key, { item_name: e.target.value })}
                />
                <input
                  type="number"
                  step="any"
                  className={cn(inputCls, "col-span-3 sm:col-span-1")}
                  placeholder="Adet"
                  value={l.quantity}
                  onChange={(e) => updateLine(l._key, { quantity: Number(e.target.value) })}
                />
                <input
                  type="number"
                  step="any"
                  className={cn(inputCls, "col-span-4 sm:col-span-2")}
                  placeholder="Birim Fiyat"
                  value={l.unit_price}
                  onChange={(e) => updateLine(l._key, { unit_price: Number(e.target.value) })}
                />
                <input
                  type="number"
                  step="any"
                  className={cn(inputCls, "col-span-3 sm:col-span-1")}
                  placeholder="İsk."
                  value={l.discount_amount}
                  onChange={(e) =>
                    updateLine(l._key, { discount_amount: Number(e.target.value) })
                  }
                />
                <select
                  className={cn(inputCls, "col-span-5 sm:col-span-2")}
                  value={l.vat_rate}
                  onChange={(e) => updateLine(l._key, { vat_rate: Number(e.target.value) })}
                >
                  {[0, 1, 8, 10, 18, 20].map((r) => (
                    <option key={r} value={r}>
                      KDV %{r}
                    </option>
                  ))}
                </select>
                <div className="col-span-6 flex items-center justify-end text-sm text-[rgb(var(--v2-ink))] sm:col-span-1">
                  {formatMoney(lineExt)}
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(l._key)}
                  className="col-span-1 flex items-center justify-center text-[rgb(var(--v2-muted))] hover:text-status-danger"
                  aria-label="Satırı sil"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Notlar + toplamlar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <textarea
          className={cn(inputCls, "min-h-[80px]")}
          placeholder="Notlar (opsiyonel)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="space-y-1 rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] p-3 text-sm">
          <div className="flex justify-between text-[rgb(var(--v2-muted))]">
            <span>Mal/Hizmet (KDV hariç)</span>
            <span>{formatMoney(totals.ext)}</span>
          </div>
          <div className="flex justify-between text-[rgb(var(--v2-muted))]">
            <span>Toplam KDV</span>
            <span>{formatMoney(totals.vat)}</span>
          </div>
          <div className="flex justify-between border-t border-[rgb(var(--v2-border))] pt-1 font-semibold text-[rgb(var(--v2-ink))]">
            <span>Ödenecek</span>
            <span>{formatMoney(totals.total)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[rgb(var(--v2-border))] px-4 py-2 text-sm text-[rgb(var(--v2-muted))] hover:bg-[rgb(var(--v2-sunken))]"
        >
          Vazgeç
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Fatura Oluştur
        </button>
      </div>
    </div>
  );
}

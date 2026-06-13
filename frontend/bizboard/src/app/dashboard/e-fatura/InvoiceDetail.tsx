"use client";

/**
 * e-Fatura detay görünümü (modal içerik). Satıcı/alıcı, satır kalemleri,
 * toplamlar + eylem butonları (XML üret/önizle/indir, gönder, durum, iptal).
 *
 * <p>Entegratör hatası/uyarısı (integrator_error) varsa kullanıcıya gösterilir.</p>
 */

import { Loader2, Download, Eye, Send, RefreshCw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Invoice } from "@/types";
import {
  formatMoney, STATUS_LABEL, STATUS_STYLE, SCENARIO_LABEL, TYPE_LABEL,
} from "./invoiceFormat";

interface Props {
  inv: Invoice;
  busy: boolean;
  onGenerate: () => void;
  onSend: () => void;
  onQuery: () => void;
  onCancel: () => void;
  onPreview: () => void;
  onDownload: () => void;
}

export function InvoiceDetail({
  inv, busy, onGenerate, onSend, onQuery, onCancel, onPreview, onDownload,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-md border px-2 py-0.5 text-xs", STATUS_STYLE[inv.status])}>
          {STATUS_LABEL[inv.status]}
        </span>
        <span className="text-xs text-[rgb(var(--v2-muted))]">
          {SCENARIO_LABEL[inv.scenario]} · {TYPE_LABEL[inv.invoice_type]} · {inv.currency}
        </span>
        <span className="ml-auto font-mono text-xs text-[rgb(var(--v2-muted))]">ETTN: {inv.ettn}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Party title="Satıcı" name={inv.supplier_title} tax={inv.supplier_tax_id} addr={inv.supplier_address} />
        <Party title="Alıcı" name={inv.customer_title} tax={inv.customer_tax_id} addr={inv.customer_address} />
      </div>

      {inv.lines && inv.lines.length > 0 && (
        <div className="v2-table-wrap">
          <table className="v2-table w-full text-sm">
            <thead>
              <tr>
                <th>Kalem</th>
                <th className="v2-td-num">Adet</th>
                <th className="v2-td-num">B.Fiyat</th>
                <th className="v2-td-num">KDV</th>
                <th className="v2-td-num">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.line_number}>
                  <td className="text-[rgb(var(--v2-ink))]">{l.item_name}</td>
                  <td className="v2-td-num text-[rgb(var(--v2-muted))]">{l.quantity}</td>
                  <td className="v2-td-num text-[rgb(var(--v2-muted))]">{formatMoney(l.unit_price, inv.currency)}</td>
                  <td className="v2-td-num text-[rgb(var(--v2-muted))]">%{l.vat_rate}</td>
                  <td className="v2-td-num text-[rgb(var(--v2-ink))]">{formatMoney(l.line_extension_amount, inv.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="ml-auto w-full max-w-xs space-y-1 rounded-lg border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] p-3 text-sm">
        <Row label="Matrah" value={formatMoney(inv.tax_exclusive_amount, inv.currency)} />
        <Row label="KDV" value={formatMoney(inv.total_tax_amount, inv.currency)} />
        <Row label="Ödenecek" value={formatMoney(inv.payable_amount, inv.currency)} bold />
      </div>

      {inv.integrator_error && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
          {inv.integrator_error}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Action onClick={onPreview} busy={busy} icon={<Eye className="h-4 w-4" />}>
          XML Önizle
        </Action>
        <Action onClick={onGenerate} busy={busy} icon={<RefreshCw className="h-4 w-4" />}>
          XML Üret
        </Action>
        <Action onClick={onDownload} icon={<Download className="h-4 w-4" />} disabled={!inv.has_xml}>
          İndir
        </Action>
        {inv.status !== "CANCELLED" && (
          <>
            <Action onClick={onSend} busy={busy} icon={<Send className="h-4 w-4" />} primary>
              Gönder
            </Action>
            <Action onClick={onQuery} busy={busy} icon={<RefreshCw className="h-4 w-4" />}>
              Durum Sorgula
            </Action>
            <Action onClick={onCancel} busy={busy} icon={<XCircle className="h-4 w-4" />} danger>
              İptal
            </Action>
          </>
        )}
      </div>
    </div>
  );
}

function Party({ title, name, tax, addr }: { title: string; name: string | null; tax: string | null; addr: string | null }) {
  return (
    <div className="rounded-lg border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] p-3">
      <div className="mb-1 text-xs uppercase text-[rgb(var(--v2-muted))]">{title}</div>
      <div className="text-sm font-medium text-[rgb(var(--v2-ink))]">{name}</div>
      {tax && <div className="text-xs text-[rgb(var(--v2-muted))]">VKN/TCKN: {tax}</div>}
      {addr && <div className="text-xs text-[rgb(var(--v2-muted))]">{addr}</div>}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn(
      "flex justify-between",
      bold
        ? "border-t border-[rgb(var(--v2-border))] pt-1 font-semibold text-[rgb(var(--v2-ink))]"
        : "text-[rgb(var(--v2-muted))]"
    )}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Action({
  onClick, children, icon, busy, disabled, primary, danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ReactNode;
  busy?: boolean;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50",
        primary
          ? "bg-brand text-white"
          : danger
          ? "border border-status-danger/40 text-status-danger hover:bg-status-danger/10"
          : "border border-[rgb(var(--v2-border))] text-[rgb(var(--v2-muted))] hover:bg-[rgb(var(--v2-sunken))]"
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

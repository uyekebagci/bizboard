"use client";

/**
 * e-Fatura modülü (Çatı v1.1) — fatura oluştur / listele / detay + UBL-TR XML
 * önizle/indir + (entegratör bağlıysa) gönder / durum / iptal.
 *
 * <p>Entegratör-bağımsız: XML üretimi + indirme her zaman çalışır. "Gönder"
 * entegratör yapılandırılmamışsa backend graceful "yapılandırılmadı" döner;
 * sayfa bunu kullanıcıya net mesajla gösterir (hata değil, bilgi).</p>
 *
 * <p>Çift tema: surface-* token'ları ile otomatik dark/light.</p>
 */

import { useEffect, useMemo, useState } from "react";
import {
  FileText, Plus, Loader2, Download, Eye, Send, X, Receipt,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { invoicesApi } from "@/lib/api/invoices";
import { useInvoices } from "@/hooks/useInvoices";
import { useBusinesses } from "@/hooks/useBusinesses";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { Counterpart, Invoice, MyCompany } from "@/types";
import { InvoiceForm } from "./InvoiceForm";
import { InvoiceDetail } from "./InvoiceDetail";
import { formatMoney, STATUS_LABEL, STATUS_STYLE } from "./invoiceFormat";

export default function EInvoicePage() {
  const { businesses } = useBusinesses();
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const [businessId, setBusinessId] = useState<string | null>(null);
  useEffect(() => {
    if (!businessId && businesses?.length) setBusinessId(businesses[0].id);
  }, [businesses, businessId]);

  const business = useMemo(
    () => businesses?.find((b) => b.id === businessId) ?? null,
    [businesses, businessId]
  );

  const { list, loading, error, reload } = useInvoices(businessId);

  const [companies, setCompanies] = useState<MyCompany[]>([]);
  const [counterparts, setCounterparts] = useState<Counterpart[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [xmlPreview, setXmlPreview] = useState<{ number: string; xml: string } | null>(null);

  // Form için satıcı firma + karşı firma listeleri.
  useEffect(() => {
    api.get<MyCompany[]>("/firms").then(setCompanies).catch(() => setCompanies([]));
  }, []);
  useEffect(() => {
    if (!businessId) return;
    api
      .get<Counterpart[]>(`/counterparts?businessId=${businessId}`)
      .then(setCounterparts)
      .catch(() => setCounterparts([]));
  }, [businessId]);

  async function handleCreate(input: Parameters<typeof invoicesApi.create>[0]) {
    setSubmitting(true);
    try {
      await invoicesApi.create(input);
      toast.success("Fatura taslağı oluşturuldu");
      setShowForm(false);
      reload();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function runAction(
    id: string,
    fn: () => Promise<Invoice>,
    okMsg: string
  ) {
    setBusyId(id);
    try {
      const updated = await fn();
      if (detail?.id === id) setDetail(updated);
      // Entegratör yoksa send/cancel/status integrator_error doldurur — bilgi ver.
      if (updated.integrator_status === "NOT_CONFIGURED" && updated.integrator_error) {
        toast.info(updated.integrator_error);
      } else {
        toast.success(okMsg);
      }
      reload();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function previewXml(inv: Invoice) {
    setBusyId(inv.id);
    try {
      // Henüz üretilmediyse önce üret.
      if (!inv.has_xml) {
        await invoicesApi.generateXml(inv.id);
        reload();
      }
      const xml = await invoicesApi.fetchXmlText(inv.id);
      setXmlPreview({ number: inv.invoice_number, xml });
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function openDetail(id: string) {
    try {
      const inv = await invoicesApi.get(id);
      setDetail(inv);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4">
      {/* Başlık + işletme seçimi */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-6 w-6 text-brand" />
          <h1 className="text-xl font-semibold text-surface-100">e-Fatura</h1>
        </div>
        <select
          className="rounded-lg border border-surface-600/50 bg-surface-800/60 px-3 py-1.5 text-sm text-surface-100"
          value={businessId ?? ""}
          onChange={(e) => setBusinessId(e.target.value || null)}
        >
          {businesses?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!business || companies.length === 0}
          onClick={() => setShowForm(true)}
          className="ml-auto flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Yeni Fatura
        </button>
      </div>

      {companies.length === 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
          Fatura kesebilmek için en az bir firma (Firmalarım) tanımlı olmalı ve
          VKN/TCKN bilgisi girilmiş olmalıdır.
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex items-center gap-2 p-8 text-surface-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Yükleniyor…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-surface-600/40 bg-surface-800/30 p-10 text-surface-400">
          <FileText className="h-8 w-8" />
          <p>Henüz fatura yok.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-600/40">
          <table className="w-full text-sm">
            <thead className="bg-surface-800/60 text-left text-xs uppercase text-surface-400">
              <tr>
                <th className="px-3 py-2">Fatura No</th>
                <th className="px-3 py-2">Tarih</th>
                <th className="px-3 py-2">Alıcı</th>
                <th className="px-3 py-2 text-right">Tutar</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {list.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-t border-surface-600/30 hover:bg-surface-800/30"
                >
                  <td className="px-3 py-2">
                    <button
                      className="font-mono text-brand hover:underline"
                      onClick={() => openDetail(inv.id)}
                    >
                      {inv.invoice_number}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-surface-300">{inv.issue_date}</td>
                  <td className="px-3 py-2 text-surface-200">{inv.customer_title}</td>
                  <td className="px-3 py-2 text-right text-surface-100">
                    {formatMoney(inv.payable_amount, inv.currency)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-xs",
                        STATUS_STYLE[inv.status]
                      )}
                    >
                      {STATUS_LABEL[inv.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <IconBtn
                        title="XML Önizle"
                        busy={busyId === inv.id}
                        onClick={() => previewXml(inv)}
                      >
                        <Eye className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn
                        title="XML İndir"
                        disabled={!inv.has_xml}
                        onClick={() =>
                          invoicesApi
                            .downloadXml(inv.id, inv.invoice_number)
                            .catch((e) => toast.error(getErrorMessage(e)))
                        }
                      >
                        <Download className="h-4 w-4" />
                      </IconBtn>
                      {inv.status !== "CANCELLED" && (
                        <IconBtn
                          title="Gönder"
                          busy={busyId === inv.id}
                          onClick={() =>
                            runAction(inv.id, () => invoicesApi.send(inv.id), "Gönderildi")
                          }
                        >
                          <Send className="h-4 w-4" />
                        </IconBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Oluşturma modal'ı */}
      {showForm && business && (
        <Modal title="Yeni e-Fatura" onClose={() => setShowForm(false)} wide>
          <InvoiceForm
            business={business}
            companies={companies}
            counterparts={counterparts}
            submitting={submitting}
            onCancel={() => setShowForm(false)}
            onSubmit={handleCreate}
          />
        </Modal>
      )}

      {/* Detay modal'ı */}
      {detail && (
        <Modal
          title={`Fatura ${detail.invoice_number}`}
          onClose={() => setDetail(null)}
          wide
        >
          <InvoiceDetail
            inv={detail}
            busy={busyId === detail.id}
            onGenerate={() =>
              runAction(detail.id, () => invoicesApi.generateXml(detail.id), "XML üretildi")
            }
            onSend={() =>
              runAction(detail.id, () => invoicesApi.send(detail.id), "Gönderildi")
            }
            onQuery={() =>
              runAction(detail.id, () => invoicesApi.queryStatus(detail.id), "Durum sorgulandı")
            }
            onCancel={() =>
              runAction(detail.id, () => invoicesApi.cancel(detail.id), "İptal edildi")
            }
            onPreview={() => previewXml(detail)}
            onDownload={() =>
              invoicesApi
                .downloadXml(detail.id, detail.invoice_number)
                .catch((e) => toast.error(getErrorMessage(e)))
            }
          />
        </Modal>
      )}

      {/* XML önizleme */}
      {xmlPreview && (
        <Modal
          title={`UBL-TR XML — ${xmlPreview.number}`}
          onClose={() => setXmlPreview(null)}
          wide
        >
          <pre className="max-h-[60vh] overflow-auto rounded-lg border border-surface-600/40 bg-surface-900/60 p-3 text-xs text-surface-200">
            {xmlPreview.xml}
          </pre>
        </Modal>
      )}
    </div>
  );
}

// ── alt bileşenler ──────────────────────────────────────────────────────────

function IconBtn({
  title, onClick, children, busy, disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled || busy}
      onClick={onClick}
      className="rounded-md p-1.5 text-surface-400 hover:bg-surface-700/40 hover:text-surface-100 disabled:opacity-40"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

function Modal({
  title, onClose, children, wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div
        className={cn(
          "my-8 w-full rounded-2xl border border-surface-600/50 bg-surface-900 p-5 shadow-xl",
          wide ? "max-w-4xl" : "max-w-lg"
        )}
      >
        <div className="mb-4 flex items-center">
          <h2 className="text-lg font-semibold text-surface-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-surface-400 hover:text-surface-100"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

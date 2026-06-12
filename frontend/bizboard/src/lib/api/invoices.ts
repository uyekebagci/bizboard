// e-Fatura modülü (Çatı v1.1) — REST istemcisi.
//
// XML üretimi/önizleme/indirme yerelde çalışır; gönderim entegratör üzerinden.
// Entegratör yapılandırılmamışsa "send" graceful döner (status değişmez,
// integrator_error doldurulur).

import { api, API_URL, getToken } from "@/lib/api/client";
import type { CreateInvoiceInput, Invoice } from "@/types";

export const invoicesApi = {
  list: (businessId?: string | null, status?: string | null) => {
    const params = new URLSearchParams();
    if (businessId) params.set("businessId", businessId);
    if (status) params.set("status", status);
    const qs = params.toString();
    return api.get<Invoice[]>(`/invoices${qs ? `?${qs}` : ""}`);
  },

  get: (id: string) => api.get<Invoice>(`/invoices/${id}`),

  create: (input: CreateInvoiceInput) => api.post<Invoice>("/invoices", input),

  update: (id: string, input: CreateInvoiceInput) =>
    api.put<Invoice>(`/invoices/${id}`, input),

  remove: (id: string) => api.delete<void>(`/invoices/${id}`),

  generateXml: (id: string) =>
    api.post<Invoice>(`/invoices/${id}/generate-xml`, {}),

  send: (id: string) => api.post<Invoice>(`/invoices/${id}/send`, {}),

  queryStatus: (id: string) =>
    api.post<Invoice>(`/invoices/${id}/query-status`, {}),

  cancel: (id: string, reason?: string) =>
    api.post<Invoice>(`/invoices/${id}/cancel`, { reason: reason ?? null }),

  /**
   * UBL-TR XML'i metin olarak getir (önizleme). XML endpoint'i application/xml
   * döndüğü için ortak api.get JSON-parse eder; burada doğrudan fetch + token
   * ile ham metin alıyoruz.
   */
  fetchXmlText: async (id: string): Promise<string> => {
    const token = getToken();
    const res = await fetch(`${API_URL}/invoices/${id}/xml`, {
      credentials: "include",
      headers: {
        Accept: "application/xml",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) {
      let msg = "XML alınamadı";
      try {
        const body = await res.json();
        if (body?.message) msg = body.message;
      } catch {
        /* xml hata gövdesi değil */
      }
      throw new Error(msg);
    }
    return res.text();
  },

  /** XML'i dosya olarak indir (tarayıcı download). */
  downloadXml: async (id: string, invoiceNumber: string): Promise<void> => {
    const xml = await invoicesApi.fetchXmlText(id);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `efatura-${invoiceNumber || id}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

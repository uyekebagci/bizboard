"use client";

/**
 * OCR Modülü (WP 1bdb8116): belge tarama + review/confirm hook.
 *
 * Yükle (tek/bulk) → OCR sonucu (alanlar + confidence) → düzelt/onayla →
 * mevcut transaction/instrument oluşturulur. Tüm istekler business-scoped.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import type { OcrBulkScanResponse, OcrConfirmRequest, OcrScan } from "@/types";

export function useOcr(businessId?: string | null) {
  const [scans, setScans] = useState<OcrScan[]>([]);
  const [loading, setLoading] = useState(false);

  const list = useCallback(async () => {
    if (!businessId) { setScans([]); return; }
    setLoading(true);
    try {
      const rows = await api.get<OcrScan[]>(`/ocr/scans?business_id=${businessId}`);
      setScans(rows ?? []);
    } catch (err) {
      logger.error("api", "useOcr list failed", { businessId }, err);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  const scanFile = useCallback(
    async (file: File, documentType: string): Promise<OcrScan> => {
      if (!businessId) throw new Error("business_id zorunlu");
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.upload<OcrScan>(
        `/ocr/scan?business_id=${businessId}&document_type=${encodeURIComponent(documentType)}`,
        fd
      );
      await list();
      return r;
    },
    [businessId, list]
  );

  const scanBulk = useCallback(
    async (files: File[], documentType: string): Promise<OcrBulkScanResponse> => {
      if (!businessId) throw new Error("business_id zorunlu");
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const r = await api.upload<OcrBulkScanResponse>(
        `/ocr/scan/bulk?business_id=${businessId}&document_type=${encodeURIComponent(documentType)}`,
        fd
      );
      await list();
      return r;
    },
    [businessId, list]
  );

  const getScan = useCallback(
    async (scanId: string): Promise<OcrScan> => {
      if (!businessId) throw new Error("business_id zorunlu");
      return api.get<OcrScan>(`/ocr/scans/${scanId}?business_id=${businessId}`);
    },
    [businessId]
  );

  const confirm = useCallback(
    async (scanId: string, payload: OcrConfirmRequest): Promise<OcrScan> => {
      if (!businessId) throw new Error("business_id zorunlu");
      const r = await api.post<OcrScan>(
        `/ocr/scans/${scanId}/confirm?business_id=${businessId}`,
        payload
      );
      await list();
      return r;
    },
    [businessId, list]
  );

  const discard = useCallback(
    async (scanId: string): Promise<OcrScan> => {
      if (!businessId) throw new Error("business_id zorunlu");
      const r = await api.post<OcrScan>(
        `/ocr/scans/${scanId}/discard?business_id=${businessId}`,
        {}
      );
      await list();
      return r;
    },
    [businessId, list]
  );

  useEffect(() => { void list(); }, [list]);

  return { scans, loading, list, scanFile, scanBulk, getScan, confirm, discard };
}

"use client";

/**
 * Ledger v2 (Faz B, §3.8 / §5): banka import (manuel satır iskeleti) hook.
 * Parti aç + satır ekle + kategorile (öğrenme öneri) + flag + postala.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import type {
  BankImportBatch, BankImportLine, BankStatementParseResult, BankBulkAddResult,
  BankStatementPreviewLine,
} from "@/types";

export function useBankImport(businessId?: string | null) {
  const [batches, setBatches] = useState<BankImportBatch[]>([]);
  const [loading, setLoading] = useState(false);

  const list = useCallback(async () => {
    if (!businessId) { setBatches([]); return; }
    setLoading(true);
    try {
      const rows = await api.get<BankImportBatch[]>(`/bank-imports?business_id=${businessId}`);
      setBatches(rows ?? []);
    } catch (err) {
      logger.error("api", "useBankImport list failed", { businessId }, err);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  const createBatch = useCallback(async (accountId: string, statementDate?: string | null) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const r = await api.post<BankImportBatch>(`/bank-imports?business_id=${businessId}`, {
      account_id: accountId, statement_date: statementDate ?? null,
    });
    await list();
    return r;
  }, [businessId, list]);

  const getBatch = useCallback(async (batchId: string): Promise<BankImportBatch> => {
    if (!businessId) throw new Error("business_id zorunlu");
    return api.get<BankImportBatch>(`/bank-imports/${batchId}?business_id=${businessId}`);
  }, [businessId]);

  const addLine = useCallback(async (batchId: string, input: {
    parsedDate?: string | null; parsedAmount: number; parsedCounterpart?: string | null; rawText?: string | null;
  }): Promise<BankImportLine> => {
    if (!businessId) throw new Error("business_id zorunlu");
    return api.post<BankImportLine>(`/bank-imports/${batchId}/lines?business_id=${businessId}`, {
      parsed_date: input.parsedDate ?? null,
      parsed_amount: input.parsedAmount,
      parsed_counterpart: input.parsedCounterpart ?? null,
      raw_text: input.rawText ?? null,
    });
  }, [businessId]);

  /**
   * Banka ekstresi PDF'ini parse eder ve satırları DB'ye YAZMADAN döndürür
   * (önizleme için). Eklemek için bulkAddLines kullanılır.
   */
  const parsePdf = useCallback(async (file: File): Promise<BankStatementParseResult> => {
    if (!businessId) throw new Error("business_id zorunlu");
    const form = new FormData();
    form.append("file", file);
    return api.upload<BankStatementParseResult>(
      `/bank-imports/parse-pdf?business_id=${businessId}`,
      form,
    );
  }, [businessId]);

  /** Önizlemeden seçilen satırları partiye toplu (veya tek) ekle. */
  const bulkAddLines = useCallback(async (
    batchId: string, lines: BankStatementPreviewLine[],
  ): Promise<BankBulkAddResult> => {
    if (!businessId) throw new Error("business_id zorunlu");
    return api.post<BankBulkAddResult>(
      `/bank-imports/${batchId}/lines/bulk?business_id=${businessId}`,
      {
        lines: lines.map((l) => ({
          parsed_date: l.parsed_date,
          parsed_amount: l.parsed_amount,
          parsed_counterpart: l.parsed_counterpart,
          parsed_balance: l.parsed_balance,
          raw_text: l.raw_text,
          dedupe_hash: l.dedupe_hash,
          chain_ok: l.chain_ok,
        })),
      },
    );
  }, [businessId]);

  const categorize = useCallback(async (lineId: string, categoryId: string): Promise<BankImportLine> => {
    if (!businessId) throw new Error("business_id zorunlu");
    return api.post<BankImportLine>(`/bank-imports/lines/${lineId}/categorize?business_id=${businessId}`, {
      category_id: categoryId,
    });
  }, [businessId]);

  const flag = useCallback(async (lineId: string): Promise<BankImportLine> => {
    if (!businessId) throw new Error("business_id zorunlu");
    return api.post<BankImportLine>(`/bank-imports/lines/${lineId}/flag?business_id=${businessId}`, {});
  }, [businessId]);

  const postLine = useCallback(async (lineId: string): Promise<BankImportLine> => {
    if (!businessId) throw new Error("business_id zorunlu");
    return api.post<BankImportLine>(`/bank-imports/lines/${lineId}/post?business_id=${businessId}`, {});
  }, [businessId]);

  useEffect(() => { void list(); }, [list]);

  return { batches, loading, list, createBatch, getBatch, addLine, parsePdf, bulkAddLines, categorize, flag, postLine };
}

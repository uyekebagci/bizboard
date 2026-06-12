/**
 * AI modülü (v1.1): AI asistanı API istemcisi.
 *
 * Backend uçları {@code /api/ai/**} altında, authenticated + business-scoped
 * (guard'lı). Anahtar/pgvector yoksa backend graceful cevap döner (500 atmaz).
 */

import { api } from "@/lib/api/client";

/** Modül durumu — UI'da "AI yapılandırılmamış" durumunu göstermek için. */
export interface AiStatus {
  enabled: boolean;
  llm_available: boolean;
  embedding_available: boolean;
  rag_enabled: boolean;
  anomaly_enabled: boolean;
}

/** RAG sohbet cevabı. */
export interface AiChatResponse {
  answer: string;
  ai_used: boolean;
  context_count: number;
}

/** İşletme-başına anomali opt-in durumu. */
export interface AiAnomalyConfig {
  enabled: boolean;
}

/** Embedding yeniden-üretim sonucu (admin). */
export interface AiReindexResponse {
  stored: number;
}

export const aiApi = {
  /** Modül durumu (key/feature). */
  status: (): Promise<AiStatus> => api.get<AiStatus>("/api/ai/status"),

  /** Bir işletme bağlamında RAG sorusu sor. */
  chat: (businessId: string, question: string): Promise<AiChatResponse> =>
    api.post<AiChatResponse>(
      `/api/ai/businesses/${encodeURIComponent(businessId)}/chat`,
      { question }
    ),

  /** İşletmenin finansal verisini yeniden indeksle (admin). */
  reindex: (businessId: string): Promise<AiReindexResponse> =>
    api.post<AiReindexResponse>(
      `/api/ai/businesses/${encodeURIComponent(businessId)}/reindex`,
      {}
    ),

  /** İşletmenin anomali opt-in durumunu oku. */
  getAnomalyConfig: (businessId: string): Promise<AiAnomalyConfig> =>
    api.get<AiAnomalyConfig>(
      `/api/ai/businesses/${encodeURIComponent(businessId)}/anomaly-config`
    ),

  /** İşletmenin anomali opt-in durumunu değiştir (admin). */
  setAnomalyConfig: (
    businessId: string,
    enabled: boolean
  ): Promise<AiAnomalyConfig> =>
    api.put<AiAnomalyConfig>(
      `/api/ai/businesses/${encodeURIComponent(businessId)}/anomaly-config`,
      { enabled }
    ),
};

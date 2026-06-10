// v2.2.0 Advanced Search — frontend API client (spec §9, §10).
//
// Tüm istekler ortak `api` wrapper'ı üzerinden gider (JWT + auto-refresh + 429
// handling). Sonuç tipleri backend `SearchResult` / `Suggestion` ile birebir.

import { api } from "@/lib/api/client";

// ── Tipler (backend SearchHit/SearchResult ile birebir) ──────────────────────

export type SearchEntityType =
  | "TRANSACTION"
  | "COUNTERPART"
  | "DEBT"
  | "EMPLOYEE"
  | "BANK_ACCOUNT"
  | "MY_COMPANY"
  | "BUSINESS"
  | "PAYMENT_INSTRUMENT"
  | "POS_DEVICE"
  | "INVENTORY_ITEM"
  | "VEHICLE"
  | "NOTE";

export interface SearchHit {
  type: SearchEntityType;
  id: string;
  title: string;
  /** Server-side `<mark>` highlight; sadece <mark> whitelist'i ile render edilir. */
  snippet: string;
  businessId?: string | null;
  businessName?: string | null;
  metadata: Record<string, unknown>;
  rank: number;
  url: string;
}

export interface DateBucket {
  month: string;
  count: number;
}

export interface SearchFacets {
  byType: Record<string, number>;
  byBusiness: Record<string, number>;
  byCategory: Record<string, number>;
  byDateBucket: DateBucket[];
}

export interface SearchResult {
  total: number;
  items: SearchHit[];
  facets: SearchFacets;
  tookMs: number;
  warnings: string[];
}

export interface Suggestion {
  type: SearchEntityType;
  id: string;
  label: string;
  businessId?: string | null;
  businessName?: string | null;
  url: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters?: Record<string, unknown> | null;
  createdAt: string;
}

export type SearchSort = "RELEVANCE" | "DATE" | "AMOUNT";

export interface SearchParams {
  q: string;
  types?: SearchEntityType[];
  page?: number;
  size?: number;
  sort?: SearchSort;
}

// ── Endpoint'ler ─────────────────────────────────────────────────────────────

function buildQuery(params: SearchParams): string {
  const sp = new URLSearchParams();
  sp.set("q", params.q ?? "");
  if (params.types?.length) params.types.forEach((t) => sp.append("types", t));
  if (params.page != null) sp.set("page", String(params.page));
  if (params.size != null) sp.set("size", String(params.size));
  if (params.sort) sp.set("sort", params.sort);
  return sp.toString();
}

export const searchApi = {
  search: (params: SearchParams) =>
    api.get<SearchResult>(`/search?${buildQuery(params)}`),

  suggest: (q: string, limit = 10) =>
    api.get<Suggestion[]>(
      `/search/suggest?q=${encodeURIComponent(q)}&limit=${limit}`
    ),

  facets: (q: string) =>
    api.get<SearchFacets>(`/search/facets?q=${encodeURIComponent(q)}`),

  savedList: () => api.get<SavedSearch[]>("/search/saved"),

  savedCreate: (body: { name: string; query: string; filters?: Record<string, unknown> }) =>
    api.post<SavedSearch>("/search/saved", body),

  savedUpdate: (id: string, body: { name?: string; query?: string; filters?: Record<string, unknown> }) =>
    api.patch<SavedSearch>(`/search/saved/${id}`, body),

  savedDelete: (id: string) => api.delete<void>(`/search/saved/${id}`),
};

// ── Yardımcılar ──────────────────────────────────────────────────────────────

/** Entity tipi → Türkçe etiket (UI rozet/facet için). */
export const ENTITY_LABELS: Record<SearchEntityType, string> = {
  TRANSACTION: "İşlem",
  COUNTERPART: "Cari",
  DEBT: "Borç/Alacak",
  EMPLOYEE: "Personel",
  BANK_ACCOUNT: "Banka Hesabı",
  MY_COMPANY: "Firmam",
  BUSINESS: "İşletme",
  PAYMENT_INSTRUMENT: "Çek/Senet",
  POS_DEVICE: "POS",
  INVENTORY_ITEM: "Envanter",
  VEHICLE: "Araç",
  NOTE: "Not",
};

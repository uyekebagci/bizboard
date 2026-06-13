/**
 * Ledger Bakım (admin) — API istemcisi + tipler.
 *
 * <p>Backend uçları MEVCUT; bu modül yalnız HTTP sözleşmesini sarar:</p>
 * <ul>
 *   <li>{@code AdminLedgerController} (/admin/ledger/**) — invariant / backfill /
 *       reverse / suggestions.</li>
 *   <li>{@code LedgerController} (/admin/ledger/**) — process-waitlist /
 *       reconciliation / close-month.</li>
 *   <li>{@code AdminDayCloseController} (/admin/day-close/**) — backdate-flag /
 *       enforce-flag / dayopen-backfill / migrate (toggle/buton).</li>
 * </ul>
 *
 * <p>Düz Java DTO'lar Jackson default'uyla <b>camelCase</b> serialize edilir
 * (proje genelinde SNAKE_CASE stratejisi YOK); bu yüzden tipler camelCase.
 * Yalnız {@code business_id}/{@code dryRun} gibi query-param'lar URL'de
 * controller imzasıyla aynen geçer.</p>
 */

import { api } from "@/lib/api/client";

// ── /admin/ledger/invariant ──────────────────────────────────────────────────

export interface LedgerMismatch {
  accountId: string;
  accountName: string;
  type: string;
  snapshot: string;
  derived: string;
}

export interface InvariantReport {
  checked: number;
  matched: number;
  mismatchCount: number;
  unbalancedEntries: number;
  mismatches: LedgerMismatch[];
  ok: boolean;
}

export function getInvariant(): Promise<InvariantReport> {
  return api.get<InvariantReport>("/admin/ledger/invariant");
}

// ── /admin/ledger/backfill ───────────────────────────────────────────────────

export interface BackfillResult {
  dryRun: boolean;
  total: number;
  derived: number;
  skipped: number;
  flagged: number;
}

export function runBackfill(dryRun: boolean): Promise<BackfillResult> {
  return api.post<BackfillResult>(
    `/admin/ledger/backfill?dryRun=${dryRun ? "true" : "false"}`,
    {},
  );
}

// ── /admin/ledger/reverse/{txId} ─────────────────────────────────────────────

export interface ReverseResult {
  txId: string;
  removedEntries: number;
}

export function reverseTransaction(txId: string): Promise<ReverseResult> {
  return api.post<ReverseResult>(
    `/admin/ledger/reverse/${encodeURIComponent(txId)}`,
    {},
  );
}

// ── /admin/ledger/suggestions/* (salt-okunur, dry-run) ───────────────────────

export interface FirmBankSuggestion {
  sourceType: string;
  id: string;
  originalName: string;
  suggestedFirm: string;
  suggestedBank: string;
}

export interface TypoMergeSuggestion {
  canonical: string;
  variants: string[];
  ids: string[];
}

export interface OperatorCategorySuggestion {
  categoryId: string;
  categoryName: string;
  businessId: string;
  suggestedTargetType: string;
  suggestedTargetId: string;
  suggestedTargetName: string;
  txCount: number;
}

export interface DuplicateCategorySuggestion {
  businessId: string;
  normalizedName: string;
  count: number;
  categoryIds: string[];
  names: string;
}

export type SuggestionKind =
  | "firm-bank"
  | "typo-merge"
  | "operator-categories"
  | "duplicate-categories";

export function getFirmBankSuggestions(): Promise<FirmBankSuggestion[]> {
  return api.get<FirmBankSuggestion[]>("/admin/ledger/suggestions/firm-bank");
}

export function getTypoMergeSuggestions(): Promise<TypoMergeSuggestion[]> {
  return api.get<TypoMergeSuggestion[]>("/admin/ledger/suggestions/typo-merge");
}

export function getOperatorCategorySuggestions(): Promise<
  OperatorCategorySuggestion[]
> {
  return api.get<OperatorCategorySuggestion[]>(
    "/admin/ledger/suggestions/operator-categories",
  );
}

export function getDuplicateCategorySuggestions(): Promise<
  DuplicateCategorySuggestion[]
> {
  return api.get<DuplicateCategorySuggestion[]>(
    "/admin/ledger/suggestions/duplicate-categories",
  );
}

// ── LedgerController: process-waitlist / reconciliation / close-month ─────────

export interface StatusMessage {
  status: string;
  message: string;
}

export interface ReconciliationResult {
  businessCount: number;
  periodsProcessed: number;
  periodsCreated: number;
  periodsUpdated: number;
  periodsDeleted: number;
  waitListCleared: number;
}

export function processWaitList(): Promise<StatusMessage> {
  return api.post<StatusMessage>("/admin/ledger/process-waitlist", {});
}

export function runReconciliation(): Promise<ReconciliationResult> {
  return api.post<ReconciliationResult>("/admin/ledger/reconciliation", {});
}

export function closeMonth(year: number, month: number): Promise<StatusMessage> {
  return api.post<StatusMessage>(
    `/admin/ledger/close-month?year=${year}&month=${month}`,
    {},
  );
}

// ── AdminDayCloseController: feature flags + backfill/migrate ─────────────────

export interface FlagState {
  key: string;
  enabled: boolean;
}

export interface EnforceFlagState extends FlagState {
  businessId: string;
}

export interface RemovedResult {
  removed: number;
}

/** §4.1 backdate flag (global). */
export function getBackdateFlag(): Promise<FlagState> {
  return api.get<FlagState>("/admin/day-close/backdate-flag");
}

export function setBackdateFlag(enabled: boolean): Promise<FlagState> {
  return api.post<FlagState>(
    `/admin/day-close/backdate-flag?enabled=${enabled ? "true" : "false"}`,
    {},
  );
}

/** Gün-açılışı enforce flag (per-business). */
export function getEnforceFlag(businessId: string): Promise<EnforceFlagState> {
  return api.get<EnforceFlagState>(
    `/admin/day-close/enforce-flag?business_id=${encodeURIComponent(businessId)}`,
  );
}

export function setEnforceFlag(
  businessId: string,
  enabled: boolean,
): Promise<EnforceFlagState> {
  return api.post<EnforceFlagState>(
    `/admin/day-close/enforce-flag?business_id=${encodeURIComponent(
      businessId,
    )}&enabled=${enabled ? "true" : "false"}`,
    {},
  );
}

/** CLOSE_SYNC gün-açılışı backfill (idempotent + reversible). */
export interface DayOpenBackfillReport {
  dryRun?: boolean;
  // Rapor şekli runner'a bağlı; UI ham JSON'u gösterir, alanlar opsiyonel.
  [key: string]: unknown;
}

export function dayOpenBackfill(dryRun: boolean): Promise<DayOpenBackfillReport> {
  return api.post<DayOpenBackfillReport>(
    `/admin/day-close/dayopen-backfill?dryRun=${dryRun ? "true" : "false"}`,
    {},
  );
}

/** CashClosing→DayClose migration (idempotent + reversible). */
export interface MigrationReport {
  dryRun?: boolean;
  [key: string]: unknown;
}

export function dayCloseMigrate(dryRun: boolean): Promise<MigrationReport> {
  return api.post<MigrationReport>(
    `/admin/day-close/migrate?dryRun=${dryRun ? "true" : "false"}`,
    {},
  );
}

// ── Etiketler ─────────────────────────────────────────────────────────────────

export const SUGGESTION_LABELS: Record<SuggestionKind, string> = {
  "firm-bank": "Firma ↔ Banka Parse",
  "typo-merge": "Typo Birleştirme",
  "operator-categories": "Operatör Kategori Ayıklama",
  "duplicate-categories": "Mükerrer Kategori",
};

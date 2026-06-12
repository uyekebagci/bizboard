// ===========================================
// ÇATI - Type Definitions
// ===========================================

// ---- Enums ----
export type BusinessCategory =
  | "construction"
  | "food_truck"
  | "restaurant"
  | "car_dealership"
  | "retail"
  | "real_estate"
  | "services"
  | "manufacturing"
  | "logistics"
  | "healthcare"
  | "education"
  | "technology"
  | "other";

export type MemberRole = "owner" | "manager" | "accountant" | "viewer";

export type ModuleType =
  | "finance"
  | "inventory"
  | "staff"
  | "projects"
  | "documents"
  | "reservations"
  | "vehicles"
  | "menu"
  | "crm"
  | "debt"
  | "notes"
  | "fixed_costs";

export type TransactionDirection = "income" | "expense";

export type NotificationType = "info" | "warning" | "alert" | "success";

// ---- Core Models ----
export interface Profile {
  id: string;
  username: string;
  email: string | null;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  preferred_currency: string;
  preferred_language: string;
  onboarding_completed: boolean;
  role: string;
  /** Backend AdminBootstrapService veya admin-reset sonrasi true.
   *  Frontend bunu gorunce kullaniciyi /dashboard/change-password'a yonlendirir. */
  force_password_change: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  business_ids: string[];
  business_names: string[];
  created_at: string;
}

/**
 * v1.6.2: BusinessType master tablosu kaldırıldı. Type alanı sadece
 * raporlama/filtreleme amaçlı serbest metin `business_type_name`. Eski
 * `BusinessType` tipi bağımlı kod için minimal stub olarak korundu —
 * yeni kodda kullanılmamalı.
 */
export interface BusinessType {
  id?: string;
  label: string;
  icon?: string;
  color?: string;
}

export interface Business {
  id: string;
  owner_id: string;
  /** v1.6.2: serbest metin tip adı (eski FK kaldırıldı) */
  business_type_name?: string | null;
  name: string;
  description: string | null;
  logo_url: string | null;
  color: string | null;
  currency: string;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined fields
  members?: BusinessMember[];
  modules?: BusinessModule[];
}

export interface BusinessMember {
  id: string;
  business_id: string;
  user_id: string;
  role: MemberRole;
  invited_email: string | null;
  is_accepted: boolean;
  permissions: Record<string, boolean>;
  created_at: string;
  updated_at: string;
  // Joined
  profile?: Profile;
}

export interface BusinessModule {
  id: string;
  business_id: string;
  module: ModuleType;
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
}

/**
 * Ledger v2 (Faz A, §3.9): kategori hibrit uygulanabilirliği.
 * BOTH (paylaşımlı, default) / INCOME_ONLY / EXPENSE_ONLY.
 */
export type CategoryApplicability = "BOTH" | "INCOME_ONLY" | "EXPENSE_ONLY";

export interface Category {
  id: string;
  business_id: string;
  name: string;
  /** @deprecated paylaşımlı modelde yön-bağımsız; applicability kullanın. */
  direction: TransactionDirection;
  /**
   * Ledger v2 (Faz A, §3.9): hibrit uygulanabilirlik. İşlem formu o anki yöne
   * göre kategorileri bununla süzer (BOTH her zaman + yöne uygun olan).
   * Eski API'lerde alan yoksa BOTH varsayılır.
   */
  applicability?: CategoryApplicability;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

/** v1.6.3+: ödeme yöntemi — POS veya NAKIT (default NAKIT). */
export type PaymentMethod = "POS" | "NAKIT" | "HESAPDAN";

/** v1.7.0-beta (Bankalar WP): tx tip ekseni. */
export type TransactionKind = "NORMAL" | "TRANSFER";

export interface Transaction {
  id: string;
  business_id: string;
  category_id: string | null;
  direction: TransactionDirection;
  /** v1.7.0-beta: NORMAL veya TRANSFER. UI badge + delete guard için. */
  kind?: TransactionKind;
  /** v1.7.0-beta: kind=TRANSFER ise pair UUID; UI TransferDetailModal tetikleyici. */
  transfer_pair_id?: string | null;
  amount: number;
  currency: string;
  description: string | null;
  date: string;
  receipt_url: string | null;
  /** v1.5.6+: kurulum maliyeti bayrağı */
  is_setup_cost?: boolean;
  /** v1.6.3+: ödeme yöntemi (POS / NAKIT) — default NAKIT. */
  payment_method?: PaymentMethod;
  /** v1.6.3+: POS komisyon oranı (yüzde). Sadece payment_method=POS iken kullanılır. */
  pos_rate?: number | null;
  /** v1.6.21 (WP-4): tx oluşturulduğu anki POS oranı snapshot (BANKA oranı). */
  applied_pos_rate?: number | null;
  /** v1.7.x (POS Komisyon WP): tx oluşturulduğu anki BİZİM komisyon oranımız snapshot. */
  applied_our_commission_rate?: number | null;
  /** v1.7.x (POS Komisyon WP): derived — amount × applied_our_commission_rate / 100. */
  our_commission_amount?: number | null;
  /** v1.7.x (POS Komisyon WP): derived — amount × applied_pos_rate / 100. */
  bank_commission_amount?: number | null;
  /** v1.7.x (POS Komisyon WP): derived — our_commission_amount − bank_commission_amount. */
  pos_profit?: number | null;
  /** v1.6.21 (WP-4): hangi POS cihazında çekildi. */
  pos_device_id?: string | null;
  pos_device_name?: string | null;
  /** v1.6.21 (WP-4): POS çekim banka hesabına düştü mü (null=nakit). */
  pos_settled?: boolean | null;
  /** v1.6.23.9: POS settle zaman damgası (pos_settled=true iken). */
  settled_at?: string | null;
  /** v1.6.23.9: settle sonrası hangi banka. */
  settled_bank_account_id?: string | null;
  settled_bank_account_name?: string | null;
  /** WP b446c696 (Beta v1.1 Hotfix): POS gider alt-tip. NAKIT | TRANSFER | null. */
  pos_tx_subtype?: "NAKIT" | "TRANSFER" | null;
  /** WP b446c696: POS gider TRANSFER alt-tipinde ilgili banka hesabı (sadece bilgi). */
  related_bank_account_id?: string | null;
  related_bank_account_name?: string | null;
  /** v1.6.23.8 (WP 3cdf2a4f): POS tx için derived komisyon (legacy = bank_commission_amount). */
  pos_commission?: number | null;
  /** v1.6.23.8 (WP 3cdf2a4f): POS tx için derived net (= amount − bank_commission). */
  pos_net?: number | null;
  /** v1.6.20 (WP-3): karşı taraf. */
  target_counterpart_id?: string | null;
  target_counterpart_name?: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  category?: Category;
  business_name?: string;
  /** WP Sub-Cash Retroactive Inclusion: sub-cash detail tx list context'i için. */
  inclusion_scope?: "AUTOMATIC" | "MANUAL" | null;
}

/** WP Sub-Cash Retroactive Inclusion: available-tx endpoint response. */
export interface AvailableTxPage {
  total: number;
  offset: number;
  limit: number;
  items: Transaction[];
}

/** v1.6.3+: GET /api/pos/businesses cevabı — POS işlemi olan işletme özeti. */
export interface PosBusinessSummary {
  business_id: string;
  business_name: string;
  currency: string;
  total_gross: number;
  total_commission: number;
  total_net: number;
  weighted_avg_rate: number;
  transaction_count: number;
}

/** v1.6.3+: GET /api/pos/transactions/daily — bir tek günlük POS işlemi satırı. */
export interface PosTransactionRow {
  transaction_id: string;
  business_id: string;
  business_name: string;
  date: string;
  amount: number;
  pos_rate: number;
  commission: number;
  net: number;
  currency: string;
  description: string | null;
}

/** v1.6.3+: GET /api/cash/businesses — nakit bakiyesi olan işletme. */
export interface CashBusinessBalance {
  business_id: string;
  business_name: string;
  currency: string;
  balance: number;
}

export interface Notification {
  id: string;
  /** business_id artik backend NotificationDto'da. user_id frontend'e expose edilmiyor. */
  business_id: string | null;
  business_name?: string | null;
  type: NotificationType | string;
  title: string;
  message: string;
  is_read: boolean;
  action_url: string | null;
  created_at: string;
}

/** /admin/audit-logs sonucu. */
export interface AuditLog {
  id: string;
  occurred_at: string;
  trace_id: string | null;
  actor_user_id: string | null;
  actor_username: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  business_id: string | null;
  ip: string | null;
  user_agent: string | null;
  /** Backend'in ürettiği insan-okunur özet — listede ana metin. */
  detail: string | null;
  /** BACKDATED / CORRECTION / CLOSING_REOPEN / POS_RATE_OVERRIDE / null — UI rozeti. */
  highlight_type: string | null;
  metadata: Record<string, unknown> | null;
}

/** Backend PagedResponse<T>. */
export interface PagedResponse<T> {
  items: T[];
  page: number;
  size: number;
  total_elements: number;
  total_pages: number;
  has_next: boolean;
}

export interface MonthlySummary {
  id: string;
  business_id: string;
  year: number;
  month: number;
  total_income: number;
  total_expense: number;
  net_profit: number;
  transaction_count: number;
  breakdown_by_category: Record<
    string,
    { income: number; expense: number }
  >;
  created_at: string;
  updated_at: string;
}

export interface PeriodSummary {
  business_id: string;
  period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom";
  period_start: string;
  period_end: string;
  total_income: number;
  total_expense: number;
  net_profit: number;
  transaction_count: number;
  is_closed: boolean;
  breakdown_by_category: Record<
    string,
    { income?: number; expense?: number }
  >;
  fixed_cost_total: number;
  total_expense_with_fixed: number;
  net_profit_with_fixed: number;
}

// ---- v1.6.11+: Business Group Models ----
export type GroupPriority = 0 | 1 | 2; // 0=PINNED, 1=HIGH, 2=NORMAL

export type GroupColor =
  | "zinc" | "blue" | "green" | "orange"
  | "red" | "purple" | "pink" | "teal";

export interface BusinessGroupMemberItem {
  business_id: string;
  business_name: string;
  order_in_group: number;
  added_at: string;
}

export interface BusinessGroup {
  id: string;
  name: string;
  color: GroupColor | string;
  priority: GroupPriority;
  order_index: number;
  members: BusinessGroupMemberItem[];
  created_at: string;
  updated_at: string;
}

// ---- v1.6.20+ (WP-3): Consolidated Dashboard Models ----
export interface ConsolidatedDashboard {
  business_id: string;
  consolidated: {
    total_cash: number;
    /** v1.6.23.7: CHECKING+SAVINGS toplam (kasa-dışı). */
    total_bank_balance?: number;
    credit_card_debt: number;
    loan_principal: number;
    receivables: number;
    payables: number;
    net: number;
    /** v1.6.23.9 (TODO 8c7ffaac): bekleyen POS tahsilatları net toplam. */
    pending_pos_receivables?: number;
    /** v1.6.23.9: net + pending_pos_receivables. */
    expected_net?: number;
  };
  today_closing: {
    opening_balance: number;
    incoming: number;
    outgoing: number;
    computed_closing: number;
    actual_balance: number | null;
    difference: number | null;
    closed: boolean;
    is_auto: boolean;
    closing_id: string | null;
  };
  pos_devices: Array<{
    device_id: string;
    device_name: string;
    today_gross: number;
    /** WP b446c696 (Beta v1.1 Hotfix): POS gelir hacmi (= today_gross). */
    today_income_gross?: number;
    /** WP b446c696: POS gider hacmi. */
    today_expense_gross?: number;
    /** Legacy alias of today_bank_commission. */
    today_commission: number;
    /** v1.7.x (POS Komisyon WP): banka komisyon toplamı. */
    today_bank_commission?: number;
    /** v1.7.x (POS Komisyon WP): bizim komisyon toplamı. */
    today_our_commission?: number;
    /** v1.7.x (POS Komisyon WP): kâr = our − bank. */
    today_profit?: number;
    today_net: number;
    unsettled_count: number;
    tx_count: number;
  }>;
  bank_accounts: Array<{
    id: string;
    name: string;
    // v1.6.23.25: Kasa hiyerarşisi enum'a MAIN_CASH + SUB_CASH eklendi.
    // v1.6.23.27: SUB_CASH widget'ta tıklanınca SubCashDetailContent render edilir.
    type: BankAccountType;
    bank_name: string | null;
    holder_name: string | null;
    balance: number;
    currency: string;
  }>;
  payables: Array<{
    debt_id: string;
    counterpart_name: string;
    amount: number;
    currency: string;
    due_date: string | null;
    days_to_due: number | null;
    instrument_type: string | null;
  }>;
  receivables: {
    total: number;
    type_breakdown: Array<{ type: string; amount: number; count: number }>;
    overdue_count: number;
    total_count: number;
  };
  cash_outflows_today: Array<{
    tx_id: string;
    description: string | null;
    category_name: string | null;
    amount: number;
    counterpart_name: string | null;
    date: string;
  }>;
  upcoming_cheques: Array<{
    debt_id: string;
    counterpart_name: string;
    amount: number;
    cheque_due_date: string;
    cheque_no: string | null;
    collector_bank: string | null;
    days_to_due: number;
  }>;
  upcoming_reminders: Array<{
    debt_id: string;
    counterpart_name: string;
    amount: number;
    reminder_date: string;
    reminder_note: string | null;
    days_to_remind: number;
  }>;
  net_position: {
    receivables: number;
    payables: number;
    net: number;
    net_positive: boolean;
  };
}

/** v1.6.23.25 (UI Fix WP TODO 39a4218b): Kasa hiyerarşisi enum. */
export type BankAccountType =
  | "CHECKING"
  | "SAVINGS"
  | "MAIN_CASH"   // Ana Kasa — auto, unique per business, silinemez
  | "SUB_CASH"    // Alt kasa — manuel CRUD
  | "CASH_HOLDER";

export interface BankAccountListItem {
  id: string;
  /** v1.6.23.19 (Security WP 667d8a71): multi-tenant binding — UI'da rozet/filter. */
  business_id: string | null;
  business_name: string | null;
  name: string;
  type: BankAccountType;
  bank_name: string | null;
  iban: string | null;
  currency: string;
  holder_person_id: string | null;
  holder_person_name: string | null;
  /** v1.7.0.x: Banka hesabının ait olduğu kendi firmamız (MyCompany). */
  owner_my_company_id: string | null;
  owner_my_company_name: string | null;
  current_balance: number;
  is_active: boolean;
  notes: string | null;
  /** v1.6.23.25: UI MAIN_CASH satırını ayırt etmek için flag. */
  is_main_cash?: boolean;
  /** v1.6.23.25: false = delete butonu disable (MAIN_CASH). */
  is_user_deletable?: boolean;
  /** v1.6.23.27 (UI Fix WP TODO 7b6258b8): sistem-managed (Genel Nakit) — delete/edit kısıtlı. */
  is_system?: boolean;
}

// ─────────── v1.6.23.27 Sub-Cash Aggregator (UI Fix WP) ───────────

export type SubCashEntityType = "COUNTERPART" | "POS_DEVICE" | "BANK_ACCOUNT";

export interface SubCashAssignment {
  id: string;
  sub_cash_id: string;
  sub_cash_name: string;
  business_id: string;
  entity_type: SubCashEntityType;
  entity_id: string;
  entity_name: string;
  entity_balance_contribution: number;
  assigned_at: string;
  assigned_by: string | null;
}

export interface SubCashDetail {
  sub_cash: BankAccountListItem;
  /** Σ assigned BANK_ACCOUNT.current_balance */
  aggregate: number;
  main_aggregate: number;
  unassigned_aggregate: number;
  assignments: SubCashAssignment[];
  transactions: BankAccountTxRow[];
}

// v1.7.x WP 8b961444 TODO 474b775c: Sub-cash periyot geliri (multi-attribution)
export interface SubCashIncomeSourceBreakdown {
  source_type: SubCashEntityType;
  source_id: string;
  source_name: string;
  tx_count: number;
  income: number;
}

export interface SubCashIncomeMonthlyPoint {
  month: string; // "YYYY-MM"
  income: number;
  tx_count: number;
}

export interface SubCashIncomeSummary {
  sub_cash_id: string;
  from_date: string;
  to_date: string;
  total_income: number;
  tx_count: number;
  breakdown_by_source: SubCashIncomeSourceBreakdown[];
  by_month: SubCashIncomeMonthlyPoint[];
}

/**
 * v1.6.23.19 (UI Fix WP 8b961444): {@code GET /bank-accounts/{id}} aggregate.
 */
export interface BankAccountDetail {
  account: BankAccountListItem;
  recent_transactions: BankAccountTxRow[];
  pending_pos_transactions: BankAccountTxRow[];
  balance_trend: { date: string; balance: number }[];
}

export interface BankAccountTxRow {
  id: string;
  business_id: string;
  direction: "INCOME" | "EXPENSE";
  amount: number;
  currency: string;
  description: string | null;
  date: string;
  payment_method: string;
  pos_settled: boolean | null;
  pos_device_name: string | null;
  /** WP Sub-Cash Retroactive Inclusion: sub-cash context'inde scope. */
  inclusion_scope?: "AUTOMATIC" | "MANUAL" | null;
}

export interface PosDeviceListItem {
  id: string;
  name: string;
  /** @deprecated v1.7.x — owner_my_company_id tercih edilmeli. */
  owner_counterpart_id: string | null;
  owner_counterpart_name: string | null;
  /** v1.7.x: POS cihazını hangi kendi firmamıza (MyCompany) ait. */
  owner_my_company_id: string | null;
  owner_my_company_name: string | null;
  bank_name: string | null;
  /** Default BANKA komisyon oranı (cihaz default). */
  default_rate: number | null;
  last_used_rate: number | null;
  /** v1.7.x (POS Komisyon WP): cihaz default BİZİM komisyon oranımız. */
  our_commission_rate?: number | null;
  is_active: boolean;
  notes: string | null;
}

// ---- v1.6.19+ (WP-2): Cash Closing Models ----
export type CashClosingStatus = "PENDING" | "CLOSED" | "REOPENED";
export type CashClosingReason = "LOSS" | "MIS_ENTRY" | "ROUNDING" | "OTHER";

export interface CashClosing {
  id: string;
  closing_date: string;        // ISO YYYY-MM-DD
  opening_balance: number;
  computed_closing: number;
  actual_balance: number | null;
  difference: number | null;
  status: CashClosingStatus;
  is_auto: boolean;
  closed_at: string | null;
  closed_by: string | null;
  reason_category: CashClosingReason | string | null;
  reason_note: string | null;
}

export interface CashClosingPreview {
  date: string;
  opening_balance: number;
  computed_closing: number;
  net_flow: number;
  closed: boolean;
  auto: boolean;
}

// ---- Ledger v2 (Faz B): DayClose / SAĞLAMA HESAP / kaçak ----

export type DayCloseStatus = "PENDING" | "CLOSED" | "REOPENED";
export type DayCloseCreatedVia =
  | "AUTO_CRON" | "TODAY" | "BACKDATED" | "EDIT_APPROVED" | "CHAIN_RECOMPUTE" | "MIGRATED";
export type DayCloseEditStatus = "PENDING" | "APPROVED" | "APPLIED" | "REJECTED";

export interface DayCloseAccountCount {
  id?: string;
  account_id: string;
  account_name?: string;
  account_type?: string;
  counted_balance?: number | null;
  computed_balance?: number | null;
  account_variance?: number | null;
}

export interface DayClose {
  id: string | null;
  close_date: string;
  status: DayCloseStatus | string;
  opening_balance: number;      // ÖNCEKİ KASA
  total_in: number;             // TOPLAM GELEN
  total_out: number;            // TOPLAM GİDEN
  computed_closing: number;     // OLMASI GEREKEN
  actual_total: number | null;  // SON KASA
  variance: number | null;      // ARTI EKSİ KALAN (computed - actual)
  variance_threshold?: number | null;
  alarm_fired: boolean;
  is_backdated: boolean;
  created_via?: DayCloseCreatedVia | string;
  reason_category?: string | null;
  reason_note?: string | null;
  closed_by?: string | null;
  closed_at?: string | null;
  account_counts: DayCloseAccountCount[];
}

export interface DayCloseDrillDownMovement {
  posting_id: string;
  journal_entry_id: string | null;
  account_id: string | null;
  account_name: string | null;
  amount: number;
  source_type: string | null;
  description: string | null;
}

export interface DayCloseDrillDown {
  close_date: string;
  opening_balance: number;
  total_in: number;
  total_out: number;
  computed_closing: number;
  actual_total: number | null;
  variance: number | null;
  account_breakdown: DayCloseAccountCount[];
  movements: DayCloseDrillDownMovement[];
}

// ---- Ledger v2 (Faz B — Gün Açılışı): DayOpen / devir yuvarlama / state machine ----

/** Birleşik gün yaşam-döngüsü: AÇILMAMIŞ → AÇIK → KAPALI. */
export type DayLifecycleStatus = "UNOPENED" | "OPEN" | "CLOSED";
export type DayOpenStatus = "OPEN" | "CLOSED";
export type DayOpenCreatedVia = "MANUAL" | "BACKDATED" | "AUTO" | "CLOSE_SYNC";

export interface DayOpenAccountOpening {
  id?: string;
  account_id: string;
  account_name?: string;
  account_type?: string;
  carried_over: number;   // otomatik devir (önceki gün CLOSED actual)
  rounded: number;        // kullanıcının yuvarladığı açılış
  rounding_delta: number; // rounded - carried_over
}

export interface DayOpen {
  id: string | null;
  open_date: string;
  status: DayOpenStatus | string | null;
  lifecycle_status: DayLifecycleStatus | string;
  carried_over_total: number;
  rounded_total: number;
  rounding_delta: number;
  rounding_entry_id?: string | null;
  reason_note?: string | null;
  is_backdated: boolean;
  created_via?: DayOpenCreatedVia | string;
  opened_by?: string | null;
  opened_at?: string | null;
  account_openings: DayOpenAccountOpening[];
}

export interface DayStatus {
  date: string;
  lifecycle_status: DayLifecycleStatus | string;
  enforcement_enabled: boolean;
  can_add_transaction: boolean;
}

export interface DayCloseEditRequest {
  id: string;
  day_close_id: string;
  close_date: string | null;
  status: DayCloseEditStatus | string;
  payload?: Record<string, unknown> | null;
  before_snapshot?: Record<string, unknown> | null;
  reason_category?: string | null;
  reason_note?: string | null;
  requested_by?: string | null;
  requested_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  applied_at?: string | null;
  reject_note?: string | null;
}

// ---- Ledger v2 (Faz B): banka import (manuel satır iskeleti) ----

export type BankImportLineStatus = "PARSED" | "CATEGORIZED" | "POSTED" | "FLAGGED";

export interface BankImportLine {
  id: string;
  parsed_date: string | null;
  parsed_amount: number;
  parsed_counterpart: string | null;
  raw_text: string | null;
  suggested_category_id: string | null;
  suggested_category_name: string | null;
  confirmed_category_id: string | null;
  status: BankImportLineStatus | string;
  journal_entry_id: string | null;
}

export interface BankImportBatch {
  id: string;
  account_id: string;
  account_name: string;
  statement_date: string | null;
  status: string;
  line_count: number;
  matched_count: number;
  unexplained_count: number;
  created_at: string | null;
  lines?: BankImportLine[];
}

// ---- Debt Models ----
export type DebtDirection = "RECEIVABLE" | "PAYABLE";

/** v1.6.5+: receivable_type kanonik değerler. */
export type ReceivableType = "SENET" | "CEK" | "ALTIN" | "NAKIT" | "DIGER";

export interface Debt {
  id: string;
  business_id: string;
  business_name: string;
  direction: DebtDirection;
  counterparty: string;
  /** v1.5.1+: normalize edilmiş Counterpart FK; legacy free-text 'counterparty' yine doldurulur. */
  counterpart_id?: string | null;
  counterpart_name?: string | null;
  amount: number;
  currency: string;
  instrument_type: string;
  /** v1.6.5+: yalnız RECEIVABLE için doldurulur. */
  receivable_type?: ReceivableType | null;
  /** v1.6.5+: receivable_type=DIGER iken serbest metin tip adı. */
  receivable_type_other?: string | null;
  // v1.6.22+ (WP-5): çek + reminder alanları
  cheque_due_date?: string | null;
  cheque_collector_bank?: string | null;
  cheque_no?: string | null;
  reminder_date?: string | null;
  reminder_note?: string | null;
  due_date: string | null;
  is_settled: boolean;
  settled_at: string | null;
  description: string | null;
  document_url: string | null;
  admin_only: boolean;
  created_by_name: string | null;
  created_at: string;
}

/** v1.6.5+: GET /api/receivables — bir karşı taraf için bir tip kırılımı. */
export interface ReceivableTypeBreakdown {
  /** SENET / CEK / ALTIN / NAKIT / DIGER / UNSPECIFIED */
  type: ReceivableType | "UNSPECIFIED";
  /** type=DIGER iken serbest metin etiketi, aksi takdirde null. */
  label?: string | null;
  amount: number;
  count: number;
}

/** WP a9da4e9d (USD+Altın): borç para birimi. */
export type DebtCurrency = "TRY" | "USD" | "GOLD";

/** WP a9da4e9d: GET /exchange-rates — güncel kur gösterimi (USD + gram/çeyrek/yarım/tam altın). */
export interface ExchangeRate {
  code: "USD" | "GOLD" | "GOLD_QUARTER" | "GOLD_HALF" | "GOLD_FULL";
  rate_to_try: number;
  source?: string | null;
  fetched_at?: string | null;
  stale: boolean;
}

/** v1.6.5+: GET /api/receivables — counterpart bazlı alacak özeti. */
export interface ReceivableAggregate {
  counterpart_id?: string | null;
  counterpart_name: string;
  total_amount: number;
  currency: string;
  receivable_types: ReceivableTypeBreakdown[];
  last_due_date?: string | null;
  count: number;
}

export interface DebtSummary {
  total_receivable: number;
  total_payable: number;
  net_balance: number;
  settled_receivable: number;
  settled_payable: number;
  pending_receivable: number;
  pending_payable: number;
  receivable_count: number;
  payable_count: number;
}

export interface BusinessNote {
  id: string;
  business_id: string;
  content: string;
  is_pinned: boolean;
  color: string | null;
  admin_only: boolean;
  /** WP a9da4e9d fix: "BUSINESS" (işletme notları) veya "RECEIVABLES" (alacaklar). */
  scope?: "BUSINESS" | "RECEIVABLES";
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

// ---- File Upload Models ----
export interface FileUploadInfo {
  id: string;
  original_name: string;
  content_type: string;
  size: number;
  category: string;
  description: string | null;
  admin_only: boolean;
  entity_type: string | null;
  entity_id: string | null;
  business_name: string | null;
  url: string;
  uploaded_by_name: string | null;
  created_at: string;
}

// ---- Employee Models ----
export interface Employee {
  id: string;
  business_id: string;
  business_name: string;
  full_name: string;
  position: string | null;
  tc_no: string | null;
  phone: string | null;
  salary: number;
  insurance_cost: number;
  total_cost: number;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeSummary {
  total_employees: number;
  active_employees: number;
  total_salary: number;
  total_insurance: number;
  total_cost: number;
}

// ---- Fixed Cost Models ----
export interface FixedCost {
  id: string;
  business_id: string;
  business_name: string;
  name: string;
  type: string;
  amount: number;
  frequency: string;
  is_auto: boolean;
  /** v1.5.9: recurring engine "her ay otomatik tx üret" tercihi */
  auto_generate?: boolean;
  /** v1.5.9: son otomatik üretim zamanı (null → henüz çalışmadı) */
  last_auto_run?: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FixedCostSummary {
  total_monthly_cost: number;
  rent_cost: number;
  personnel_cost: number;
  other_cost: number;
  fixed_costs: FixedCost[];
}

// ---- Vehicle Models ----
export interface Vehicle {
  id: string;
  business_id: string;
  business_name: string;
  plate_number: string;
  brand: string | null;
  model: string | null;
  model_year: number | null;
  color: string | null;
  chassis_number: string | null;
  engine_number: string | null;
  fuel_type: string | null;
  engine_displacement: number | null;
  horse_power: number | null;
  transmission: string | null;
  vehicle_type: string | null;
  current_km: number;
  avg_fuel_consumption: number | null;
  registration_serial: string | null;
  registration_number: string | null;
  traffic_insurance_expiry: string | null;
  kasko_expiry: string | null;
  inspection_expiry: string | null;
  ownership_type: string;
  rental_cost: number;
  rental_period: string | null;
  rental_start_date: string | null;
  rental_end_date: string | null;
  rental_company: string | null;
  monthly_rental_cost: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleSummary {
  total_vehicles: number;
  active_vehicles: number;
  owned_count: number;
  rented_count: number;
  leased_count: number;
  total_monthly_rental_cost: number;
}

// ---- API / View Models ----
export interface PortfolioSummary {
  total_income: number;
  total_expense: number;
  net_profit: number;
  business_count: number;
  fixed_cost_total: number;
  total_expense_with_fixed: number;
  net_profit_with_fixed: number;
  businesses: {
    business_id: string;
    income: number;
    expense: number;
    profit: number;
    fixed_cost: number;
  }[];
}

// ---- Inventory Models ----
export interface InventoryItem {
  id: string;
  business_id: string;
  name: string;
  category: string; // HEAVY_VEHICLE, LIGHT_EQUIPMENT, SITE_SETUP, CONSUMABLE
  status: string; // ACTIVE, BROKEN, IN_REPAIR, SCRAPPED, IN_STOCK
  serial_number: string | null;
  company_barcode: string | null;
  brand: string | null;
  model: string | null;
  power_capacity: string | null;
  energy_source: string | null;
  dimensions: string | null;
  material_type: string | null;
  module_count: number | null;
  interior_details: string | null;
  sku: string | null;
  unit: string | null;
  minimum_stock: number | null;
  current_stock: number | null;
  reorder_point: number | null;
  reorder_lead_days: number | null;
  effective_reorder_point: number | null;
  needs_reorder: boolean;
  suggested_order_quantity: number | null;
  warehouse_location: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  stock_category: string | null;
  assigned_to: string | null;
  assigned_type: string | null;
  location: string | null;
  warranty_expiry: string | null;
  last_maintenance_date: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  business_name?: string;
}

export interface InventorySummary {
  total_items: number;
  heavy_vehicle_count: number;
  light_equipment_count: number;
  site_setup_count: number;
  consumable_count: number;
  active_count: number;
  broken_count: number;
  in_repair_count: number;
  low_stock_count: number;
  warranty_expiring_count: number;
  total_value: number;
}

export interface MaintenanceLog {
  id: string;
  inventory_item_id: string;
  maintenance_type: string;
  description: string | null;
  cost: number | null;
  date: string;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface FuelLog {
  id: string;
  inventory_item_id: string;
  fuel_type: string;
  amount: number;
  cost: number;
  date: string;
  odometer_km: number | null;
  station: string | null;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface BusinessCard {
  id: string;
  name: string;
  category: BusinessCategory;
  icon: string;
  color: string;
  monthlyIncome: number;
  monthlyExpense: number;
  netProfit: number;
  trend: number; // percentage change from previous month
  status: "healthy" | "warning" | "critical";
  notificationCount: number;
}

export interface DashboardData {
  portfolio: PortfolioSummary;
  businesses: BusinessCard[];
  recentTransactions: Transaction[];
  notifications: Notification[];
}

// ---- Finance Module Models ----
export interface FinanceOverview {
  current_period: FinancePeriodData;
  previous_period: FinancePeriodData;
  monthly_trend: FinanceMonthData[];
  expense_by_category: FinanceCategoryData[];
  income_by_category: FinanceCategoryData[];
  business_breakdown: BusinessFinanceData[];
  top_expenses: TopTransactionData[];
  top_incomes: TopTransactionData[];
  daily_cash_flow: DailyCashFlowData[];
}

export interface FinancePeriodData {
  income: number;
  expense: number;
  net_profit: number;
  fixed_cost: number;
  total_expense_with_fixed: number;
  net_profit_with_fixed: number;
  transaction_count: number;
  income_change_pct?: number;
  expense_change_pct?: number;
  profit_change_pct?: number;
}

export interface FinanceMonthData {
  year: number;
  month: number;
  label: string;
  income: number;
  expense: number;
  net_profit: number;
  fixed_cost: number;
  transaction_count: number;
}

export interface FinanceCategoryData {
  name: string;
  icon: string | null;
  color: string | null;
  amount: number;
  percentage: number;
  transaction_count: number;
}

export interface BusinessFinanceData {
  business_id: string;
  business_name: string;
  color: string | null;
  income: number;
  expense: number;
  net_profit: number;
  fixed_cost: number;
  profit_margin: number;
  transaction_count: number;
}

export interface TopTransactionData {
  id: string;
  business_name: string;
  description: string | null;
  category_name: string;
  amount: number;
  date: string;
  direction: string;
}

export interface DailyCashFlowData {
  date: string;
  income: number;
  expense: number;
  net: number;
  cumulative: number;
}

// ---- v1.5.x: Firmalar & Cari ----

export type CompanyType = "AS" | "LTD" | "SAHIS" | "KOOP" | "DERNEK" | "OTHER";

export interface MyCompany {
  id: string;
  legal_name: string;
  tax_id: string | null;
  tax_office: string | null;
  trade_registry_no: string | null;
  company_type: CompanyType;
  activity_code: string | null;
  incorporated_at: string | null;
  mersis_no: string | null;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  is_default: boolean;
  // v1.7.x: opsiyonel grup
  group_id?: string | null;
  group_name?: string | null;
  group_color?: string | null;
  group_icon?: string | null;
  created_at: string;
  updated_at: string;
}

export type CounterpartRole = "CUSTOMER" | "SUPPLIER" | "BOTH" | "OTHER";

/** v1.6.18+ (WP-1): varlık tipi — PERSON / FIRM. */
export type CounterpartKind = "PERSON" | "FIRM";

export interface Counterpart {
  id: string;
  /** v1.6.23.20 (Security WP): tenant binding. */
  business_id?: string | null;
  name: string;
  tax_id: string | null;
  tax_office: string | null;
  role: CounterpartRole;
  /** v1.6.18+ */
  kind?: CounterpartKind;
  /** v1.6.18+: alt-firma hiyerarşisi parent FK. */
  parent_id?: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  current_balance: number;
  payment_terms_days: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CounterpartStatementEntry {
  debt_id: string;
  business_id: string | null;
  business_name: string | null;
  direction: DebtDirection;
  amount: number;
  currency: string;
  instrument_type: string;
  due_date: string | null;
  settled: boolean;
  settled_at: string | null;
  description: string | null;
  created_at: string;
  running_balance: number;
}

export interface CounterpartStatement {
  counterpart_id: string;
  counterpart_name: string;
  from_date: string;
  to_date: string;
  opening_balance: number;
  closing_balance: number;
  total_receivable: number;
  total_payable: number;
  entry_count: number;
  entries: CounterpartStatementEntry[];
}

// ──────────────────────────────────────────────────────────────────
// v1.7.x WP 8b961444 TODO ba04debb: Firmalarım (MyCompany) refactor
// ──────────────────────────────────────────────────────────────────

export interface MyCompanyGroup {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  order_index: number;
  firm_count: number;
  created_at: string;
}

export interface MyCompanyAccessUser {
  access_id: string;
  user_id: string;
  username: string;
  full_name: string | null;
  granted_at: string;
  granted_by_username: string | null;
}

// ──────────────────────────────────────────────────────────────────
// v1.7.x WP fbb2ef55: Cari hesap & ödeme akışı
// ──────────────────────────────────────────────────────────────────

export type PaymentDirection = "RECEIVED" | "PAID";
export type PaymentMethodKind = "NAKIT" | "HESAPDAN" | "CHEQUE" | "PROMISSORY_NOTE";
export type InstrumentType = "CHEQUE" | "PROMISSORY_NOTE";
export type InstrumentDirection = "INCOMING" | "OUTGOING";
export type InstrumentStatus = "PORTFOLIO" | "CLEARED" | "BOUNCED" | "CANCELLED";
export type DebtStatus = "OPEN" | "PARTIAL" | "PAID" | "CANCELLED";

export interface PaymentInstrumentDto {
  id: string;
  business_id: string;
  counterpart_id: string;
  counterpart_name: string | null;
  instrument_type: InstrumentType;
  direction: InstrumentDirection;
  amount: number;
  currency: string;
  issue_date: string;
  due_date: string;
  cheque_number?: string | null;
  drawer_bank?: string | null;
  drawer_branch?: string | null;
  note_serial?: string | null;
  status: InstrumentStatus;
  cleared_at?: string | null;
  cleared_bank_account_id?: string | null;
  cleared_bank_account_name?: string | null;
  bounced_at?: string | null;
  description?: string | null;
  created_at: string;
}

export interface PaymentAllocation {
  debt_id: string;
  amount: number;
}

export interface CreatePaymentRequest {
  payment_direction: PaymentDirection;
  payment_method: PaymentMethodKind;
  amount: number;
  payment_date: string;
  bank_account_id?: string | null;
  cheque_details?: {
    cheque_number: string;
    drawer_bank: string;
    drawer_branch?: string | null;
    due_date: string;
  };
  note_details?: {
    note_serial: string;
    due_date: string;
  };
  allocations?: PaymentAllocation[];
  description?: string | null;
}

export interface PaymentResponse {
  payment_id: string;
  linked_transaction_id?: string | null;
  linked_instrument_id?: string | null;
  debts_updated: Array<{
    debt_id: string;
    remaining_after: number;
    status: DebtStatus;
  }>;
  overpayment_created?: { debt_id: string; amount: number } | null;
}

export interface AccountStatement {
  counterpart: {
    id: string;
    name: string;
    kind?: string | null;
    role?: string | null;
    tax_id?: string | null;
  };
  current_balance: number;
  balance_breakdown: {
    open_receivables_total: number;
    open_payables_total: number;
    portfolio_cheques_incoming: number;
    portfolio_cheques_outgoing: number;
    portfolio_notes_incoming: number;
    portfolio_notes_outgoing: number;
    net_realized: number;
    net_with_portfolio: number;
    /** v1.7.0.x WP a9da4e9d: bu counterpart için toplam silme tutarı. */
    total_writeoffs_amount?: number;
  };
  open_debts: Array<{
    id: string;
    direction: "RECEIVABLE" | "PAYABLE";
    /** GÜNCEL kurla TL tam tutar (totals/ödeme için — geriye uyumlu). */
    original_amount: number;
    /** GÜNCEL kurla TL kalan tutar (totals/ödeme için — geriye uyumlu). */
    remaining_amount: number;
    /**
     * WP currency-display: borcun orijinal para birimi (TRY/USD/GOLD).
     * Gösterim için: USD borç "$40.000", GOLD "gram/kg". TL toplama
     * çevrilmiş haliyle ({@link original_amount}) eklenmeye devam eder.
     */
    currency?: string | null;
    /** WP currency-display: orijinal cinsindeki tam tutar (USD adedi / gram). */
    original_currency_amount?: number | null;
    /** WP currency-display: orijinal cinsindeki kalan tutar. */
    remaining_currency_amount?: number | null;
    status: DebtStatus;
    due_date?: string | null;
    description?: string | null;
    created_at: string;
  }>;
  payment_history: Array<{
    id: string;
    payment_direction: PaymentDirection;
    payment_method: PaymentMethodKind;
    amount: number;
    payment_date: string;
    linked_transaction_id?: string | null;
    linked_instrument_id?: string | null;
    debt_id?: string | null;
    description?: string | null;
    created_at: string;
  }>;
  instruments_portfolio: PaymentInstrumentDto[];
  transactions: Transaction[];
  running_balance_history: Array<{
    date: string;
    type: "DEBT_CREATED" | "PAYMENT" | "INSTRUMENT_CLEARED" | "INSTRUMENT_BOUNCED" | "TRANSACTION" | "WRITEOFF";
    amount: number;
    balance_after: number;
    reference_id: string;
    description: string;
  }>;
  /** v1.7.0.x WP a9da4e9d: borç silme kayıtları. */
  writeoffs?: DebtWriteoff[];
}

/** v1.7.0.x WP a9da4e9d: Borç silme kaydı. */
export interface DebtWriteoff {
  id: string;
  business_id: string;
  counterpart_id: string;
  counterpart_name: string | null;
  debt_id: string;
  amount: number;
  reason: string | null;
  written_off_by: string;
  written_off_by_name: string | null;
  written_off_at: string;
  debt_remaining_after?: number | null;
  debt_status_after?: string | null;
}

// v1.6.2: BusinessTypeDefaultCost interface'i kaldırıldı — backend master
// tablosu silindiği için kullanım yok.

// ---- v1.6.23.12 (WP 3c8401f6): Phone tracking ----
export interface PhoneBrand {
  id: string;
  name: string;
  slug?: string | null;
  sort_order: number;
  is_active: boolean;
  model_count?: number;
}

export interface PhoneModel {
  id: string;
  brand_id: string;
  brand_name: string;
  name: string;
  release_year?: number | null;
  is_active: boolean;
}

export interface PhoneDeviceBank {
  bank_name: string;
  app_username?: string | null;
  notes?: string | null;
}

export interface PhoneDevice {
  id: string;
  business_id: string;
  business_name: string;
  device_number: number;
  phone_number?: string | null;
  assigned_counterpart_id?: string | null;
  assigned_counterpart_name?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  model_id?: string | null;
  model_name?: string | null;
  custom_model?: string | null;
  display_label: string;
  notes?: string | null;
  is_active: boolean;
  banks: PhoneDeviceBank[];
  created_at?: string | null;
  updated_at?: string | null;
}

// ─────────── v1.7.0-beta Transfer (Bankalar WP) ───────────

export interface CreateTransferRequest {
  from_bank_account_id: string;
  to_bank_account_id: string;
  amount: number;
  date: string;
  description?: string;
}

export interface TransferDto {
  transfer_pair_id: string;
  business_id: string;
  amount: number;
  currency: string;
  date: string;
  description: string | null;
  out_tx: Transaction;
  in_tx: Transaction;
  from_bank_account_id: string;
  from_bank_account_name: string;
  to_bank_account_id: string;
  to_bank_account_name: string;
  /** Bakiye yetersiz uyarısı (200 + warning). Null = OK. */
  low_balance_warning: string | null;
}

// ─────────── WP e4dc5271 (Beta v1.4): Hızlı İşlemler ───────────

/**
 * tx_template JSONB içeriği — backend Map<String, Object>'ten geliyor.
 * Tüm alanlar opsiyonel (execute zamanı override ile tamamlanabilir),
 * ama direction + payment_method (NORMAL için) backend tarafında zorunlu.
 */
export interface QuickActionTemplate {
  direction?: "income" | "expense";
  kind?: "NORMAL" | "TRANSFER";
  amount?: number;
  payment_method?: "POS" | "NAKIT" | "HESAPDAN";
  bank_account_id?: string | null;
  pos_device_id?: string | null;
  counterpart_id?: string | null;
  applied_pos_rate?: number | null;
  applied_our_commission_rate?: number | null;
  category?: string | null;
  category_id?: string | null;
  description?: string | null;
  // Transfer (kind=TRANSFER) için ek alanlar
  from_bank_account_id?: string | null;
  to_bank_account_id?: string | null;
  to_external_name?: string | null;
  // Beta v1.1 hotfix: alt kasa ataması (NORMAL kind için).
  manual_sub_cash_id?: string | null;
}

export interface QuickActionListItem {
  id: string;
  user_id: string;
  business_id: string;
  business_name: string | null;
  name: string;
  tx_template: QuickActionTemplate;
  icon: string | null;
  color: string | null;
  order_index: number;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExecuteQuickActionResponse {
  quick_action: QuickActionListItem;
  /** NORMAL kind sonucu */
  transaction?: Transaction;
  /** TRANSFER kind sonucu */
  transfer?: TransferDto;
}

// ---- Vergi Takvimi Modülü ----
// Backend: GET /tax-calendar?from=&to= → TaxDeadlineDto[]
export type TaxObligationType =
  | "KDV"
  | "MUHTASAR"
  | "BA_BS"
  | "GECICI_VERGI"
  | "KURUMLAR_VERGISI"
  | "GELIR_VERGISI";

export interface TaxDeadline {
  obligation_type: TaxObligationType;
  /** Kullanıcıya gösterilecek TR başlık. */
  label: string;
  /** TR açıklama (dönem dahil). */
  description: string;
  /** ISO tarih (yyyy-MM-dd). */
  due_date: string;
  /** Dönem etiketi (ör. "2026-03", "2026-Q1", "2025"). */
  period: string;
  /** Bugünden son tarihe kalan gün (negatif → geçmiş). */
  days_until: number;
}

// ---- Ledger v2 (Faz C): POS kâr-payı + gider/masraf + aylık kâr ----

export type ProfitShareRuleType =
  | "RATE_SPREAD" | "MARGIN_PCT" | "OWNER_COMMISSION" | "RESIDUAL";
export type PosDealStatus = "PENDING" | "PROVISIONAL" | "FINALIZED" | "REVERSED";

/** Bir POS deal'in hesaplanan kâr-payı bacağı. */
export interface PosDealShareLeg {
  rule_type: ProfitShareRuleType | string;
  operator_counterpart_id: string | null;
  operator_name: string | null;
  target_subcash_account_id: string | null;
  target_subcash_account_name: string | null;
  amount: number;
  provisional: boolean;
}

export interface PosDeal {
  id: string;
  deal_date: string;
  gross_amount: number;
  customer_rate: number;
  pos_device_id: string | null;
  pos_device_name: string | null;
  owner_company_name: string | null;
  bank_rate: number | null;
  referrer_counterpart_id: string | null;
  referrer_name: string | null;
  owner_account_id: string | null;
  owner_account_name: string | null;
  settlement_batch_id: string | null;
  avg_commission_rate: number | null;
  status: PosDealStatus | string;
  notes: string | null;
  shares: PosDealShareLeg[];
}

export interface PosSettlementBatch {
  id: string | null;
  settle_date: string;
  pos_device_id: string | null;
  pos_device_name: string | null;
  gross_total: number;
  deposited_amount: number | null;
  avg_commission_rate: number | null;
  finalized: boolean;
  deal_count: number;
  pending_deposit: boolean;
}

/** Operatör kâr-merkezi READ-ONLY statement (§3.11). */
export interface OperatorStatementLine {
  posting_id: string;
  journal_entry_id: string | null;
  date: string | null;
  source_type: string | null;
  description: string | null;
  amount: number;     // + = kâr, − = ödeme
  provisional: boolean;
}

export interface OperatorStatement {
  account_id: string;
  account_name: string;
  operator_counterpart_id: string | null;
  operator_name: string | null;
  total_earned: number;
  total_paid_out: number;
  balance: number;
  provisional_pending: number;
  lines?: OperatorStatementLine[] | null;
}

/** Aylık kâr raporu (kategori P&L + operatör kırılımı + gider≠masraf). */
export interface ProfitCategoryLine {
  category_id: string | null;
  category_name: string;
  amount: number;
}

export interface ProfitOperatorLine {
  account_id: string;
  account_name: string;
  operator_counterpart_id: string | null;
  operator_name: string | null;
  earned: number;
}

export interface MonthlyProfitReport {
  year: number;
  month: number;
  total_income: number;
  total_expense: number;   // gider
  total_cost: number;      // masraf
  net_profit: number;
  income_by_category: ProfitCategoryLine[];
  expense_by_category: ProfitCategoryLine[];
  cost_by_category: ProfitCategoryLine[];
  operator_profit: ProfitOperatorLine[];
  company_residual: number;
}

export interface ProfitShareRule {
  id: string;
  operator_counterpart_id: string | null;
  operator_name: string | null;
  target_subcash_account_id: string | null;
  target_subcash_account_name: string | null;
  pos_device_id: string | null;
  pos_device_name: string | null;
  rule_type: ProfitShareRuleType | string;
  override_pct: number | null;
  active: boolean;
  priority: number;
  notes: string | null;
}

export interface ProfitShareConfig {
  owner_base_pct: number;
  fatih_margin_pct: number;
  tuncay_spread_pct: number;
}

// ──────────────────────────────────────────────────────────────────
// e-Fatura modülü (Çatı v1.1, entegratör-pluggable)
// ──────────────────────────────────────────────────────────────────

export type InvoiceScenario = "TEMEL" | "TICARI";
export type InvoiceType =
  | "SATIS"
  | "IADE"
  | "TEVKIFAT"
  | "ISTISNA"
  | "OZELMATRAH";
export type InvoiceStatus =
  | "DRAFT"
  | "SIGNED"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "CANCELLED"
  | "ERROR";

export interface InvoiceLine {
  id?: string;
  line_number: number;
  item_name: string;
  description?: string | null;
  unit_code: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  discount_amount: number;
  line_extension_amount: number;
  vat_amount: number;
}

export interface Invoice {
  id: string;
  business_id: string | null;
  business_name: string | null;
  invoice_number: string;
  ettn: string;
  issue_date: string;
  issue_time?: string | null;
  scenario: InvoiceScenario;
  invoice_type: InvoiceType;
  status: InvoiceStatus;
  currency: string;
  // satıcı
  supplier_tax_id: string | null;
  supplier_title: string | null;
  supplier_tax_office: string | null;
  supplier_address: string | null;
  supplier_city: string | null;
  supplier_district: string | null;
  supplier_country: string | null;
  // alıcı
  customer_tax_id: string | null;
  customer_title: string | null;
  customer_tax_office: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_district: string | null;
  customer_country: string | null;
  // toplamlar
  line_extension_amount: number;
  tax_exclusive_amount: number;
  tax_inclusive_amount: number;
  total_tax_amount: number;
  allowance_total_amount: number;
  payable_amount: number;
  notes: string | null;
  // entegratör
  integrator_key: string | null;
  integrator_ref: string | null;
  integrator_status: string | null;
  integrator_error: string | null;
  has_xml: boolean;
  generated_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  lines?: InvoiceLine[];
}

export interface CreateInvoiceLineInput {
  item_name: string;
  description?: string | null;
  unit_code?: string;
  quantity: number;
  unit_price: number;
  vat_rate?: number;
  discount_amount?: number;
}

export interface CreateInvoiceInput {
  business_id: string;
  supplier_company_id?: string | null;
  customer_counterpart_id?: string | null;
  customer_tax_id?: string | null;
  customer_title?: string | null;
  customer_tax_office?: string | null;
  customer_address?: string | null;
  customer_city?: string | null;
  customer_district?: string | null;
  customer_country?: string | null;
  invoice_number?: string | null;
  issue_date?: string | null;
  scenario?: InvoiceScenario;
  invoice_type?: InvoiceType;
  currency?: string;
  notes?: string | null;
  lines: CreateInvoiceLineInput[];
}

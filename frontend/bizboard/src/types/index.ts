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

export interface Category {
  id: string;
  business_id: string;
  name: string;
  direction: TransactionDirection;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

/** v1.6.3+: ödeme yöntemi — POS veya NAKIT (default NAKIT). */
export type PaymentMethod = "POS" | "NAKIT";

export interface Transaction {
  id: string;
  business_id: string;
  category_id: string | null;
  direction: TransactionDirection;
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
  /** v1.6.21 (WP-4): tx oluşturulduğu anki POS oranı snapshot. */
  applied_pos_rate?: number | null;
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
  /** v1.6.23.8 (WP 3cdf2a4f): POS tx için derived komisyon. NAKIT/HESAPDAN'da null. */
  pos_commission?: number | null;
  /** v1.6.23.8 (WP 3cdf2a4f): POS tx için derived net (= amount − pos_commission). */
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
    today_commission: number;
    today_net: number;
    unsettled_count: number;
    tx_count: number;
  }>;
  bank_accounts: Array<{
    id: string;
    name: string;
    type: "CHECKING" | "SAVINGS" | "CASH" | "CASH_HOLDER";
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
}

export interface PosDeviceListItem {
  id: string;
  name: string;
  owner_counterpart_id: string | null;
  owner_counterpart_name: string | null;
  bank_name: string | null;
  default_rate: number | null;
  last_used_rate: number | null;
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
  created_at: string;
  updated_at: string;
}

export type CounterpartRole = "CUSTOMER" | "SUPPLIER" | "BOTH" | "OTHER";

/** v1.6.18+ (WP-1): varlık tipi — PERSON / FIRM. */
export type CounterpartKind = "PERSON" | "FIRM";

export interface Counterpart {
  id: string;
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

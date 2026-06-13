/**
 * Denetim Kaydı (Audit Log) — Türkçe lokalizasyon katmanı.
 *
 * <p>ÖNEMLİ: Stored audit kayıtları immutable'dır (geçmiş/tahrif-edilemez) ve
 * backend'de İngilizce üretilebilir ("Login successful for X", "USER_LOGIN_SUCCESS",
 * entity_type "USER" vb.). Bu modül kayıtları DEĞİŞTİRMEZ; yalnız <i>görüntüleme</i>
 * katmanında action-code / entity-type / detail-message → Türkçe etiket eşler.
 * Tanınmayan değerler olduğu gibi geri döner (yeni/zaten-Türkçe detail'lar bozulmaz).</p>
 */

// ── Aksiyon kodu (AuditAction) → Türkçe etiket ──────────────────────────────
// Anahtarlar backend'in canonical action sabitleriyle (AuditAction.java) BİREBİR.
const ACTION_LABELS: Record<string, string> = {
  // Auth / oturum
  USER_LOGIN_SUCCESS: "Kullanıcı girişi başarılı",
  USER_LOGIN_FAILED: "Giriş başarısız",
  USER_LOGOUT: "Çıkış yapıldı",
  PASSWORD_CHANGED: "Parola değiştirildi",
  REFRESH_TOKEN_THEFT_DETECTED: "Oturum token hırsızlığı tespit edildi",
  // Dosya
  FILE_UPLOAD: "Dosya yüklendi",
  FILE_DOWNLOAD: "Dosya indirildi",
  FILE_DELETE: "Dosya silindi",
  FILE_DOWNLOAD_DENIED: "Dosya indirme reddedildi",
  // Kullanıcı yönetimi
  USER_CREATE: "Kullanıcı oluşturuldu",
  USER_UPDATE: "Kullanıcı güncellendi",
  USER_DELETE: "Kullanıcı silindi",
  USER_ROLE_CHANGE: "Kullanıcı rolü değiştirildi",
  // İşletme
  BUSINESS_CREATE: "İşletme oluşturuldu",
  BUSINESS_UPDATE: "İşletme güncellendi",
  BUSINESS_DELETE: "İşletme silindi",
  BUSINESS_MODULE_ADD: "İşletmeye modül eklendi",
  BUSINESS_MODULE_REMOVE: "İşletmeden modül kaldırıldı",
  // İşlemler
  TRANSACTION_CREATE: "İşlem eklendi",
  TRANSACTION_UPDATE: "İşlem güncellendi",
  TRANSACTION_DELETE: "İşlem silindi",
  // Personel
  EMPLOYEE_CREATE: "Personel eklendi",
  EMPLOYEE_UPDATE: "Personel güncellendi",
  EMPLOYEE_DELETE: "Personel silindi",
  // Borç / alacak
  DEBT_CREATE: "Borç/alacak eklendi",
  DEBT_UPDATE: "Borç/alacak güncellendi",
  DEBT_DELETE: "Borç/alacak silindi",
  DEBT_SETTLED: "Borç/alacak kapatıldı",
  DEBT_MIGRATION: "Borç/alacak taşındı",
  DEBT_WRITEOFF: "Borç silindi (düşüm)",
  DEBT_WRITEOFF_REVERSE: "Borç düşümü geri alındı",
  LOAN_CREATE: "Verilen/alınan borç işlendi",
  // Ödeme
  PAYMENT_CREATE: "Ödeme alındı/yapıldı",
  PAYMENT_DELETE: "Ödeme silindi",
  // Bildirim
  NOTIFICATION_SENT: "Bildirim gönderildi",
  ADMIN_MANUAL_NOTIFICATION_SENT: "Admin manuel bildirim gönderdi",
  TELEGRAM_CHAT_PREF_CHANGED: "Telegram sohbet tercihi değişti",
  // MyCompany
  MY_COMPANY_CREATE: "Firma kaydı oluşturuldu",
  MY_COMPANY_UPDATE: "Firma kaydı güncellendi",
  MY_COMPANY_DELETE: "Firma kaydı silindi",
  // Cari
  COUNTERPART_CREATE: "Cari eklendi",
  COUNTERPART_UPDATE: "Cari güncellendi",
  COUNTERPART_DELETE: "Cari silindi",
  // Günlük kasa kapanışı (eski)
  CASH_CLOSING_CLOSED: "Günsonu kapatıldı",
  CASH_CLOSING_AUTO_CLOSED: "Günsonu otomatik kapatıldı",
  CASH_CLOSING_REOPENED: "Günsonu yeniden açıldı",
  CASH_CLOSING_BACKDATED: "Geçmiş tarihli günsonu",
  // POS
  POS_SETTLED: "POS tahsilatı işlendi",
  POS_UNSETTLED: "POS tahsilatı geri alındı",
  // Kategori
  CATEGORY_CREATE: "Kategori oluşturuldu",
  CATEGORY_UPDATE: "Kategori güncellendi",
  CATEGORY_DELETE: "Kategori silindi (pasif)",
  // Bakiye düzeltme
  BANK_BALANCE_ADJUST: "Bakiye düzeltildi (mutabakat)",
  // Arama
  SEARCH_QUERY: "Arama yapıldı",
  SEARCH_QUERY_REJECTED: "Arama reddedildi (şüpheli)",
  // Ledger v2 — posting
  LEDGER_POSTING_BACKFILL: "Defter kaydı backfill edildi",
  LEDGER_POSTING_REVERSE: "Defter kaydı geri alındı",
  // Ledger v2 — gün kapanışı
  DAY_CLOSE_CLOSED: "Gün kapatıldı",
  DAY_CLOSE_AUTO: "Gün otomatik kapatıldı",
  DAY_CLOSE_REOPENED: "Gün kapanışı yeniden açıldı",
  DAY_CLOSE_BACKDATED: "Geçmiş tarihli gün kapanışı",
  DAY_CLOSE_ALARM: "Kaçak alarmı (sapma eşiği aşıldı)",
  DAY_CLOSE_CHAIN_RECOMPUTE: "Devir zinciri yeniden hesaplandı",
  DAY_CLOSE_MIGRATED: "Gün kapanışı taşındı",
  DAY_CLOSE_EDIT_REQUESTED: "Kapanış düzenleme talebi",
  DAY_CLOSE_EDIT_APPROVED: "Kapanış düzenleme onaylandı",
  DAY_CLOSE_EDIT_REJECTED: "Kapanış düzenleme reddedildi",
  DAY_CLOSE_EDIT_APPLIED: "Kapanış düzenlemesi uygulandı",
  // Ledger v2 — gün açılışı
  DAY_OPEN_OPENED: "Gün açıldı",
  DAY_OPEN_BACKDATED: "Geçmiş tarihli gün açılışı",
  DAY_OPEN_ROUNDING_POSTED: "Devir yuvarlama kaydı oluşturuldu",
  DAY_OPEN_REVERTED: "Gün açılışı geri alındı",
  DAY_OPEN_CLOSED_SYNC: "Gün açılışı kapanış ile eşitlendi",
  DAY_OPEN_ENFORCE_TOGGLE: "Gün-açma zorunluluğu değiştirildi",
  DAY_OPEN_BLOCKED_ENTRY: "Açılmamış güne giriş engellendi",
  // Alarm / özet konfig
  FINANCIAL_ALERT_THRESHOLD_UPDATE: "Finansal alarm eşiği güncellendi",
  PERIODIC_SUMMARY_CONFIG_UPDATE: "Dönemsel özet ayarı güncellendi",
  DAY_CLOSING_NOTIFY_CONFIG_UPDATE: "Gün kapanışı bildirim ayarı güncellendi",
  DAY_CLOSING_NOTIFY_DISPATCHED: "Gün kapanışı özeti gönderildi",
  BUDGET_THRESHOLD_UPDATE: "Bütçe eşiği güncellendi",
  // Banka import
  BANK_IMPORT_BATCH_CREATE: "Banka içe aktarma başlatıldı",
  BANK_IMPORT_LINE_POSTED: "Banka satırı işlendi",
  // POS kâr-payı / Ledger faz C
  POS_DEAL_CREATE: "POS işlemi girildi",
  POS_DEAL_REVERSE: "POS işlemi geri alındı",
  POS_SETTLEMENT_FINALIZE: "POS settlement kesinleşti",
  PROFIT_SHARE_POSTED: "Kâr-payı kaydı oluşturuldu",
  PROFIT_SHARE_RULE_UPSERT: "Kâr-payı kuralı kaydedildi",
  PROFIT_SHARE_RULE_DELETE: "Kâr-payı kuralı silindi",
  PROFIT_SHARE_CONFIG_UPDATE: "Kâr-payı ayarı güncellendi",
  // Çek/senet (Instrument)
  INSTRUMENT_CREATE: "Çek/senet eklendi",
  INSTRUMENT_CONFIRM: "Çek/senet onaylandı",
  INSTRUMENT_CASH: "Çek/senet tahsil edildi",
  INSTRUMENT_UNCASH: "Çek/senet tahsili geri alındı",
  INSTRUMENT_BOUNCE: "Çek/senet karşılıksız",
  INSTRUMENT_ENDORSE: "Çek/senet ciro edildi",
  // Para izi
  FUND_LINK_CREATE: "Fon bağı oluşturuldu",
  FUND_LINK_DELETE: "Fon bağı kaldırıldı",
  // Ayni varlık
  ASSET_ACQUIRE: "Ayni varlık edinildi",
  ASSET_SELL: "Ayni varlık satıldı",
  // Rapor
  REPORT_EXPORTED: "Rapor dışa aktarıldı",
  // Onay
  APPROVAL_REQUESTED: "Onay talebi oluşturuldu",
  APPROVAL_APPROVED: "Onay talebi onaylandı",
  APPROVAL_REJECTED: "Onay talebi reddedildi",
  APPROVAL_CANCELLED: "Onay talebi iptal edildi",
  APPROVAL_VERIFIED: "Onay talebi doğrulandı",
  // OCR
  OCR_SCAN: "Belge tarandı (OCR)",
  OCR_CONFIRM: "OCR taraması onaylandı",
  OCR_DISCARD: "OCR taraması iptal edildi",
  // AI
  AI_REINDEX: "AI verisi yeniden indekslendi",
  AI_RAG_QUERY: "AI sorgusu çalıştırıldı",
  AI_ANOMALY_DETECTED: "AI anomali tespit etti",
  AI_ANOMALY_CONFIG_UPDATE: "AI anomali ayarı güncellendi",
  // e-Fatura
  INVOICE_CREATE: "e-Fatura taslağı oluşturuldu",
  INVOICE_UPDATE: "e-Fatura güncellendi",
  INVOICE_DELETE: "e-Fatura silindi",
  INVOICE_XML_GENERATED: "e-Fatura XML üretildi",
  INVOICE_SENT: "e-Fatura gönderildi",
  INVOICE_STATUS_QUERIED: "e-Fatura durumu sorgulandı",
  INVOICE_CANCELLED: "e-Fatura iptal edildi",
  // Audit modülü
  AUDIT_CHAIN_BACKFILL: "Denetim zinciri backfill edildi",
  AUDIT_ANONYMIZED: "Denetim kayıtları anonimleştirildi (KVKK)",
};

/** Aksiyon kodu → Türkçe. Bilinmeyen dotted/SNAKE_CASE → Title-Case fallback. */
export function actionLabel(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) return known;
  const t = action.replace(/[._]/g, " ").toLowerCase().trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ── entity_type (kayıt tipi) → Türkçe etiket ────────────────────────────────
const ENTITY_TYPE_LABELS: Record<string, string> = {
  USER: "Kullanıcı",
  BUSINESS: "İşletme",
  TRANSACTION: "İşlem",
  DEBT: "Borç/Alacak",
  PAYMENT: "Ödeme",
  COUNTERPART: "Cari",
  BANK_ACCOUNT: "Hesap/Kasa",
  EMPLOYEE: "Personel",
  MY_COMPANY: "Firma",
  CATEGORY: "Kategori",
  AUDIT: "Denetim",
  INSTRUMENT: "Çek/Senet",
  ASSET: "Ayni Varlık",
  POS: "POS",
  PROFIT_SHARE: "Kâr-payı",
  DAY_CLOSE: "Gün Kapanışı",
  DAY_OPEN: "Gün Açılışı",
  CASH_CLOSING: "Günsonu",
  APPROVAL: "Onay",
  OCR: "OCR",
  INVOICE: "e-Fatura",
  NOTIFICATION: "Bildirim",
  REPORT: "Rapor",
  LEDGER: "Defter",
  SEARCH: "Arama",
  FUND_LINK: "Fon Bağı",
  LOAN: "Borç (Verilen/Alınan)",
};

/** entity_type → Türkçe. Bilinmeyen olduğu gibi döner. */
export function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

// ── Login hata sebebi (Spring Security exception adı vb.) → Türkçe ───────────
const LOGIN_REASON_LABELS: Record<string, string> = {
  BadCredentialsException: "Hatalı kullanıcı adı veya parola",
  "Bad credentials": "Hatalı kullanıcı adı veya parola",
  DisabledException: "Kullanıcı devre dışı",
  "User is disabled": "Kullanıcı devre dışı",
  LockedException: "Hesap kilitli",
  "User account is locked": "Hesap kilitli",
  AccountExpiredException: "Hesap süresi dolmuş",
  CredentialsExpiredException: "Parola süresi dolmuş",
  RateLimited: "Çok fazla deneme (hız sınırı)",
};

function localizeLoginReason(reason: string): string {
  const trimmed = reason.trim();
  return LOGIN_REASON_LABELS[trimmed] ?? trimmed;
}

/**
 * Backend'in ÜRETTİĞİ (immutable, geçmiş) İngilizce detail metinleri → Türkçe.
 * Stored audit kaydı DEĞİŞTİRİLMEZ; yalnız görüntüleme katmanında eşlenir.
 * Tanınmayan metin OLDUĞU GİBİ döner.
 */
export function localizeDetail(detail: string): string {
  // "Login successful for <username>"
  let m = detail.match(/^Login successful for (.+)$/);
  if (m) return `${m[1]} için giriş başarılı`;

  // "Login failed for username '<username>': <reason>"
  m = detail.match(/^Login failed for username '(.*)':\s*(.*)$/);
  if (m) return `'${m[1]}' için giriş başarısız: ${localizeLoginReason(m[2])}`;

  // "Login blocked by rate limit for '<username>' (retry after <n>s)"
  m = detail.match(/^Login blocked by rate limit for '(.*)' \(retry after (\d+)s\)$/);
  if (m) return `'${m[1]}' için giriş hız sınırı nedeniyle engellendi (${m[2]} sn sonra deneyin)`;

  return detail;
}

// ── highlight_type → Türkçe rozet etiketi + Daxa renk sınıfları ─────────────
export const HIGHLIGHT_BADGES: Record<string, { label: string; cls: string }> = {
  BACKDATED: { label: "Geçmiş tarihli", cls: "bg-status-warning/15 text-status-warning border-status-warning/30" },
  BACKDATED_CLOSING: { label: "Geçmiş tarihli kapanış", cls: "bg-status-warning/15 text-status-warning border-status-warning/30" },
  CORRECTION: { label: "Düzeltme", cls: "bg-status-info/15 text-status-info border-status-info/30" },
  CLOSING_REOPEN: { label: "Yeniden açma", cls: "bg-status-info/15 text-status-info border-status-info/30" },
  DAY_CLOSE_REOPEN: { label: "Yeniden açma", cls: "bg-status-info/15 text-status-info border-status-info/30" },
  DAY_CLOSE_BACKDATED: { label: "Geçmiş tarihli kapanış", cls: "bg-status-warning/15 text-status-warning border-status-warning/30" },
  DAY_CLOSE_ALARM: { label: "Kaçak alarmı", cls: "bg-status-danger/15 text-status-danger border-status-danger/30" },
  DAY_CLOSE_EDIT: { label: "Kapanış düzenleme", cls: "bg-status-info/15 text-status-info border-status-info/30" },
  DAY_OPEN: { label: "Gün açılışı", cls: "bg-accent/15 text-accent-strong dark:text-accent border-accent/30" },
  DAY_OPEN_ROUNDING: { label: "Devir yuvarlama", cls: "bg-status-info/15 text-status-info border-status-info/30" },
  DAY_OPEN_BACKDATED: { label: "Geçmiş tarihli açılış", cls: "bg-status-warning/15 text-status-warning border-status-warning/30" },
  POS_RATE_OVERRIDE: { label: "POS oran override", cls: "bg-status-danger/15 text-status-danger border-status-danger/30" },
  POS_SETTLED: { label: "POS tahsilat", cls: "bg-accent/15 text-accent-strong dark:text-accent border-accent/30" },
  POS_UNSETTLED: { label: "POS geri alma", cls: "bg-status-warning/15 text-status-warning border-status-warning/30" },
  POS_DEAL: { label: "POS işlemi", cls: "bg-accent/15 text-accent-strong dark:text-accent border-accent/30" },
  PROFIT_SHARE: { label: "Kâr-payı", cls: "bg-accent/15 text-accent-strong dark:text-accent border-accent/30" },
  BALANCE_ADJUST: { label: "Bakiye düzeltme", cls: "bg-status-warning/15 text-status-warning border-status-warning/30" },
  APPROVAL: { label: "Onay akışı", cls: "bg-status-info/15 text-status-info border-status-info/30" },
  INSTRUMENT_BOUNCE: { label: "Karşılıksız çek/senet", cls: "bg-status-danger/15 text-status-danger border-status-danger/30" },
};

// ── Tarih / göreli zaman yardımcıları (tr) ──────────────────────────────────
export function formatDt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

const RTF = new Intl.RelativeTimeFormat("tr", { numeric: "auto" });

export function relativeTime(iso: string): string {
  try {
    const diffMs = new Date(iso).getTime() - Date.now();
    const sec = Math.round(diffMs / 1000);
    const abs = Math.abs(sec);
    if (abs < 60) return RTF.format(Math.round(sec), "second");
    if (abs < 3600) return RTF.format(Math.round(sec / 60), "minute");
    if (abs < 86400) return RTF.format(Math.round(sec / 3600), "hour");
    if (abs < 2592000) return RTF.format(Math.round(sec / 86400), "day");
    if (abs < 31536000) return RTF.format(Math.round(sec / 2592000), "month");
    return RTF.format(Math.round(sec / 31536000), "year");
  } catch {
    return "";
  }
}

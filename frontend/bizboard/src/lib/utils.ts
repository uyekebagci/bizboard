import { clsx, type ClassValue } from "clsx";
import type { BusinessCard } from "@/types";

// Classname merging utility
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * v1.6.23.28 (UI Fix WP TODO 24310479): Türkçe-uyumlu arama normalizasyonu.
 *
 * <p>Lower-case TR locale (İ → i, I → ı) + Türkçe karakterler ASCII'ye
 * fold edilir (ı/ç/ğ/ö/ş/ü → i/c/g/o/s/u). Hem haystack'i hem query'yi
 * bu fonksiyondan geçirip substring eşleştir.</p>
 *
 * <p>Örnek: trNormalize("İstanbul Çiçek") → "istanbul cicek".</p>
 */
export function trNormalize(s: string | null | undefined): string {
  if (s == null) return "";
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");
}

// Format currency
export function formatCurrency(
  amount: number,
  currency: string = "TRY",
  locale: string = "tr-TR"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format compact number (e.g., 1.2M, 450K)
export function formatCompact(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `${(amount / 1_000).toFixed(1)}K`;
  }
  return amount.toFixed(0);
}

// Determine business health status
export function getBusinessStatus(
  card: Pick<BusinessCard, "netProfit" | "trend">
): "healthy" | "warning" | "critical" {
  if (card.netProfit < 0) return "critical";
  if (card.trend < -10) return "warning";
  return "healthy";
}

// Status to color mapping
export function statusColor(status: "healthy" | "warning" | "critical") {
  const map = {
    healthy: { bg: "bg-green-500/15", text: "text-green-300", dot: "bg-green-500" },
    warning: { bg: "bg-amber-500/15", text: "text-amber-300", dot: "bg-amber-500" },
    critical: { bg: "bg-red-500/15", text: "text-red-300", dot: "bg-red-500" },
  };
  return map[status];
}

/**
 * Mutlak tarih + parantezde göreli ifade üretir.
 * Örn: "05.06.2026 (4 gün önce)", "09.06.2026 (bugün)".
 *
 * <p>Göreli kısım takvim günü farkına göre hesaplanır (saat dilimi/saat
 * etkisi olmadan): aynı gün → "bugün", 1 gün → "dün", <7 → "X gün önce",
 * <30 → "X hafta önce", <365 → "X ay önce", sonrası → "X yıl önce".
 * Gelecek tarihler için simetrik "sonra" eki kullanılır.</p>
 */
export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  const absolute = date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return `${absolute} (${formatRelativeLabel(date)})`;
}

/**
 * Yalnız göreli ifadeyi (parantezsiz, mutlak tarih olmadan) döndürür —
 * Türkçe diacritic'leri doğru. Mutlak+göreli format için
 * {@link formatRelativeDate} kullan.
 */
export function formatRelativeLabel(input: string | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";

  // Takvim günü farkı — saat bileşenini sıfırlayarak hesapla.
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / (1000 * 60 * 60 * 24),
  );

  const suffix = diffDays >= 0 ? "önce" : "sonra";
  const n = Math.abs(diffDays);

  if (diffDays === 0) return "bugün";
  if (diffDays === 1) return "dün";
  if (diffDays === -1) return "yarın";
  if (n < 7) return `${n} gün ${suffix}`;
  if (n < 30) return `${Math.floor(n / 7)} hafta ${suffix}`;
  if (n < 365) return `${Math.floor(n / 30)} ay ${suffix}`;
  return `${Math.floor(n / 365)} yıl ${suffix}`;
}

// Generate initials from name
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Format a number string with dots for thousands (Turkish format)
// Input: raw digits string, Output: dot-separated display string
export function formatMoneyInput(raw: string): string {
  // Allow digits and one comma for decimals
  const cleaned = raw.replace(/[^\d,]/g, "");
  const [intPart, decPart] = cleaned.split(",");
  const digits = intPart.replace(/^0+(?=\d)/, "") || "";
  if (!digits && !decPart && decPart !== "") return "";
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (decPart !== undefined) return `${formatted || "0"},${decPart}`;
  return formatted;
}

// Parse a dot-formatted money string back to number
export function parseMoneyInput(display: string): number {
  if (!display) return 0;
  const cleaned = display.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

// Percentage change between two values
export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

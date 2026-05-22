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
    healthy: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
    warning: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
    critical: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  };
  return map[status];
}

// Format relative date
export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Bugun";
  if (diffDays === 1) return "Dun";
  if (diffDays < 7) return `${diffDays} gun once`;
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
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

/**
 * v1.6.7: kullanıcı UI tercihleri (localStorage).
 *
 * Şu an sadece varsayılan periyot tercihi saklanır. SSR uyumlu — sunucu tarafında
 * window yoksa system default'a düşer.
 */

export type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

/** Tüm periyot türleri — UI selector'larda iterate edilir. */
export const PERIODS: Period[] = ["daily", "weekly", "monthly", "quarterly", "yearly"];

/** v1.6.7+ sistem varsayılanı (backend ile uyumlu): bugün. */
export const SYSTEM_DEFAULT_PERIOD: Period = "daily";

const STORAGE_KEY = "bizboard.preferences.defaultPeriod";

function isValidPeriod(value: unknown): value is Period {
  return typeof value === "string" && (PERIODS as string[]).includes(value);
}

/**
 * Kullanıcının tercih ettiği varsayılan periyodu döner.
 * localStorage erişilemezse SYSTEM_DEFAULT_PERIOD dönülür.
 */
export function getDefaultPeriod(): Period {
  if (typeof window === "undefined") return SYSTEM_DEFAULT_PERIOD;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isValidPeriod(raw)) return raw;
  } catch {
    // localStorage erişimi engellenmişse (private mode, vs.) sessiz fallback
  }
  return SYSTEM_DEFAULT_PERIOD;
}

/**
 * Periyot tercihini kaydeder. null/undefined verilirse kayıt silinir
 * (sistem varsayılanına geri dönmek için).
 */
export function setDefaultPeriod(value: Period | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value == null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else if (isValidPeriod(value)) {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    // silent
  }
}

/** Periyot için Türkçe etiket. */
export function periodLabel(period: Period): string {
  switch (period) {
    case "daily": return "Bugun";
    case "weekly": return "Bu hafta";
    case "monthly": return "Bu ay";
    case "quarterly": return "Bu ceyrek";
    case "yearly": return "Bu yil";
  }
}

/** Periyot için kısa etiket (selector chip'leri için). */
export function periodShortLabel(period: Period): string {
  switch (period) {
    case "daily": return "Gun";
    case "weekly": return "Hafta";
    case "monthly": return "Ay";
    case "quarterly": return "Ceyrek";
    case "yearly": return "Yil";
  }
}

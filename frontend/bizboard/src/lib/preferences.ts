/**
 * v1.6.7: kullanıcı UI tercihleri (localStorage).
 *
 * Şu an sadece varsayılan periyot tercihi saklanır. SSR uyumlu — sunucu tarafında
 * window yoksa system default'a düşer.
 */

export type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

/** Tüm periyot türleri — UI selector'larda iterate edilir. */
export const PERIODS: Period[] = ["daily", "weekly", "monthly", "quarterly", "yearly"];

/**
 * Sistem varsayılanı: "Bu ay".
 *
 * <p>UI v2: "Bugün" çoğu zaman hareketsiz olduğu için panel ölü (₺0) görünüyordu.
 * "Bu ay" varsayılanı dolu/canlı bir ilk izlenim verir. Kullanıcının kaydettiği
 * tercih (localStorage) her zaman bunun önüne geçer.</p>
 */
export const SYSTEM_DEFAULT_PERIOD: Period = "monthly";

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
    case "daily": return "Bugün";
    case "weekly": return "Bu hafta";
    case "monthly": return "Bu ay";
    case "quarterly": return "Bu çeyrek";
    case "yearly": return "Bu yıl";
  }
}

/** Periyot için kısa etiket (selector chip'leri için). */
export function periodShortLabel(period: Period): string {
  switch (period) {
    case "daily": return "Gün";
    case "weekly": return "Hafta";
    case "monthly": return "Ay";
    case "quarterly": return "Çeyrek";
    case "yearly": return "Yıl";
  }
}

/**
 * Kategori (gelir/gider) için curated ikon (emoji) + renk paletleri.
 *
 * <p>Kategori `icon` alanı bir emoji string'i, `color` alanı bir hex renk
 * kodudur. Hem inline hızlı-oluştur modalı (AddTransactionForm /
 * TransactionList) hem de tam yönetim sayfası (dashboard/categories) bu
 * presetleri paylaşır — tek kaynak, görsel tutarlılık.</p>
 */

/** Kategori ikonları için curated emoji seti (gelir + gider karışık). */
export const CATEGORY_ICONS: readonly string[] = [
  "💰", "💵", "🏦", "💳", "🧾", "📈", "📉", "🛒",
  "🍽️", "☕", "⛽", "🚗", "🚚", "🏠", "🔧", "🧰",
  "📦", "📱", "💡", "🌐", "🖥️", "🎯", "🎁", "📊",
  "👷", "🧑‍💼", "📑", "🏷️", "⚙️", "🪙", "💼", "🗂️",
];

/** Kategori rengi için curated hex paleti (dual-theme uyumlu, doygun tonlar). */
export const CATEGORY_COLORS: readonly string[] = [
  "#4263eb", // brand blue
  "#4c6ef5",
  "#6741d9", // violet
  "#ae3ec9", // grape
  "#e64980", // pink
  "#e03131", // red
  "#f76707", // orange
  "#f59f00", // yellow
  "#2f9e44", // green
  "#0ca678", // teal
  "#1098ad", // cyan
  "#868e96", // gray
];

export const DEFAULT_CATEGORY_ICON = CATEGORY_ICONS[0];
export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLORS[0];

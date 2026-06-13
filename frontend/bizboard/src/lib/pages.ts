/**
 * Kullanıcı-bazlı sidebar SAYFA erişimi — kanonik sayfa-anahtarı (page key) kayıt
 * defteri. Backend {@code SidebarPage} enum'unun FE aynası; anahtarlar bire bir
 * eşleşmelidir (SÖZLEŞME).
 *
 * Her sidebar route'u (adminOnly olanlar HARIÇ) bir `pageKey`'e bağlanır. Bu
 * dosya iki yeri besler:
 *   1. Sidebar — kullanıcının `allowed_pages` listesine göre item'ları filtreler.
 *   2. Admin UI — kullanıcı başına sayfa-erişim checkbox listesini üretir.
 *
 * NAVIGASYON/GÖRÜNÜRLÜK seviyesidir; sayfa endpoint RBAC'ı AYRI ve dokunulmamıştır.
 */

/** "Tüm sayfalar" sentinel'i (default-permissive; admin her zaman böyle). */
export const ALL_PAGES = "all" as const;

/** Sidebar bölüm anahtarları (gruplama için). */
export type PageGroup = "genel" | "cari" | "kasa" | "operasyon";

export interface PageMeta {
  /** Backend SidebarPage enum'uyla eşleşen kanonik anahtar. */
  key: string;
  /** Sidebar route (href) — guard/sidebar lookup'ı için. */
  href: string;
  /** TR etiket (admin UI checkbox + sidebar ile tutarlı). */
  label: string;
  /** Sidebar bölümü. */
  group: PageGroup;
}

/** Bölüm sırası + başlıkları (admin UI'da gruplama için). */
export const PAGE_GROUPS: { key: PageGroup; label: string }[] = [
  { key: "genel", label: "Genel" },
  { key: "cari", label: "Cari & Borçlar" },
  { key: "kasa", label: "Kasa & Banka" },
  { key: "operasyon", label: "Operasyon" },
];

/**
 * Kanonik sayfa kataloğu — kullanıcı-bazlı erişim kontrolüne tabi (admin-dışı)
 * tüm sidebar sayfaları. `adminOnly` sidebar item'ları BURADA YOK (rol filtresiyle
 * korunur).
 */
export const PAGE_CATALOG: PageMeta[] = [
  // ── Genel ──
  { key: "dashboard", href: "/dashboard", label: "Ana Sayfa", group: "genel" },
  { key: "firmalarim", href: "/dashboard/firmalarim", label: "Firmalarım", group: "genel" },
  { key: "add-transaction", href: "/dashboard/add-transaction", label: "İşlem Ekle", group: "genel" },
  { key: "transactions", href: "/dashboard/transactions", label: "İşlemler", group: "genel" },
  { key: "categories", href: "/dashboard/categories", label: "Kategoriler", group: "genel" },
  { key: "finance", href: "/dashboard/finance", label: "Finans", group: "genel" },
  { key: "reports", href: "/dashboard/reports", label: "Raporlar", group: "genel" },
  { key: "ai", href: "/dashboard/ai", label: "AI Asistan", group: "genel" },
  { key: "e-fatura", href: "/dashboard/e-fatura", label: "e-Fatura", group: "genel" },
  { key: "forecast", href: "/dashboard/reports/forecast", label: "Nakit Tahmin", group: "genel" },
  { key: "budget", href: "/dashboard/reports/butce", label: "Bütçe", group: "genel" },
  { key: "notifications", href: "/dashboard/bildirimler", label: "Bildirimler", group: "genel" },
  { key: "reminders", href: "/dashboard/hatirlaticilar", label: "Hatırlatıcılar", group: "genel" },
  // ── Cari & Borçlar ──
  { key: "counterparts", href: "/dashboard/counterparts", label: "Cari Hesap", group: "cari" },
  { key: "receivables", href: "/dashboard/alacaklar", label: "Alacaklar", group: "cari" },
  { key: "payables", href: "/dashboard/verecekler", label: "Verecekler", group: "cari" },
  { key: "loans", href: "/dashboard/krediler", label: "Krediler", group: "cari" },
  { key: "instruments", href: "/dashboard/cek-senet", label: "Çek/Senet", group: "cari" },
  // ── Kasa & Banka ──
  { key: "bank-accounts", href: "/dashboard/hesaplar", label: "Banka Hesapları", group: "kasa" },
  { key: "cash", href: "/dashboard/nakit", label: "Nakit", group: "kasa" },
  { key: "pos", href: "/dashboard/pos-cihazlari", label: "POS", group: "kasa" },
  { key: "pos-profit", href: "/dashboard/pos-kar", label: "POS Kâr", group: "kasa" },
  { key: "operator-cash", href: "/dashboard/operator-kasalari", label: "Operatör Kasaları", group: "kasa" },
  { key: "monthly-profit", href: "/dashboard/aylik-kar", label: "Aylık Kâr", group: "kasa" },
  { key: "closures", href: "/dashboard/kapanislar", label: "Kapanışlar", group: "kasa" },
  { key: "day-close", href: "/dashboard/gun-kapanisi", label: "Gün Kapanışı", group: "kasa" },
  { key: "bank-import", href: "/dashboard/banka-import", label: "Banka İçe Aktar", group: "kasa" },
  // ── Operasyon ──
  { key: "inventory", href: "/dashboard/inventory", label: "Envanter", group: "operasyon" },
  { key: "assets", href: "/dashboard/ayni-varlik", label: "Ayni Varlık", group: "operasyon" },
  { key: "ocr", href: "/dashboard/belge-tarama", label: "Belge Tarama (OCR)", group: "operasyon" },
  { key: "documents", href: "/dashboard/documents", label: "Belgeler", group: "operasyon" },
  { key: "people", href: "/dashboard/kisiler", label: "Kişiler", group: "operasyon" },
  { key: "phones", href: "/dashboard/telefonlar", label: "Telefonlar", group: "operasyon" },
  { key: "tax-calendar", href: "/dashboard/vergi-takvimi", label: "Vergi Takvimi", group: "operasyon" },
];

/** Tüm geçerli sayfa anahtarları (Set). */
export const ALL_PAGE_KEYS: Set<string> = new Set(PAGE_CATALOG.map((p) => p.key));

/** href → pageKey hızlı arama (guard + sidebar lookup). */
const HREF_TO_KEY: Map<string, string> = new Map(
  PAGE_CATALOG.map((p) => [p.href, p.key]),
);

/**
 * Verilen sayfa-anahtar listesi "tüm sayfalar" mı? null/boş/içinde "all" → true
 * (default-permissive). Admin tarafı backend'de zaten ["all"] döner.
 */
export function isAllPages(allowed: string[] | null | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(ALL_PAGES);
}

/**
 * Kullanıcı bu sayfa anahtarına erişebiliyor mu? "all" → her zaman true.
 * Katalog dışı (admin-only / dinamik) route'lar için `allowed` listesinde
 * anahtar bulunmaz; çağıran tarafın bunu ayrıca ele alması gerekir (bkz.
 * `canAccessHref`).
 */
export function canAccessPageKey(
  key: string,
  allowed: string[] | null | undefined,
): boolean {
  if (isAllPages(allowed)) return true;
  return allowed!.includes(key);
}

/**
 * Bir route (href / pathname) kullanıcı için erişilebilir mi? KATALOG DIŞINDAKI
 * (admin paneli, dinamik /business/[id], profil vb.) route'lar HER ZAMAN
 * erişilebilir sayılır — bu feature yalnız katalogdaki sayfaları kısıtlar; route
 * RBAC'ı + admin rol filtresi ayrıca çalışır.
 *
 * En uzun-prefix eşleşmesi: alt-route'lar (örn. /dashboard/transactions/123)
 * ana sayfa anahtarına bağlanır. "/dashboard" tam-eşleşme ile ele alınır (her
 * şeyi yakalamasın diye).
 */
export function canAccessHref(
  pathname: string,
  allowed: string[] | null | undefined,
): boolean {
  if (isAllPages(allowed)) return true;
  const key = resolvePageKey(pathname);
  if (key == null) return true; // katalog dışı → kısıtlanmaz
  return allowed!.includes(key);
}

/**
 * Bir pathname'i katalog sayfa anahtarına çözer. Tam eşleşme önceliklidir; yoksa
 * en uzun href-prefix eşleşmesi (alt-route'lar). Eşleşme yoksa null (katalog dışı).
 */
export function resolvePageKey(pathname: string): string | null {
  if (!pathname) return null;
  // Tam eşleşme.
  const exact = HREF_TO_KEY.get(pathname);
  if (exact) return exact;
  // En uzun prefix eşleşmesi ("/dashboard" hariç — o yalnız tam eşleşir).
  let bestKey: string | null = null;
  let bestLen = -1;
  for (const meta of PAGE_CATALOG) {
    if (meta.href === "/dashboard") continue; // root: yalnız tam eşleşme
    if (
      (pathname === meta.href || pathname.startsWith(meta.href + "/")) &&
      meta.href.length > bestLen
    ) {
      bestKey = meta.key;
      bestLen = meta.href.length;
    }
  }
  return bestKey;
}

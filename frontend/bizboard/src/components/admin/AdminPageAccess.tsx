"use client";

/**
 * Admin Paneli — kullanıcı-bazlı sidebar SAYFA erişim seçici (business-access
 * deseninin SAYFA muadili). Daxa stili; çift tema (tema-duyarlı surface/accent
 * token'ları). İşletme seçim listesiyle aynı görsel dil.
 *
 * Davranış (default-permissive):
 *  - "Tüm sayfalar" toggle açıkken kullanıcı tüm sayfaları görür (hiç kısıt yok);
 *    checkbox listesi gizlenir. Bu, backend'in null/"all" sözleşmesine karşılık gelir.
 *  - Toggle kapatıldığında bölüm-gruplu checkbox listesi açılır; en az bir sayfa
 *    seçilmelidir (boş seçim → backend yine "all"a düşer, kullanıcı kilitlenmez).
 *
 * NAVIGASYON seviyesidir; sayfa endpoint RBAC'ı AYRI.
 */

import { Check, LayoutGrid } from "lucide-react";
import { PAGE_CATALOG, PAGE_GROUPS, ALL_PAGES } from "@/lib/pages";

interface Props {
  /** Şu an "tüm sayfalar" modunda mı? (toggle state) */
  allPages: boolean;
  onAllPagesChange: (all: boolean) => void;
  /** Seçili sayfa anahtarları (allPages=false iken anlamlı). */
  selectedKeys: string[];
  onToggleKey: (key: string) => void;
}

export function AdminPageAccess({
  allPages,
  onAllPagesChange,
  selectedKeys,
  onToggleKey,
}: Props) {
  return (
    <div>
      <label className="block text-sm font-medium text-surface-300 mb-1.5">
        Görebileceği Sayfalar
      </label>
      <p className="text-xs text-surface-400 mb-3">
        Kullanıcının sidebar&apos;da göreceği sayfaları sınırlayın. Varsayılan: tüm
        sayfalar.
      </p>

      {/* "Tüm sayfalar" toggle satırı. */}
      <div className="flex items-center justify-between p-4 bg-surface-900 border border-surface-600 rounded-xl mb-3">
        <div className="flex items-center gap-2.5">
          <LayoutGrid size={16} className="text-accent-strong dark:text-accent" />
          <span className="text-sm text-surface-300">Tüm sayfalara erişim</span>
        </div>
        <button
          type="button"
          onClick={() => onAllPagesChange(!allPages)}
          role="switch"
          aria-checked={allPages}
          aria-label="Tüm sayfalara erişim"
          className={`relative w-12 h-6 rounded-full transition-colors ${
            allPages ? "bg-accent" : "bg-surface-600"
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
              allPages ? "left-[26px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {/* Sayfa checkbox listesi (yalnız "tüm sayfalar" kapalıyken). */}
      {!allPages && (
        <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
          {PAGE_GROUPS.map((grp) => {
            const items = PAGE_CATALOG.filter((p) => p.group === grp.key);
            if (items.length === 0) return null;
            return (
              <div key={grp.key}>
                <p className="px-1 mb-1.5 v2-eyebrow">{grp.label}</p>
                <div className="space-y-2">
                  {items.map((page) => {
                    const checked = selectedKeys.includes(page.key);
                    return (
                      <button
                        key={page.key}
                        type="button"
                        onClick={() => onToggleKey(page.key)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm border transition-colors ${
                          checked
                            ? "bg-accent/12 border-accent/45 text-[rgb(var(--v2-ink))]"
                            : "bg-surface-900 border-surface-600 text-surface-400 hover:border-surface-600"
                        }`}
                        role="checkbox"
                        aria-checked={checked}
                      >
                        <span>{page.label}</span>
                        {checked && (
                          <Check
                            size={16}
                            className="text-accent-strong dark:text-accent"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * `allowed_pages` API değerini ({@code ["all"]} veya açık anahtar listesi) admin
 * modal başlangıç state'ine çevirir.
 */
export function deriveInitialPageAccess(allowed: string[] | undefined | null): {
  allPages: boolean;
  selectedKeys: string[];
} {
  if (!allowed || allowed.length === 0 || allowed.includes(ALL_PAGES)) {
    return { allPages: true, selectedKeys: [] };
  }
  return { allPages: false, selectedKeys: [...allowed] };
}

/**
 * Modal state'ini API'ye gönderilecek {@code allowed_pages} listesine çevirir.
 * "Tüm sayfalar" modu → {@code undefined} (backend default-permissive "all"a düşer,
 * gereksiz CSV tutulmaz). Seçim modu boşsa da {@code undefined} (kullanıcı
 * kilitlenmez — backend "all"a düşürür).
 */
export function buildAllowedPagesPayload(
  allPages: boolean,
  selectedKeys: string[],
): string[] | undefined {
  if (allPages) return undefined;
  if (selectedKeys.length === 0) return undefined;
  return selectedKeys;
}

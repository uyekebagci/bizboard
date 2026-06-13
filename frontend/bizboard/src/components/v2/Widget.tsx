"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * UI v2 — Daxa **Widget primitive** (TEK KAYNAK / single source of truth).
 *
 * <p>Tüm pano widget'larının ortak kabuğu. Bir widget kendi kart-CSS'ini
 * (arka plan, radius, border, gölge, padding) <b>HARDCODE ETMEZ</b> — hepsi
 * bu primitive (ve onun bağlı olduğu global `.v2-widget*` sınıfları +
 * v2 token'ları) üzerinden gelir. Bir gün yüzey/başlık/gölge değişsin
 * istenirse YALNIZ `globals.css`'teki `.v2-widget*` (ve token) değişir →
 * tüm widget'lar otomatik takip eder. Sayfa-sayfa restyle YOK.</p>
 *
 * <h4>Tutarlı (override edilemez) kabuk</h4>
 * Arka plan/yüzey · radius · border · gölge · padding → global'den, her
 * widget'ta AYNI. Bunları prop ile ezmek YOK.
 *
 * <h4>Sabit yerleşim</h4>
 * <ul>
 *   <li><b>Header (sol):</b> {@link Props.title} (+ opsiyonel {@link Props.subtitle},
 *       {@link Props.icon}).</li>
 *   <li><b>Header (sağ-üst): aksiyon slotu</b> — {@link Props.actions}. Widget'ın
 *       TÜM butonları (Günü Kapat · Transfer/POS/+Yeni İşlem · Para İzi · filtre
 *       tetikleyici vb.) HEP buraya gider; rastgele yere buton konmaz.</li>
 *   <li><b>Body:</b> {@link Props.children} — içerik.</li>
 * </ul>
 *
 * <h4>Özelleştirme yalnız slot/prop ile</h4>
 * `title` · `subtitle?` · `icon?` · `actions?` (sağ-üst) · `variant?` (SABİT set:
 * default | hero) · `children` (body). Bir widget'ı özelleştirmek = yalnız
 * İÇERİĞİNİ (body) değiştirmek; kabuk/arka plan/buton-yeri her zaman tek-tip.
 *
 * <p>Çift tema, a11y (interactive → role/tabIndex/Enter+Space), reduced-motion
 * (lift CSS, prefers-reduced-motion ile kapanır).</p>
 *
 * <h4>Tıklanabilirlik (clickable widget)</h4>
 * İki yoldan biri verilince widget tıklanabilir olur ve TUTARLI hover-cue
 * (lift) + `cursor-pointer` + a11y (role/tabIndex/Enter+Space veya gerçek
 * `<a>`) otomatik eklenir — her widget'ta aynı:
 * <ul>
 *   <li>{@link Props.onClick} — genelde bir DETAY MODALI açar
 *       (bkz. {@link WidgetDetailModal} — primitive seviyesi tutarlı modal kabuğu:
 *       Daxa yüzey, sağ-üst kapat, ESC + backdrop).</li>
 *   <li>{@link Props.href} — ilgili detay/filtreli sayfaya deep-link
 *       (Next `Link`, prefetch). `onClick` + `href` birlikte verilirse `href` kazanır.</li>
 * </ul>
 *
 * @example
 * // Modal açan tıklanabilir widget
 * <Widget title="Konsolide" variant="hero" onClick={() => setOpen(true)}>{body}</Widget>
 * @example
 * // Deep-link tıklanabilir widget
 * <Widget title="Alacaklar" href="/dashboard/alacaklar">{body}</Widget>
 */
export interface WidgetProps {
  /** Sol-üst başlık (zorunlu). */
  title: React.ReactNode;
  /** Opsiyonel başlık altı küçük açıklama. */
  subtitle?: React.ReactNode;
  /** Opsiyonel başlık ikonu (lucide). */
  icon?: LucideIcon;
  /**
   * Sağ-üst AKSİYON SLOTU. Widget'ın tüm butonları/rozetleri buraya konur
   * (Günü Kapat, Transfer/POS/+Yeni İşlem, sayı rozeti, vb.) — hep aynı yerde.
   */
  actions?: React.ReactNode;
  /**
   * SABİT görsel varyant seti (kullanıcı keyfi stil EKLEYEMEZ):
   * - `"default"`: nötr solid Daxa yüzey (varsayılan).
   * - `"hero"`: koyu ink zemin + lime aksan, öne çıkan tek kart (Konsolide/Genel Kasa).
   */
  variant?: "default" | "hero";
  /**
   * Body'nin varsayılan iç padding'ini kaldırır — liste/divider içerikler
   * kendi padding'ini yönetir (header + footer köşelerle hizalı kalır).
   */
  flush?: boolean;
  /** Tıklanabilir widget (detay modal açma vb.) — a11y rolleri otomatik eklenir. */
  onClick?: () => void;
  /**
   * Tıklanabilir widget — ilgili detay/filtreli sayfaya deep-link (Next `Link`).
   * Verilince {@link onClick} yerine bağlantı kullanılır (her ikisi de varsa href öncelikli).
   */
  href?: string;
  /**
   * Body sarmalayıcıya ek layout sınıfı (spacing/grid). Kabuk stilini DEĞİL —
   * yalnız içerik düzenini etkiler. Kabuk (yüzey/border/gölge) global'den gelir.
   */
  bodyClassName?: string;
  /**
   * Yalnız dış kabuk LAYOUT'u için (örn. `h-full`, `flex flex-col`). Görsel
   * kabuk stili (yüzey/border/gölge/radius) buradan override EDİLMEZ — global'den.
   */
  className?: string;
  /** Body içeriği. */
  children: React.ReactNode;
  /** A11y etiketi (interactive widget için). */
  ariaLabel?: string;
}

export function Widget({
  title,
  subtitle,
  icon: Icon,
  actions,
  variant = "default",
  flush = false,
  onClick,
  href,
  bodyClassName,
  className,
  children,
  ariaLabel,
}: WidgetProps) {
  const isHero = variant === "hero";
  // href deep-link onClick'ten önceliklidir.
  const isLink = typeof href === "string" && href.length > 0;
  const interactive = isLink || typeof onClick === "function";

  const shellClass = cn(
    "v2-widget",
    isHero && "v2-widget--hero",
    interactive && "v2-widget--interactive",
    isLink && "no-underline",
    className
  );

  const inner = (
    <>
      <div className="v2-widget-header">
        <div className="min-w-0 flex flex-col gap-0.5">
          <h3 className="v2-widget-title truncate">
            {Icon && (
              <Icon
                size={isHero ? 12 : 14}
                className={cn("shrink-0", !isHero && "opacity-70")}
                aria-hidden
              />
            )}
            <span className="truncate">{title}</span>
          </h3>
          {subtitle != null && (
            <p
              className={cn(
                "text-[11px] truncate",
                isHero
                  ? "text-[rgb(var(--v2-card))]/55"
                  : "text-[rgb(var(--v2-muted))]"
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions != null && (
          // Aksiyon slotu — tıklama parent toggle'ı/deep-link'i tetiklemesin
          // (modal-açan onClick'te stopPropagation; href Link'inde de navigasyonu engelle).
          <div
            className="flex items-center gap-1.5 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              if (isLink) e.preventDefault();
            }}
          >
            {actions}
          </div>
        )}
      </div>

      <div
        className={cn(
          "v2-widget-body",
          flush && "v2-widget-body--flush",
          bodyClassName
        )}
      >
        {children}
      </div>
    </>
  );

  // Deep-link → gerçek <a> (Next Link, prefetch + erişilebilir klavye/odak).
  if (isLink) {
    return (
      <Link href={href} className={shellClass} aria-label={ariaLabel}>
        {inner}
      </Link>
    );
  }

  // Aksi halde <section> — onClick verildiyse button rolü + klavye desteği.
  return (
    <section
      className={shellClass}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? ariaLabel : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {inner}
    </section>
  );
}

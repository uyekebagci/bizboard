"use client";

import { useEffect, useRef } from "react";

/**
 * UX-14 — Modal focus-trap hook.
 *
 * <p>Açık bir modal içinde klavye odağını hapseder: Tab/Shift+Tab döngüsü
 * modal kök elemanının sınırını aşmaz. Açılışta ilk odaklanabilir öğeye
 * odaklanır; kapanışta önceki odak sahibine (trigger element) geri döner.</p>
 *
 * <p>SSR güvenli: document erişimi yalnız mount sonrası (useEffect) yapılır.</p>
 *
 * @param active - Trap'in aktif olup olmadığı (modal açık mı).
 * @param containerRef - Modal kök elementin ref'i.
 *
 * @example
 * const dialogRef = useRef<HTMLDivElement>(null);
 * useFocusTrap(open, dialogRef);
 * return <div ref={dialogRef} role="dialog" aria-modal="true">...</div>;
 */
export function useFocusTrap(
  active: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
): void {
  // Trap aktifleşmeden önce odakta olan eleman — kapanışta geri verilir.
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    if (!container) return;

    // Açılmadan önce odakta olan elemanı kaydet.
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Odaklanabilir eleman seçicisi (standart HTML + ARIA widget'ları).
    const FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), details > summary';

    function getFocusable(): HTMLElement[] {
      return Array.from(container!.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.closest('[inert]') && getComputedStyle(el).display !== 'none',
      );
    }

    // İlk odaklanabilir öğeye odaklan (modal açılışı).
    const first = getFocusable()[0];
    if (first) {
      first.focus();
    } else {
      // Odaklanabilir öğe yoksa container'ın kendisi odak alır.
      container.setAttribute('tabindex', '-1');
      container.focus();
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: ilk öğedeyse sona dön.
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        // Tab: son öğedeyse başa dön.
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);

      // Kapanışta odağı trigger element'e geri ver.
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function') {
        // rAF: modal DOM'dan kaldırılmadan önce focus() çağrısını sıraya al.
        requestAnimationFrame(() => prev.focus());
      }
    };
  }, [active, containerRef]);
}

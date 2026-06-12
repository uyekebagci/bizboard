"use client";

/**
 * v1.1 small-win: Core Web Vitals raporlama.
 * --------------------------------------------------------------
 * Next.js'in dahili `useReportWebVitals` hook'u ile LCP / CLS / INP /
 * FCP / TTFB (ve diğer Next metrikleri) toplanır. Yeni npm bağımlılığı
 * YOK — `next/web-vitals` Next 14 ile gelir, bundle'ı şişirmez.
 *
 * Hedef: mevcut frontend logger ("perf" kategorisi).
 *   - Dev'de  : sadece console (logger transport YOK).
 *   - Prod'da : logger batch buffer ile /api/logs'a gider.
 *
 * Salt yan-etki bileşeni; DOM render etmez (null döner).
 */

import { useReportWebVitals } from "next/web-vitals";
import { logger } from "@/lib/logger";

// Core Web Vitals "iyi/orta/zayıf" eşikleri (web.dev referansı).
// Sadece log seviyesini (info/warn) belirlemek için kullanılır; metrik
// değerini değiştirmez.
const POOR_THRESHOLD: Record<string, number> = {
  LCP: 4000, // ms
  FCP: 3000, // ms
  TTFB: 1800, // ms
  INP: 500, // ms
  CLS: 0.25, // unitless
  FID: 300, // ms (eski metrik, Next hâlâ raporlayabilir)
};

export function WebVitals(): null {
  useReportWebVitals((metric) => {
    const poor = POOR_THRESHOLD[metric.name];
    const isPoor = poor != null && metric.value > poor;
    const level = isPoor ? "warn" : "info";

    // CLS unitless; diğerleri ms — log'da net olsun diye yuvarlıyoruz.
    const value =
      metric.name === "CLS"
        ? Math.round(metric.value * 1000) / 1000
        : Math.round(metric.value);

    logger[level]("perf", `web-vital ${metric.name}`, {
      metric: metric.name,
      value,
      rating: metric.rating, // Next 14: "good" | "needs-improvement" | "poor"
      metric_id: metric.id,
      nav_type: metric.navigationType,
    });
  });

  return null;
}

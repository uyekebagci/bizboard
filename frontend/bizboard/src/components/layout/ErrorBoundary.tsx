"use client";

/**
 * v1.6.9: React Error Boundary.
 *
 * - Render sırasında oluşan beklenmeyen exception'ları yakalar (try/catch'in
 *   yakalayamadığı render-time hataları).
 * - logger.error("boundary", ...) ile arka uça raporlar (logger zaten batch/keepalive
 *   ile kuruludur — bkz. src/lib/logger.ts).
 * - Kullanıcıya temiz bir fallback UI gösterir: "Tekrar dene" + "Ana sayfa".
 *
 * Not: Error Boundary YALNIZ render-time + lifecycle hatalarını yakalar; event
 * handler içindeki Promise rejection'ları için `window.unhandledrejection` ayrı
 * kanal — `ClientProviders` içinde wired.
 *
 * Kullanım:
 *   <ErrorBoundary level="route" fallback={CustomFallback}> ... </ErrorBoundary>
 *
 * `level` rapor metadata'sı için (route / global), fallback'i değiştirmez.
 */

import React from "react";
import { logger } from "@/lib/logger";

interface Props {
  children: React.ReactNode;
  /** Telemetri için boundary'nin sahasi. Default: "route". */
  level?: "route" | "global" | string;
  /** Custom fallback render fonksiyonu (opsiyonel). */
  fallback?: (error: Error, retry: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logger.error(
      "boundary",
      `React render error (${this.props.level || "route"})`,
      {
        component_stack: info.componentStack ? String(info.componentStack).slice(0, 4000) : undefined,
        level: this.props.level || "route",
      },
      error,
    );
  }

  retry = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.retry);
      }
      return <DefaultErrorFallback error={error} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}

function DefaultErrorFallback({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <div
      role="alert"
      className="min-h-[60vh] flex flex-col items-center justify-center px-6 py-12"
    >
      <div className="max-w-md text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-red-400"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">
            Bir hata olustu
          </h2>
          <p className="text-sm text-surface-400 mt-1">
            Bu ekranda beklenmeyen bir sorun yasandi. Tekrar deneyebilir veya
            ana sayfaya donebilirsin. Hata otomatik olarak kaydedildi.
          </p>
        </div>

        {isDev && (
          <details className="text-left bg-surface-800 border border-surface-700 rounded-xl p-3 text-xs">
            <summary className="cursor-pointer text-surface-300 font-medium">
              Geliştirici detayı
            </summary>
            <pre className="mt-2 whitespace-pre-wrap text-red-300">
              {error.name}: {error.message}
            </pre>
            {error.stack && (
              <pre className="mt-2 whitespace-pre-wrap text-surface-400 overflow-x-auto">
                {error.stack.slice(0, 2000)}
              </pre>
            )}
          </details>
        )}

        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
          >
            Tekrar dene
          </button>
          <a
            href="/dashboard"
            className="px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-white text-sm font-medium transition-colors"
          >
            Ana sayfa
          </a>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

/**
 * App Router global error boundary. Render hatasını yakalar, logger'a yazar,
 * kullanıcıya friendly ekran gösterir.
 *
 * `digest` alanı Next.js tarafından üretilen anonim hash — production'da
 * stack trace yerine bunu kullanan log korelasyonu için elimizdeki ipucu.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error(
      "boundary",
      "Unhandled React render error",
      { digest: error.digest },
      error
    );
  }, [error]);

  return (
    <html lang="tr">
      <body>
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            background: "#0f172a",
            color: "white",
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
              Bir seyler ters gitti
            </h1>
            <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>
              Hata kayit edildi. Tekrar denemek icin asagidaki butona basabilirsiniz.
            </p>
            {error.digest && (
              <p
                style={{
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  color: "#64748b",
                  marginBottom: "1.5rem",
                }}
              >
                Destek icin referans: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                padding: "0.625rem 1.25rem",
                borderRadius: "0.75rem",
                background: "#3b82f6",
                color: "white",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              Tekrar dene
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

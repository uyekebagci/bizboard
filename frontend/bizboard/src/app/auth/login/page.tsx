"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, setToken } from "@/lib/api/client";
import { safeRedirectOr } from "@/lib/safe-redirect";
import { getErrorMessage } from "@/lib/errors";

interface LoginResponse {
  token: string;
  expiresInSeconds: number;
  forcePasswordChange: boolean;
}

/**
 * Frontend middleware'i için sadece bir session BAYRAĞI set ediyoruz; içinde
 * token YOK. Asıl auth backend refresh token (HttpOnly, backend domain'inde)
 * ve in-memory JWT ile yapılıyor. Bayrak XSS okusa bile sıfır token sızıntısı
 * sağlar, sadece "yakın zamanda login olundu" sinyalidir.
 */
function setSessionFlag() {
  if (typeof document === "undefined") return;
  // 30 gün — backend refresh token süresiyle paralel. Frontend bu süre boyunca
  // korumalı sayfalara redirect-flash olmadan erişebilir. Gerçek auth yine
  // /auth/refresh ile her sayfa açılışında doğrulanır (ClientProviders bootstrap).
  const maxAge = 60 * 60 * 24 * 30;
  document.cookie = `bb_session=1; path=/; max-age=${maxAge}; samesite=lax; secure`;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeRedirectOr(searchParams.get("redirect"), "/dashboard");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setErrorRequestId(null);

    try {
      const res = await api.post<LoginResponse>(
        "/auth/login",
        { username, password },
        { skipRefresh: true }
      );
      setToken(res.token, res.expiresInSeconds);
      setSessionFlag();
      // İlk girişte parola değişikliği zorunlu ise direkt o ekrana yönlendir.
      if (res.forcePasswordChange) {
        router.push("/dashboard/change-password");
      } else {
        router.push(redirect);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        switch (err.code) {
          case "AUTH-LOCK":
            setError(
              "Hesabiniz cok fazla hatali denemeden dolayi gecici olarak kilitlendi. " +
                "Lutfen 15 dakika sonra tekrar deneyin."
            );
            break;
          case "AUTH-DIS":
            setError(
              "Hesabiniz aktif degil. Lutfen yoneticiniz ile iletisime gecin."
            );
            break;
          case "RATE-429":
            setError(getErrorMessage(err));
            break;
          case "AUTH-401":
          default:
            setError("Kullanici adi veya sifre hatali.");
        }
        setErrorRequestId(err.requestId ?? null);
      } else if (err instanceof Error) {
        setError(err.message || "Giris yapilamadi");
      } else {
        setError("Giris yapilamadi");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 bg-surface-50">
      <div className="mb-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-2xl">BB</span>
        </div>
        <h1 className="text-2xl font-bold text-surface-900">Tekrar Hosgeldiniz</h1>
        <p className="text-surface-500 mt-1">BizBoard hesabiniza giris yapin</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        {error && (
          <div
            className="p-3 rounded-xl bg-red-50 text-red-700 text-sm"
            role="alert"
            aria-live="polite"
          >
            <div>{error}</div>
            {errorRequestId && (
              <div className="mt-1 text-[10px] text-red-500/80 font-mono">
                Destek icin referans: {errorRequestId}
              </div>
            )}
          </div>
        )}

        <div>
          <label htmlFor="username" className="label">
            Kullanici Adi
          </label>
          <input
            id="username"
            type="text"
            className="input"
            placeholder="kullanici adinizi girin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
        </div>

        <div>
          <label htmlFor="password" className="label">
            Sifre
          </label>
          <input
            id="password"
            type="password"
            className="input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Giris yapiliyor..." : "Giris Yap"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

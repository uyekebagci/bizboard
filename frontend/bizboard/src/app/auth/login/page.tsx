"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
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
      // v1.7.x: zorunlu şifre değişikliği akışı kaldırıldı.
      router.push(redirect);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        switch (err.code) {
          case "AUTH-LOCK":
            setError(
              "Hesabınız çok fazla hatalı denemeden dolayı geçici olarak kilitlendi. " +
                "Lütfen 15 dakika sonra tekrar deneyin."
            );
            break;
          case "AUTH-DIS":
            setError(
              "Hesabınız aktif değil. Lütfen yöneticiniz ile iletişime geçin."
            );
            break;
          case "RATE-429":
            setError(getErrorMessage(err));
            break;
          case "AUTH-401":
          default:
            setError("Kullanıcı adı veya şifre hatalı.");
        }
        setErrorRequestId(err.requestId ?? null);
      } else if (err instanceof Error) {
        setError(err.message || "Giriş yapılamadı");
      } else {
        setError("Giriş yapılamadı");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 v2-app-bg">
      <div className="mb-8 text-center">
        <div className="w-16 h-16 rounded-2xl v2-logo-tile flex items-center justify-center mx-auto mb-4">
          <span className="font-bold text-2xl">Ç</span>
        </div>
        <h1 className="text-2xl font-bold text-[rgb(var(--v2-ink))]">
          Tekrar Hoşgeldiniz
        </h1>
        <p className="text-[rgb(var(--v2-muted))] mt-1">
          ÇATI hesabınıza giriş yapın
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        {error && (
          <div
            className="p-3 rounded-xl bg-red-500/15 text-red-300 text-sm"
            role="alert"
            aria-live="polite"
          >
            <div>{error}</div>
            {errorRequestId && (
              <div className="mt-1 text-[10px] text-red-500/80 font-mono">
                Destek için referans: {errorRequestId}
              </div>
            )}
          </div>
        )}

        <div>
          <label htmlFor="username" className="label">
            Kullanıcı Adı
          </label>
          <input
            id="username"
            type="text"
            className="input"
            placeholder="kullanıcı adınızı girin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
        </div>

        <div>
          <label htmlFor="password" className="label">
            Şifre
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              className="input pr-11"
              placeholder="Lütfen Şifrenizi Girin"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
              aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Giriş yapılıyor..." : "Giriş Yap"}
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

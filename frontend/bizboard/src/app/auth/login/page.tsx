"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  EyeOff,
  Sun,
  Moon,
  ShieldCheck,
  LineChart,
  Layers,
  ArrowRight,
} from "lucide-react";
import { api, ApiError, setToken } from "@/lib/api/client";
import { safeRedirectOr } from "@/lib/safe-redirect";
import { getErrorMessage } from "@/lib/errors";
import { useTheme } from "@/components/layout/ThemeProvider";

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

/** Marka logosu plakası — Daxa ink zemin + accent harf + imza noktası. */
function BrandMark({ size = "md" }: { size?: "md" | "lg" }) {
  const dims = size === "lg" ? "w-16 h-16 text-2xl" : "w-12 h-12 text-xl";
  return (
    <div className="relative inline-flex">
      <div
        className={`${dims} rounded-2xl v2-logo-tile flex items-center justify-center font-bold`}
      >
        <span>Ç</span>
      </div>
      <span className="v2-logo-dot absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" />
    </div>
  );
}

/** Sol marka paneli — yalnız masaüstü; ink zemin her iki temada koyu. */
function BrandPanel() {
  const highlights = [
    {
      icon: Layers,
      title: "Tüm işletmeleriniz tek ekranda",
      desc: "Birden fazla işletmeyi tek panelden yönetin.",
    },
    {
      icon: LineChart,
      title: "Gerçek zamanlı finans takibi",
      desc: "Kasa, gelir-gider ve performansı anlık izleyin.",
    },
    {
      icon: ShieldCheck,
      title: "Güvenli ve kontrollü erişim",
      desc: "Rol bazlı yetkiler ve denetim kaydıyla tam kontrol.",
    },
  ];

  return (
    <div className="relative hidden lg:flex flex-col justify-between overflow-hidden auth-brand-panel p-12 xl:p-16">
      {/* Dekoratif accent glow + ince ızgara deseni (Daxa derinlik). */}
      <div className="auth-brand-glow" aria-hidden="true" />
      <div className="auth-brand-grid" aria-hidden="true" />

      <div className="relative z-10 flex items-center gap-3">
        <BrandMark size="md" />
        <span className="text-xl font-extrabold tracking-tight text-white">
          ÇATI
        </span>
      </div>

      <div className="relative z-10 max-w-md">
        <p className="auth-brand-eyebrow mb-4">İşletme yönetim platformu</p>
        <h2 className="text-3xl xl:text-4xl font-extrabold leading-tight tracking-tight text-white">
          Tüm işletmeleriniz,
          <br />
          <span className="auth-brand-accent">tek ekranda.</span>
        </h2>
        <p className="mt-4 text-white/70 text-base leading-relaxed">
          Finansları takip edin, performansı izleyin, kontrolü elinizde tutun.
        </p>

        <ul className="mt-10 space-y-5">
          {highlights.map(({ icon: Icon, title, desc }) => (
            <li key={title} className="flex items-start gap-3.5">
              <span className="auth-brand-feature-icon shrink-0">
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-white text-sm">{title}</p>
                <p className="text-white/55 text-sm mt-0.5">{desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative z-10 text-white/40 text-xs">
        &copy; {new Date().getFullYear()} ÇATI. Tüm hakları saklıdır.
      </p>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeRedirectOr(searchParams.get("redirect"), "/dashboard");
  const { theme, toggleTheme } = useTheme();

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
    <div className="relative flex flex-col items-center justify-center px-6 py-10 v2-app-bg">
      {/* Tema geçişi (güneş/ay) — sağ üst köşe, app'in geri kalanıyla tutarlı. */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
        title={theme === "dark" ? "Açık tema" : "Koyu tema"}
        className="v2-icon-btn v2-press absolute top-5 right-5"
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-sm">
        {/* Mobil/tablet: form üstünde marka (sol panel gizli olduğunda). */}
        <div className="lg:hidden mb-8 text-center">
          <div className="flex justify-center mb-4">
            <BrandMark size="lg" />
          </div>
        </div>

        <div className="mb-8 text-center lg:text-left">
          <h1 className="text-2xl font-extrabold tracking-tight text-[rgb(var(--v2-ink))]">
            Tekrar Hoşgeldiniz
          </h1>
          <p className="text-[rgb(var(--v2-muted))] mt-1.5">
            ÇATI hesabınıza giriş yapın
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div
              className="p-3 rounded-xl border border-status-danger/40 bg-status-danger/10 text-status-danger text-sm"
              role="alert"
              aria-live="polite"
            >
              <div>{error}</div>
              {errorRequestId && (
                <div className="mt-1 text-[10px] text-status-danger/60 font-mono">
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))] transition-colors"
                aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="v2-btn v2-btn--accent v2-press w-full py-3 text-base group disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              "Giriş yapılıyor..."
            ) : (
              <>
                Giriş Yap
                <ArrowRight
                  size={18}
                  className="transition-transform duration-150 group-hover:translate-x-0.5"
                />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <div className="min-h-[100dvh] grid lg:grid-cols-2">
        <BrandPanel />
        <LoginForm />
      </div>
    </Suspense>
  );
}

"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, setToken } from "@/lib/api/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { token } = await api.post<{ token: string }>("/auth/login", {
        username,
        password,
      });
      setToken(token);
      router.push(redirect);
    } catch (err: any) {
      setError(err.message || "Giris yapilamadi");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 bg-surface-50">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-2xl">BB</span>
        </div>
        <h1 className="text-2xl font-bold text-surface-900">Tekrar Hosgeldiniz</h1>
        <p className="text-surface-500 mt-1">BizBoard hesabiniza giris yapin</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">
            {error}
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

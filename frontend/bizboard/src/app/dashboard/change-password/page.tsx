"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2, ShieldCheck } from "lucide-react";
import { api, ApiError, clearToken } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorRequestId(null);
    setFieldErrors({});

    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirm_password: "Şifre tekrarı eşleşmiyor" });
      return;
    }
    if (newPassword.length < 10) {
      setFieldErrors({ new_password: "Yeni şifre en az 10 karakter olmalı" });
      return;
    }

    setIsLoading(true);
    try {
      await api.post(
        "/me/password",
        { current_password: currentPassword, new_password: newPassword },
        { autoRefresh: true }
      );
      setSuccess(true);
      toast.success("Şifre güncellendi");
      // Backend tum refresh token'lari revoke etti — yeniden login gerekecek.
      // Kullaniciya 2 saniye basari ekrani gosterip login'e at.
      setTimeout(() => {
        clearToken();
        router.replace("/auth/login");
      }, 2000);
    } catch (err: unknown) {
      toast.error(err);
      if (err instanceof ApiError) {
        if (err.code === "VAL-400" && err.fieldErrors) {
          // Backend field hatalarını snake_case ile dönüyor
          setFieldErrors(err.fieldErrors);
          setError("Lütfen formdaki hataları düzeltin.");
        } else if (err.message?.includes("Mevcut sifre")) {
          setFieldErrors({ current_password: "Mevcut şifre hatalı" });
        } else if (err.message?.includes("eski sifre ile ayni")) {
          setFieldErrors({ new_password: "Yeni şifre eski şifreyle aynı olamaz" });
        } else {
          setError(err.message || "Şifre değiştirilemedi");
        }
        setErrorRequestId(err.requestId ?? null);
      } else if (err instanceof Error) {
        setError(getErrorMessage(err));
      } else {
        setError("Şifre değiştirilemedi");
      }
    } finally {
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-[60dvh] flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-green-500/15 flex items-center justify-center mb-4">
          <ShieldCheck size={36} className="text-green-700 dark:text-green-300" />
        </div>
        <h1 className="text-xl font-bold text-[rgb(var(--v2-ink))] mb-1">Şifre Değiştirildi</h1>
        <p className="text-[rgb(var(--v2-muted))] text-sm">
          Güvenlik için yeniden giriş yapmanız gerekiyor...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <div className="mb-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[rgb(var(--v2-ink))] flex items-center justify-center mx-auto mb-3">
          <Lock size={20} className="text-[rgb(var(--v2-card))]" />
        </div>
        <h1 className="text-xl font-bold text-[rgb(var(--v2-ink))]">Şifre Değiştir</h1>
        <p className="text-[rgb(var(--v2-muted))] text-sm mt-1">
          Güvenlik için yeni bir şifre belirleyin
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm">
            <div>{error}</div>
            {errorRequestId && (
              <div className="mt-1 text-[10px] font-mono text-red-700/80 dark:text-red-400/80">
                Destek için referans: {errorRequestId}
              </div>
            )}
          </div>
        )}

        <div>
          <label htmlFor="current_password" className="label">
            Mevcut Şifre
          </label>
          <input
            id="current_password"
            type="password"
            className={`input ${fieldErrors.current_password ? "border-red-500" : ""}`}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {fieldErrors.current_password && (
            <p className="mt-1 text-xs text-red-500">{fieldErrors.current_password}</p>
          )}
        </div>

        <div>
          <label htmlFor="new_password" className="label">
            Yeni Şifre
          </label>
          <input
            id="new_password"
            type="password"
            className={`input ${fieldErrors.new_password ? "border-red-500" : ""}`}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={10}
            autoComplete="new-password"
          />
          {fieldErrors.new_password ? (
            <p className="mt-1 text-xs text-red-500">{fieldErrors.new_password}</p>
          ) : (
            <p className="mt-1 text-xs text-[rgb(var(--v2-muted))]">
              En az 10 karakter. Tahmin edilmesi zor bir şifre seçin.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="confirm_password" className="label">
            Yeni Şifre (Tekrar)
          </label>
          <input
            id="confirm_password"
            type="password"
            className={`input ${fieldErrors.confirm_password ? "border-red-500" : ""}`}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          {fieldErrors.confirm_password && (
            <p className="mt-1 text-xs text-red-500">{fieldErrors.confirm_password}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Kaydediliyor...
            </>
          ) : (
            "Şifreyi Değiştir"
          )}
        </button>

        <p className="text-[11px] text-[rgb(var(--v2-muted))] text-center">
          Şifre değişikliğinden sonra tüm cihazlarda yeniden giriş yapmanız gerekecektir.
        </p>
      </form>
    </div>
  );
}

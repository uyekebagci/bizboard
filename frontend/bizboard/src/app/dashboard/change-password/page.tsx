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
      setFieldErrors({ confirm_password: "Sifre tekrari eslesmiyor" });
      return;
    }
    if (newPassword.length < 10) {
      setFieldErrors({ new_password: "Yeni sifre en az 10 karakter olmali" });
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
          setError("Lutfen formdaki hatalari duzeltin.");
        } else if (err.message?.includes("Mevcut sifre")) {
          setFieldErrors({ current_password: "Mevcut sifre hatali" });
        } else if (err.message?.includes("eski sifre ile ayni")) {
          setFieldErrors({ new_password: "Yeni sifre eski sifreyle ayni olamaz" });
        } else {
          setError(err.message || "Sifre degistirilemedi");
        }
        setErrorRequestId(err.requestId ?? null);
      } else if (err instanceof Error) {
        setError(getErrorMessage(err));
      } else {
        setError("Sifre degistirilemedi");
      }
    } finally {
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-[60dvh] flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
          <ShieldCheck size={36} className="text-green-600" />
        </div>
        <h1 className="text-xl font-bold text-white mb-1">Sifre Degistirildi</h1>
        <p className="text-surface-400 text-sm">
          Guvenlik icin yeniden giris yapmaniz gerekiyor...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <div className="mb-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto mb-3">
          <Lock size={20} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-white">Sifre Degistir</h1>
        <p className="text-surface-400 text-sm mt-1">
          Guvenlik icin yeni bir sifre belirleyin
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <div>{error}</div>
            {errorRequestId && (
              <div className="mt-1 text-[10px] font-mono text-red-400/80">
                Destek icin referans: {errorRequestId}
              </div>
            )}
          </div>
        )}

        <div>
          <label htmlFor="current_password" className="label">
            Mevcut Sifre
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
            Yeni Sifre
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
            <p className="mt-1 text-xs text-surface-400">
              En az 10 karakter. Tahmin edilmesi zor bir sifre secin.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="confirm_password" className="label">
            Yeni Sifre (Tekrar)
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
            "Sifreyi Degistir"
          )}
        </button>

        <p className="text-[11px] text-surface-400 text-center">
          Sifre degisikliginden sonra tum cihazlarda yeniden giris yapmaniz gerekecektir.
        </p>
      </form>
    </div>
  );
}

"use client";

/**
 * Admin Paneli — Kullanıcı oluştur/düzenle modal'ları.
 *
 * <p>page.tsx 500-satır sınırını aşmasın diye ayrı dosyaya çıkarıldı (salt
 * organizasyon — davranış/RBAC/alan doğrulama aynen korundu). Daxa hizası:
 * accent (lime) rol/işletme seçimi + v2 accent submit butonu; yüzeyler
 * tema-duyarlı surface token'larıyla (çift tema). modal kabuğu glass-card /
 * modal-header (mevcut tema-duyarlı primitivler).</p>
 */

import { useState } from "react";
import { X, Check, Eye, EyeOff, Building2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import type { AdminUser, Business } from "@/types";

// ── Role Labels ─────────────────────────────────────────────
export const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "viewer", label: "Görüntüleyen" },
];

export function getRoleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label || role;
}

// ── Create User Modal ───────────────────────────────────────
export function CreateUserModal({
  businesses,
  onClose,
  onSuccess,
}: {
  businesses: Business[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("viewer");
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleBusiness(id: string) {
    setSelectedBusinessIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username || !password || !fullName) {
      setError("Tüm alanları doldurun");
      return;
    }

    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalı");
      return;
    }

    if (role !== "admin" && selectedBusinessIds.length === 0) {
      setError("En az bir işletme seçmelisiniz");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/admin/users", {
        username,
        password,
        full_name: fullName,
        role,
        business_ids:
          role === "admin"
            ? [businesses[0]?.id || ""]
            : selectedBusinessIds,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="modal-header">
          <h3 className="text-lg font-semibold text-surface-100">
            Yeni Kullanıcı Oluştur
          </h3>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="p-1.5 rounded-lg hover:bg-surface-600 transition-colors"
          >
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl border border-status-danger/40 bg-status-danger/10 text-status-danger text-sm"
            >
              {error}
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Ad Soyad
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-900 border border-surface-600 rounded-xl text-surface-100 text-sm placeholder-gray-600 focus:outline-none focus:border-accent/60 transition-colors"
              placeholder="Örnek: Ahmet Yılmaz"
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Kullanıcı Adı
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-900 border border-surface-600 rounded-xl text-surface-100 text-sm placeholder-gray-600 focus:outline-none focus:border-accent/60 transition-colors"
              placeholder="örnek: ahmet"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Şifre
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 pr-12 bg-surface-900 border border-surface-600 rounded-xl text-surface-100 text-sm placeholder-gray-600 focus:outline-none focus:border-accent/60 transition-colors"
                placeholder="En az 6 karakter"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-300"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Rol
            </label>
            <div className="flex gap-3">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    role === opt.value
                      ? "bg-accent/16 border-accent/50 text-accent-strong dark:text-accent"
                      : "bg-surface-900 border-surface-600 text-surface-400 hover:border-surface-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Business Selection (hide for admin) */}
          {role !== "admin" && (
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">
                Erişebileceği İşletmeler
              </label>
              <p className="text-xs text-surface-400 mb-3">
                En az bir işletme seçmelisiniz
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {businesses.map((biz) => (
                  <button
                    key={biz.id}
                    type="button"
                    onClick={() => toggleBusiness(biz.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm border transition-colors ${
                      selectedBusinessIds.includes(biz.id)
                        ? "bg-accent/12 border-accent/45 text-[rgb(var(--v2-ink))]"
                        : "bg-surface-900 border-surface-600 text-surface-400 hover:border-surface-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Building2 size={16} />
                      <span>{biz.name}</span>
                    </div>
                    {selectedBusinessIds.includes(biz.id) && (
                      <Check size={16} className="text-accent-strong dark:text-accent" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {role === "admin" && (
            <div className="p-3 bg-accent/10 border border-accent/25 rounded-xl">
              <p className="text-sm text-accent-strong dark:text-accent">
                Admin rolü tüm işletmelere erişim sağlar.
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="v2-btn v2-btn--accent v2-press w-full py-3 disabled:opacity-50"
          >
            {submitting ? "Oluşturuluyor..." : "Kullanıcı Oluştur"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Edit User Modal ─────────────────────────────────────────
export function EditUserModal({
  user,
  businesses,
  onClose,
  onSuccess,
}: {
  user: AdminUser;
  businesses: Business[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [fullName, setFullName] = useState(user.full_name || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<string[]>(
    user.business_ids || []
  );
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleBusiness(id: string) {
    setSelectedBusinessIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (role !== "admin" && selectedBusinessIds.length === 0) {
      setError("En az bir işletme seçmelisiniz");
      return;
    }

    if (password && password.length < 6) {
      setError("Şifre en az 6 karakter olmalı");
      return;
    }

    setSubmitting(true);
    try {
      await api.put(`/admin/users/${user.id}`, {
        full_name: fullName || undefined,
        password: password || undefined,
        role,
        business_ids:
          role === "admin"
            ? [businesses[0]?.id || ""]
            : selectedBusinessIds,
        is_active: isActive,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="modal-header">
          <h3 className="text-lg font-semibold text-surface-100">
            Kullanıcıyı Düzenle
          </h3>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="p-1.5 rounded-lg hover:bg-surface-600 transition-colors"
          >
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl border border-status-danger/40 bg-status-danger/10 text-status-danger text-sm"
            >
              {error}
            </div>
          )}

          {/* Username (read only) */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Kullanıcı Adı
            </label>
            <input
              type="text"
              value={user.username}
              disabled
              className="w-full px-4 py-2.5 bg-surface-900 border border-surface-600 rounded-xl text-surface-400 text-sm cursor-not-allowed"
            />
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Ad Soyad
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-900 border border-surface-600 rounded-xl text-surface-100 text-sm placeholder-gray-600 focus:outline-none focus:border-accent/60 transition-colors"
            />
          </div>

          {/* Password (optional) */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Yeni Şifre{" "}
              <span className="text-surface-300">(boş bırakılabilir)</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 pr-12 bg-surface-900 border border-surface-600 rounded-xl text-surface-100 text-sm placeholder-gray-600 focus:outline-none focus:border-accent/60 transition-colors"
                placeholder="Değiştirmek için girin"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-300"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Rol
            </label>
            <div className="flex gap-3">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    role === opt.value
                      ? "bg-accent/16 border-accent/50 text-accent-strong dark:text-accent"
                      : "bg-surface-900 border-surface-600 text-surface-400 hover:border-surface-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between p-4 bg-surface-900 border border-surface-600 rounded-xl">
            <span className="text-sm text-surface-300">Aktif Durum</span>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              role="switch"
              aria-checked={isActive}
              aria-label="Aktif durum"
              className={`relative w-12 h-6 rounded-full transition-colors ${
                isActive ? "bg-accent" : "bg-surface-600"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  isActive ? "left-[26px]" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {/* Business Selection (hide for admin) */}
          {role !== "admin" && (
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">
                Erişebileceği İşletmeler
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {businesses.map((biz) => (
                  <button
                    key={biz.id}
                    type="button"
                    onClick={() => toggleBusiness(biz.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm border transition-colors ${
                      selectedBusinessIds.includes(biz.id)
                        ? "bg-accent/12 border-accent/45 text-[rgb(var(--v2-ink))]"
                        : "bg-surface-900 border-surface-600 text-surface-400 hover:border-surface-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Building2 size={16} />
                      <span>{biz.name}</span>
                    </div>
                    {selectedBusinessIds.includes(biz.id) && (
                      <Check size={16} className="text-accent-strong dark:text-accent" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {role === "admin" && (
            <div className="p-3 bg-accent/10 border border-accent/25 rounded-xl">
              <p className="text-sm text-accent-strong dark:text-accent">
                Admin rolü tüm işletmelere erişim sağlar.
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="v2-btn v2-btn--accent v2-press w-full py-3 disabled:opacity-50"
          >
            {submitting ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
          </button>
        </form>
      </div>
    </div>
  );
}

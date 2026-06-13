"use client";

/**
 * Admin Paneli — Kullanıcı düzenle modal'ı.
 *
 * <p>{@link AdminUserModals} 500-satır sınırını aşmasın diye ayrı dosyaya çıkarıldı
 * (salt organizasyon — davranış/RBAC/alan doğrulama aynen korundu). Daxa hizası;
 * çift tema. İşletme-erişimi + sidebar SAYFA-erişimi (kullanıcı-bazlı) seçimleri
 * burada. Admin için her ikisi de yok sayılır (admin tüm işletme + tüm sayfalar).</p>
 */

import { useEffect, useRef, useState } from "react";
import { X, Check, Eye, EyeOff, Building2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import type { AdminUser, Business } from "@/types";
import { ROLE_OPTIONS } from "./AdminUserModals";
import {
  AdminPageAccess,
  buildAllowedPagesPayload,
  deriveInitialPageAccess,
} from "./AdminPageAccess";
import { useFocusTrap } from "@/hooks/useFocusTrap";

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
  // Sayfa-erişimi — mevcut kullanıcının allowed_pages'inden türetilir.
  const initialPageAccess = deriveInitialPageAccess(user.allowed_pages);
  const [allPages, setAllPages] = useState(initialPageAccess.allPages);
  const [selectedPageKeys, setSelectedPageKeys] = useState<string[]>(
    initialPageAccess.selectedKeys
  );
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, dialogRef);

  // ESC → close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleBusiness(id: string) {
    setSelectedBusinessIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  }

  function togglePageKey(key: string) {
    setSelectedPageKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
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
        // Admin için sayfa-erişimi yok sayılır (backend tüm sayfalara açar).
        allowed_pages:
          role === "admin"
            ? undefined
            : buildAllowedPagesPayload(allPages, selectedPageKeys),
      });
      onSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-user-modal-title"
    >
      <div ref={dialogRef} className="v2-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="modal-header">
          <h3 id="edit-user-modal-title" className="text-lg font-semibold text-[rgb(var(--v2-ink))]">
            Kullanıcıyı Düzenle
          </h3>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] transition-colors"
          >
            <X size={18} className="text-[rgb(var(--v2-muted))]" />
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
            <label className="block text-sm font-medium text-[rgb(var(--v2-muted))] mb-1.5">
              Kullanıcı Adı
            </label>
            <input
              type="text"
              value={user.username}
              disabled
              className="input opacity-60 cursor-not-allowed"
            />
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--v2-muted))] mb-1.5">
              Ad Soyad
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input"
            />
          </div>

          {/* Password (optional) */}
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--v2-muted))] mb-1.5">
              Yeni Şifre{" "}
              <span className="text-[rgb(var(--v2-muted))]">(boş bırakılabilir)</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pr-12"
                placeholder="Değiştirmek için girin"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--v2-muted))] mb-1.5">
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
                      : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-accent/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between p-4 v2-sunken rounded-xl">
            <span className="text-sm text-[rgb(var(--v2-ink))]">Aktif Durum</span>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              role="switch"
              aria-checked={isActive}
              aria-label="Aktif durum"
              className={`relative w-12 h-6 rounded-full transition-colors ${
                isActive ? "bg-accent" : "bg-[rgb(var(--v2-border))]"
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
              <label className="block text-sm font-medium text-[rgb(var(--v2-muted))] mb-1.5">
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
                        : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-accent/40"
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

          {/* Sayfa-erişimi (admin hariç) */}
          {role !== "admin" && (
            <AdminPageAccess
              allPages={allPages}
              onAllPagesChange={setAllPages}
              selectedKeys={selectedPageKeys}
              onToggleKey={togglePageKey}
            />
          )}

          {role === "admin" && (
            <div className="p-3 bg-accent/10 border border-accent/25 rounded-xl">
              <p className="text-sm text-accent-strong dark:text-accent">
                Admin rolü tüm işletmelere ve sayfalara erişim sağlar.
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

"use client";

/**
 * Admin Paneli — Kullanıcı OLUŞTUR modal'ı + paylaşılan rol yardımcıları.
 *
 * <p>page.tsx 500-satır sınırını aşmasın diye ayrı dosyaya çıkarıldı. Düzenle
 * modal'ı 500-satır sınırı için {@link ./AdminEditUserModal} dosyasına alındı
 * (salt organizasyon — davranış/RBAC/alan doğrulama aynen korundu). Daxa hizası:
 * accent (lime) rol/işletme/sayfa seçimi + v2 accent submit butonu; yüzeyler
 * tema-duyarlı surface token'larıyla (çift tema). modal kabuğu glass-card /
 * modal-header (mevcut tema-duyarlı primitivler).</p>
 */

import { useEffect, useRef, useState } from "react";
import { X, Check, Eye, EyeOff, Building2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import type { Business } from "@/types";
import {
  AdminPageAccess,
  buildAllowedPagesPayload,
} from "./AdminPageAccess";
import { useFocusTrap } from "@/hooks/useFocusTrap";

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
  // Sayfa-erişimi — yeni kullanıcı default'u TÜM sayfalar (default-permissive).
  const [allPages, setAllPages] = useState(true);
  const [selectedPageKeys, setSelectedPageKeys] = useState<string[]>([]);
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
      aria-labelledby="create-user-modal-title"
    >
      <div ref={dialogRef} className="v2-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="modal-header">
          <h3 id="create-user-modal-title" className="text-lg font-semibold text-[rgb(var(--v2-ink))]">
            Yeni Kullanıcı Oluştur
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
              placeholder="Örnek: Ahmet Yılmaz"
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--v2-muted))] mb-1.5">
              Kullanıcı Adı
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
              placeholder="örnek: ahmet"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--v2-muted))] mb-1.5">
              Şifre
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pr-12"
                placeholder="En az 6 karakter"
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

          {/* Business Selection (hide for admin) */}
          {role !== "admin" && (
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--v2-muted))] mb-1.5">
                Erişebileceği İşletmeler
              </label>
              <p className="text-xs text-[rgb(var(--v2-muted))] mb-3">
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
            {submitting ? "Oluşturuluyor..." : "Kullanıcı Oluştur"}
          </button>
        </form>
      </div>
    </div>
  );
}

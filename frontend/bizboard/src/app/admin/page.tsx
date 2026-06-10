"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Users,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  ChevronLeft,
  Eye,
  EyeOff,
  Building2,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import type { AdminUser, Business } from "@/types";

// ── Role Labels ─────────────────────────────────────────────
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "viewer", label: "Goruntuleyen" },
];

function getRoleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label || role;
}

// ── Admin Panel Page ────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const { profile } = useAppStore();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AdminUser | null>(null);

  // Redirect if not admin
  useEffect(() => {
    if (profile && profile.role !== "admin") {
      router.push("/dashboard");
    }
  }, [profile, router]);

  // Fetch data
  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [usersData, businessesData] = await Promise.all([
        api.get<AdminUser[]>("/admin/users"),
        api.get<Business[]>("/businesses"),
      ]);
      setUsers(usersData || []);
      setBusinesses(businessesData || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteUser(userId: string) {
    try {
      await api.delete(`/admin/users/${userId}`);
      setDeleteConfirm(null);
      fetchData();
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  }

  if (profile?.role !== "admin") {
    return null;
  }

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push("/dashboard")}
          className="p-2 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors"
        >
          <ChevronLeft size={20} className="text-amber-400" />
        </button>
        <div className="flex items-center gap-2.5">
          <Shield size={24} className="text-amber-400" />
          <h1 className="text-2xl font-bold text-white">Admin Paneli</h1>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Users Section — Redesign Inc.5: glass-card (tema-duyarlı) */}
      <div className="glass-card overflow-hidden">
        {/* Section Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-700/60">
          <div className="flex items-center gap-2.5">
            <Users size={20} className="text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Kullanicilar</h2>
            <span className="ml-1 text-sm text-surface-400">
              ({users.length})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/admin/my-companies"
              className="btn-secondary px-3 py-2 text-sm"
            >
              Firmalarim
            </a>
            <a
              href="/admin/debt-migration"
              className="btn-secondary px-3 py-2 text-sm"
            >
              Borc Migration
            </a>
            <a
              href="/admin/recurring"
              className="btn-secondary px-3 py-2 text-sm"
            >
              Recurring
            </a>
            <a
              href="/admin/audit"
              className="btn-secondary px-3 py-2 text-sm"
            >
              Audit Log
            </a>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm rounded-xl transition-colors"
            >
              <Plus size={16} />
              Yeni Kullanici
            </button>
          </div>
        </div>

        {/* User List */}
        {loading ? (
          <div className="p-8 text-center text-surface-400">Yukleniyor...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-surface-400">
            Henuz kullanici yok
          </div>
        ) : (
          <div className="divide-y divide-surface-700">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 hover:bg-surface-800 transition-colors group"
              >
                {/* User Info */}
                <div className="flex items-center gap-4 min-w-0">
                  {/* Avatar */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ${
                      user.role === "admin"
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-surface-600 text-surface-400"
                    }`}
                  >
                    {user.full_name
                      ?.split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2) || "?"}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white text-sm truncate">
                        {user.full_name}
                      </p>
                      {!user.is_active && (
                        <span className="px-2 py-0.5 text-xs bg-red-900/30 text-red-400 rounded-full">
                          Pasif
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-surface-400">@{user.username}</p>
                  </div>
                </div>

                {/* Role + Businesses */}
                <div className="flex items-center gap-4">
                  {/* Role badge */}
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      user.role === "admin"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : "bg-surface-600 text-surface-400 border border-surface-600"
                    }`}
                  >
                    {getRoleLabel(user.role)}
                  </span>

                  {/* Business count */}
                  <div className="flex items-center gap-1.5 text-xs text-surface-400">
                    <Building2 size={14} />
                    <span>
                      {user.role === "admin"
                        ? "Tumu"
                        : `${user.business_names?.length || 0} isletme`}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingUser(user)}
                      className="p-2 rounded-lg hover:bg-surface-600 transition-colors"
                      title="Duzenle"
                    >
                      <Pencil size={15} className="text-surface-400" />
                    </button>
                    {user.role !== "admin" && (
                      <button
                        onClick={() => setDeleteConfirm(user)}
                        className="p-2 rounded-lg hover:bg-red-900/30 transition-colors"
                        title="Sil"
                      >
                        <Trash2 size={15} className="text-red-500" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserModal
          businesses={businesses}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchData();
          }}
        />
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          businesses={businesses}
          onClose={() => setEditingUser(null)}
          onSuccess={() => {
            setEditingUser(null);
            fetchData();
          }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-card p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-2">
              Kullaniciyi Sil
            </h3>
            <p className="text-surface-400 text-sm mb-6">
              <span className="text-white font-medium">
                {deleteConfirm.full_name}
              </span>{" "}
              adli kullaniciyi silmek istediginize emin misiniz? Bu islem geri
              alinamaz.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 bg-surface-600 hover:bg-surface-600 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Iptal
              </button>
              <button
                onClick={() => handleDeleteUser(deleteConfirm.id)}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create User Modal ───────────────────────────────────────
function CreateUserModal({
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
      setError("Tum alanlari doldurun");
      return;
    }

    if (password.length < 6) {
      setError("Sifre en az 6 karakter olmali");
      return;
    }

    if (role !== "admin" && selectedBusinessIds.length === 0) {
      setError("En az bir isletme secmelisiniz");
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
          <h3 className="text-lg font-semibold text-white">
            Yeni Kullanici Olustur
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-600 transition-colors"
          >
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">
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
              className="w-full px-4 py-2.5 bg-surface-900 border border-surface-600 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-amber-500/50 transition-colors"
              placeholder="Ornek: Ahmet Yilmaz"
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Kullanici Adi
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-900 border border-surface-600 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-amber-500/50 transition-colors"
              placeholder="ornek: ahmet"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Sifre
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 pr-12 bg-surface-900 border border-surface-600 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-amber-500/50 transition-colors"
                placeholder="En az 6 karakter"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
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
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
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
                Erisebilecegi Isletmeler
              </label>
              <p className="text-xs text-surface-400 mb-3">
                En az bir isletme secmelisiniz
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {businesses.map((biz) => (
                  <button
                    key={biz.id}
                    type="button"
                    onClick={() => toggleBusiness(biz.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm border transition-colors ${
                      selectedBusinessIds.includes(biz.id)
                        ? "bg-amber-500/10 border-amber-500/40 text-white"
                        : "bg-surface-900 border-surface-600 text-surface-400 hover:border-surface-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Building2 size={16} />
                      <span>{biz.name}</span>
                    </div>
                    {selectedBusinessIds.includes(biz.id) && (
                      <Check size={16} className="text-amber-400" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {role === "admin" && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <p className="text-sm text-amber-400">
                Admin rolu tum isletmelere erisim saglar.
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-xl text-sm transition-colors"
          >
            {submitting ? "Olusturuluyor..." : "Kullanici Olustur"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Edit User Modal ─────────────────────────────────────────
function EditUserModal({
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
      setError("En az bir isletme secmelisiniz");
      return;
    }

    if (password && password.length < 6) {
      setError("Sifre en az 6 karakter olmali");
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
          <h3 className="text-lg font-semibold text-white">
            Kullaniciyi Duzenle
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-600 transition-colors"
          >
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Username (read only) */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Kullanici Adi
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
              className="w-full px-4 py-2.5 bg-surface-900 border border-surface-600 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-amber-500/50 transition-colors"
            />
          </div>

          {/* Password (optional) */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Yeni Sifre{" "}
              <span className="text-surface-300">(bos birakilabilir)</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 pr-12 bg-surface-900 border border-surface-600 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-amber-500/50 transition-colors"
                placeholder="Degistirmek icin girin"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
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
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
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
              className={`relative w-12 h-6 rounded-full transition-colors ${
                isActive ? "bg-amber-500" : "bg-surface-600"
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
                Erisebilecegi Isletmeler
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {businesses.map((biz) => (
                  <button
                    key={biz.id}
                    type="button"
                    onClick={() => toggleBusiness(biz.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm border transition-colors ${
                      selectedBusinessIds.includes(biz.id)
                        ? "bg-amber-500/10 border-amber-500/40 text-white"
                        : "bg-surface-900 border-surface-600 text-surface-400 hover:border-surface-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Building2 size={16} />
                      <span>{biz.name}</span>
                    </div>
                    {selectedBusinessIds.includes(biz.id) && (
                      <Check size={16} className="text-amber-400" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {role === "admin" && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <p className="text-sm text-amber-400">
                Admin rolu tum isletmelere erisim saglar.
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-xl text-sm transition-colors"
          >
            {submitting ? "Kaydediliyor..." : "Degisiklikleri Kaydet"}
          </button>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Users,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  Building2,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { AdminTabs } from "@/components/admin/AdminTabs";
import {
  CreateUserModal,
  getRoleLabel,
} from "@/components/admin/AdminUserModals";
import { EditUserModal } from "@/components/admin/AdminEditUserModal";
import type { AdminUser, Business } from "@/types";

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
      {/* Header — Daxa: geri butonu + Shield + başlık (accent token). */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => router.push("/dashboard")}
          aria-label="Panoya dön"
          className="v2-icon-btn"
        >
          <ChevronLeft size={20} className="text-accent-strong dark:text-accent" />
        </button>
        <div className="flex items-center gap-2.5">
          <Shield size={24} className="text-accent-strong dark:text-accent" />
          <h1 className="text-2xl v2-display">Admin Paneli</h1>
        </div>
      </div>

      {/* Tab şeridi (Daxa segment/pill) — sığmazsa yatay-scroll. */}
      <AdminTabs className="mb-6" />

      {/* Error Message */}
      {error && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-xl border border-status-danger/40 bg-status-danger/10 text-status-danger text-sm"
        >
          {error}
        </div>
      )}

      {/* Users Section — Daxa kart (v2-card, çift tema). */}
      <div className="v2-card overflow-hidden">
        {/* Section Header — başlık + sayaç (sol), aksiyon butonu (sağ). */}
        <div className="flex items-center justify-between gap-3 p-5 border-b border-[rgb(var(--v2-border))]">
          <div className="flex items-center gap-2.5 min-w-0">
            <Users size={20} className="text-accent-strong dark:text-accent shrink-0" />
            <h2 className="text-lg font-semibold text-[rgb(var(--v2-ink))]">
              Kullanıcılar
            </h2>
            <span className="ml-1 text-sm text-[rgb(var(--v2-muted))]">
              ({users.length})
            </span>
          </div>
          {/* "Yeni Kullanıcı" SEKME DEĞİL → ayrı accent aksiyon butonu. */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="v2-btn v2-btn--accent v2-press shrink-0 px-4 py-2"
          >
            <Plus size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Yeni Kullanıcı</span>
            <span className="sm:hidden">Yeni</span>
          </button>
        </div>

        {/* User List */}
        {loading ? (
          <div className="p-8 text-center text-[rgb(var(--v2-muted))]">
            Yükleniyor...
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-[rgb(var(--v2-muted))]">
            Henüz kullanıcı yok
          </div>
        ) : (
          <ul className="divide-y divide-[rgb(var(--v2-border))]">
            {users.map((user) => {
              const isAdmin = user.role === "admin";
              const initials =
                user.full_name
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2) || "?";
              return (
                <li
                  key={user.id}
                  className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-[rgb(var(--v2-sunken))] group"
                >
                  {/* User Info */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Avatar */}
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0",
                        isAdmin
                          ? "bg-accent/16 text-accent-strong dark:text-accent"
                          : "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))]",
                      )}
                      aria-hidden="true"
                    >
                      {initials}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-[rgb(var(--v2-ink))] text-sm truncate">
                          {user.full_name}
                        </p>
                        {!user.is_active && (
                          <span className="px-2 py-0.5 text-xs rounded-full border border-status-danger/40 bg-status-danger/10 text-status-danger whitespace-nowrap">
                            Pasif
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[rgb(var(--v2-muted))] truncate">
                        @{user.username}
                      </p>
                    </div>
                  </div>

                  {/* Role + Businesses + Actions */}
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Role badge (Daxa: accent=admin / nötr=viewer) */}
                    <span
                      className={cn(
                        "hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium",
                        isAdmin
                          ? "bg-accent/16 text-accent-strong dark:text-accent"
                          : "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] border border-[rgb(var(--v2-border))]",
                      )}
                    >
                      {getRoleLabel(user.role)}
                    </span>

                    {/* Business count */}
                    <div className="hidden md:flex items-center gap-1.5 text-xs text-[rgb(var(--v2-muted))]">
                      <Building2 size={14} aria-hidden="true" />
                      <span className="whitespace-nowrap">
                        {isAdmin
                          ? "Tümü"
                          : `${user.business_names?.length || 0} işletme`}
                      </span>
                    </div>

                    {/* Actions — a11y: her zaman görünür (opacity-0 değil),
                        hover'da hafif vurgulanır. Mobilde dokunulabilir. */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="p-2 rounded-lg transition-colors hover:bg-[rgb(var(--v2-card))]"
                        title="Düzenle"
                        aria-label={`${user.full_name} düzenle`}
                      >
                        <Pencil size={15} className="text-[rgb(var(--v2-muted))] group-hover:text-[rgb(var(--v2-ink))]" />
                      </button>
                      {!isAdmin && (
                        <button
                          onClick={() => setDeleteConfirm(user)}
                          className="p-2 rounded-lg transition-colors hover:bg-status-danger/12"
                          title="Sil"
                          aria-label={`${user.full_name} sil`}
                        >
                          <Trash2 size={15} className="text-status-danger" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
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
          <div className="v2-card p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-[rgb(var(--v2-ink))] mb-2">
              Kullanıcıyı Sil
            </h3>
            <p className="text-[rgb(var(--v2-muted))] text-sm mb-6">
              <span className="text-[rgb(var(--v2-ink))] font-medium">
                {deleteConfirm.full_name}
              </span>{" "}
              adlı kullanıcıyı silmek istediğinize emin misiniz? Bu işlem geri
              alınamaz.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 v2-sunken hover:border-accent/50 text-[rgb(var(--v2-ink))] rounded-xl text-sm font-medium transition-colors"
              >
                İptal
              </button>
              <button
                onClick={() => handleDeleteUser(deleteConfirm.id)}
                className="flex-1 px-4 py-2.5 bg-status-danger hover:opacity-90 text-white rounded-xl text-sm font-medium transition-opacity"
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

"use client";

/**
 * v1.7.x WP 8b961444 TODO cc5fc4f3: Per-firm user access modal (admin-only).
 *
 * Liste: erişimi olan user'lar (+ Kaldır).
 * + Kullanıcı Ekle → sub-modal (search + checkbox + Toplu Seç).
 * Toplu Seç: bir referans firmanın user listesini otomatik check.
 * Tüm Erişimleri Temizle.
 */

import { useEffect, useMemo, useState } from "react";
import { X, Plus, Loader2, ShieldCheck, Trash2, Users, Search, AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { toast } from "@/lib/toast";
import type { AdminUser, MyCompany, MyCompanyAccessUser } from "@/types";

interface Props {
  firm: MyCompany;
  /** Bulk-select için referans liste (admin sayfası tarafından sağlanır). */
  allFirms: MyCompany[];
  onClose: () => void;
}

export function FirmAccessModal({ firm, allFirms, onClose }: Props) {
  const [access, setAccess] = useState<MyCompanyAccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api.get<MyCompanyAccessUser[]>(`/firms/${firm.id}/access/users`);
      setAccess(r || []);
      setSelected(new Set());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erişim listesi yüklenemedi");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, [firm.id]);

  async function revokeSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await api.post(`/firms/${firm.id}/access/users/bulk-revoke`, {
        user_ids: Array.from(selected),
      });
      toast.success("Yetki güncellendi");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kaldırma başarısız");
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    setBusy(true);
    try {
      await api.post(`/firms/${firm.id}/access/clear`, {});
      toast.success("Yetki güncellendi");
      setConfirmClear(false);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Temizleme başarısız");
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function revokeOne(userId: string) {
    setBusy(true);
    try {
      await api.delete(`/firms/${firm.id}/access/users/${userId}`);
      toast.success("Yetki güncellendi");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kaldırma başarısız");
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  }

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="v2-card w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
      >
        <div className="modal-header">
          <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))] flex items-center gap-2">
            <ShieldCheck size={16} className="text-accent-strong dark:text-accent" />
            Erişim Yönet — {firm.legal_name}
          </h3>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 size={20} className="animate-spin text-[rgb(var(--v2-muted))]" />
            </div>
          ) : access.length === 0 ? (
            <div className="p-6 text-center text-xs text-[rgb(var(--v2-muted))] border border-[rgb(var(--v2-border))] rounded-xl">
              Henüz erişim verilmedi. Sadece adminler bu firmayı görüyor.
            </div>
          ) : (
            <div className="rounded-xl border border-[rgb(var(--v2-border))] divide-y divide-[rgb(var(--v2-border))]">
              {access.map((u) => {
                const checked = selected.has(u.user_id);
                return (
                  <div key={u.access_id}
                       className={cn("px-3 py-2 flex items-center gap-2 text-xs",
                                     checked && "bg-[rgb(var(--accent))]/10")}>
                    <input type="checkbox" checked={checked}
                      onChange={() => toggleSelected(u.user_id)} />
                    <div className="w-7 h-7 rounded-full v2-sunken flex items-center justify-center shrink-0 text-[10px] uppercase font-bold text-[rgb(var(--v2-muted))]">
                      {(u.full_name || u.username).charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[rgb(var(--v2-ink))] truncate">
                        {u.full_name || u.username}
                        <span className="text-[rgb(var(--v2-muted))] ml-1.5">@{u.username}</span>
                      </p>
                      <p className="text-[10px] text-[rgb(var(--v2-muted))]">
                        {u.granted_by_username ? `${u.granted_by_username} verdi · ` : ""}
                        {new Date(u.granted_at).toLocaleDateString("tr-TR", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </p>
                    </div>
                    <button onClick={() => revokeOne(u.user_id)} disabled={busy}
                      className="p-1.5 rounded-md text-[rgb(var(--v2-muted))] hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50"
                      title="Erişimi kaldır">
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer flex-wrap">
          <button type="button" onClick={() => setShowAdd(true)} disabled={busy}
            className="px-3 py-2 rounded-xl bg-[rgb(var(--v2-ink))] text-[rgb(var(--v2-card))] hover:opacity-90 text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
            <Plus size={14} /> Kullanıcı Ekle
          </button>
          {selected.size > 0 && (
            <button type="button" onClick={revokeSelected} disabled={busy}
              className="px-3 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-700 dark:text-red-300 text-sm font-semibold inline-flex items-center gap-1.5 border border-red-500/30 disabled:opacity-50">
              <Trash2 size={14} /> Seçilenleri Kaldır ({selected.size})
            </button>
          )}
          {access.length > 0 && (
            <button type="button" onClick={() => setConfirmClear(true)} disabled={busy}
              className="ml-auto btn-secondary px-3 py-2 text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
              Tüm Erişimleri Temizle
            </button>
          )}
        </div>
      </div>
    </div>

    {showAdd && (
      <AddUsersSubmodal
        firm={firm}
        allFirms={allFirms}
        existing={new Set(access.map((a) => a.user_id))}
        onClose={() => setShowAdd(false)}
        onAdded={() => { setShowAdd(false); void refresh(); }}
      />
    )}

    {confirmClear && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
           onClick={() => setConfirmClear(false)}>
        <div onClick={(e) => e.stopPropagation()}
             className="v2-card border border-red-500/30 max-w-sm w-full p-5">
          <h4 className="text-base font-semibold text-[rgb(var(--v2-ink))] mb-2">Tüm erişimleri temizle</h4>
          <p className="text-sm text-[rgb(var(--v2-muted))] mb-4">
            <strong>{firm.legal_name}</strong> firmasının {access.length} kullanıcı erişimi tamamen
            kaldırılacak. Bu işlem geri alınamaz. Sadece adminler firmaya erişebilir.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmClear(false)} disabled={busy}
              className="btn-secondary flex-1 py-2 text-sm">
              Vazgeç
            </button>
            <button onClick={clearAll} disabled={busy}
              className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Temizle
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ── Add Users Sub-Modal ────────────────────────────────────────

function AddUsersSubmodal({
  firm, allFirms, existing, onClose, onAdded,
}: {
  firm: MyCompany;
  allFirms: MyCompany[];
  existing: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [referenceFirmId, setReferenceFirmId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<AdminUser[]>("/admin/users")
      .then((r) => setUsers((r || []).filter((u) => u.role !== "admin"))) // adminler zaten görür
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function applyBulkSelect() {
    if (!referenceFirmId) return;
    try {
      const r = await api.get<{ user_ids: string[] }>(`/firms/${referenceFirmId}/access/users/ids`);
      setChecked(new Set(r.user_ids || []));
    } catch {
      setError("Referans firma listesi alınamadı");
    }
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return users;
    const q = query.toLocaleLowerCase("tr");
    return users.filter((u) =>
      u.username.toLocaleLowerCase("tr").includes(q) ||
      (u.full_name || "").toLocaleLowerCase("tr").includes(q));
  }, [users, query]);

  function toggle(uid: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const newUserIds = Array.from(checked).filter((id) => !existing.has(id));
      if (newUserIds.length === 0) {
        setError("Seçilen kullanıcılar zaten erişime sahip");
        setSubmitting(false);
        return;
      }
      await api.post(`/firms/${firm.id}/access/users`, { user_ids: newUserIds });
      toast.success("Yetki güncellendi");
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ekleme başarısız");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
         onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           className="v2-card w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col shadow-xl">
        <div className="modal-header">
          <h4 className="text-base font-semibold text-[rgb(var(--v2-ink))] flex items-center gap-2">
            <Users size={16} className="text-accent-strong dark:text-accent" /> Kullanıcı Ekle
          </h4>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs">
              {error}
            </div>
          )}

          {/* Bulk-select referans */}
          {allFirms.length > 1 && (
            <div className="p-3 rounded-xl v2-sunken border border-[rgb(var(--v2-border))]">
              <p className="text-[11px] text-[rgb(var(--v2-muted))] mb-1.5">
                Toplu seç: başka bir firmanın user listesini referans al
              </p>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <DarkSelect
                    value={referenceFirmId}
                    onChange={setReferenceFirmId}
                    placeholder="Referans firma seç"
                    searchable={allFirms.length > 6}
                    options={allFirms
                      .filter((f) => f.id !== firm.id)
                      .map((f) => ({ value: f.id, label: f.legal_name }))}
                  />
                </div>
                <button type="button" onClick={applyBulkSelect}
                  disabled={!referenceFirmId}
                  className="px-3 py-2 rounded-xl bg-[rgb(var(--v2-ink))] text-[rgb(var(--v2-card))] hover:opacity-90 text-xs font-semibold disabled:opacity-50 whitespace-nowrap">
                  Uygula
                </button>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[rgb(var(--v2-muted))]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Kullanıcı ara…"
              className="field field-sm py-2 pl-7 pr-2" />
          </div>

          {/* User list */}
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 size={18} className="animate-spin text-[rgb(var(--v2-muted))]" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-[rgb(var(--v2-muted))] text-center py-4">Kullanıcı bulunamadı</p>
          ) : (
            <div className="rounded-xl border border-[rgb(var(--v2-border))] divide-y divide-[rgb(var(--v2-border))] max-h-64 overflow-y-auto">
              {filtered.map((u) => {
                const isExisting = existing.has(u.id);
                const isChecked = checked.has(u.id);
                return (
                  <label key={u.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-xs cursor-pointer",
                      isExisting && "opacity-50 cursor-not-allowed",
                      isChecked && !isExisting && "bg-[rgb(var(--accent))]/10",
                    )}>
                    <input type="checkbox" checked={isChecked || isExisting}
                      disabled={isExisting}
                      onChange={() => !isExisting && toggle(u.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[rgb(var(--v2-ink))] truncate">
                        {u.full_name || u.username}
                        <span className="text-[rgb(var(--v2-muted))] ml-1.5">@{u.username}</span>
                      </p>
                      {isExisting && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-300">Zaten erişimi var</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} disabled={submitting}
            className="btn-secondary flex-1 py-2.5 text-sm">
            Vazgeç
          </button>
          <button onClick={handleSubmit}
            disabled={submitting || checked.size === 0}
            className="flex-1 py-2.5 rounded-xl bg-[rgb(var(--v2-ink))] text-[rgb(var(--v2-card))] hover:opacity-90 text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Ekle ({checked.size})
          </button>
        </div>
      </div>
    </div>
  );
}

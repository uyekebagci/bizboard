"use client";

/**
 * v1.6.23.22 (UI Fix WP TODO 9fff2618): Banka Hesapları (eski "Hesap Havuzu").
 * v1.6.23.25 (UI Fix WP TODO 9b3dcd5b + e9a619e3 + 5f82395a): Kasa hiyerarşisi
 *   + "+ Yeni Hesap" modal + MAIN_CASH visual lock + SUB_CASH full CRUD.
 *
 * <p>Tip enum: CHECKING / SAVINGS / MAIN_CASH (auto/unique/silinmez) /
 * SUB_CASH (manuel CRUD) / CASH_HOLDER (Beta v1.1: standalone,
 * holder_name zorunlu; counterpart bağı kaldırıldı — WP 2786a36e).</p>
 */

import { useEffect, useMemo, useState } from "react";
import {
  Loader2, AlertTriangle, Wallet, Banknote, Building2, HandCoins,
  ToggleLeft, ToggleRight, X, Search, Plus, Trash2, Lock, Scale,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useAppStore } from "@/lib/store";
import type { BankAccountListItem, BankAccountType } from "@/types";
import { BankAccountDetailModal } from "@/components/bank/BankAccountDetailModal";
import { BankAccountCreateForm } from "@/components/bank/BankAccountCreateForm";
import { AdjustBalanceModal } from "@/components/bank/AdjustBalanceModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListSkeleton } from "@/components/shared/Skeleton";

/**
 * Bankalar WP (bakiye düzeltme): doğrudan bakiyesi tutulan (düzeltilebilir)
 * tipler. MAIN_CASH/SUB_CASH aggregate'tir — kendi bakiyesi yok, düzeltilemez.
 */
const ADJUSTABLE_TYPES: ReadonlyArray<BankAccountType> = ["CHECKING", "SAVINGS", "CASH_HOLDER"];

type TypeFilter = "ALL" | "BANK" | "KASA" | "CASH_HOLDER";
const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "ALL",         label: "Tümü" },
  { key: "BANK",        label: "Banka" },
  { key: "KASA",        label: "Kasa" },         // MAIN_CASH + SUB_CASH
  { key: "CASH_HOLDER", label: "Kişide" },
];

export default function HesaplarPage() {
  // Bankalar WP (bakiye düzeltme): admin-only aksiyon görünürlüğü.
  const profile = useAppStore((s) => s.profile);
  const isAdmin = profile?.role === "admin";

  const [list, setList] = useState<BankAccountListItem[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ account: BankAccountListItem; active: boolean; force?: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BankAccountListItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailAccount, setDetailAccount] = useState<BankAccountListItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Bankalar WP: bakiye düzeltme modal hedefi (null = kapalı).
  const [adjustTarget, setAdjustTarget] = useState<BankAccountListItem | null>(null);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [businessFilter, setBusinessFilter] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api.get<BankAccountListItem[]>(
        showInactive ? "/bank-accounts?include_inactive=true" : "/bank-accounts",
      );
      setList(r || []);
      setError(null);
    } catch (err) {
      logger.error("api", "bank-accounts fetch failed", undefined, err);
      setError("Hesap listesi yuklenemedi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, [showInactive]);

  async function toggleActive(a: BankAccountListItem, force = false) {
    setBusyId(a.id);
    try {
      await api.patch(`/bank-accounts/${a.id}/active`, {
        is_active: !a.is_active,
        force,
      });
      toast.success(!a.is_active ? "Hesap aktifleştirildi" : "Hesap pasifleştirildi");
      setConfirmAction(null);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConfirmAction({ account: a, active: !a.is_active, force: true });
      } else {
        logger.error("api", "bank-account toggle failed", { id: a.id }, err);
        toast.error(err);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAccount(a: BankAccountListItem) {
    setBusyId(a.id);
    try {
      await api.delete(`/bank-accounts/${a.id}`);
      toast.info("Hesap silindi");
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Silinemedi";
      setError(msg);
      logger.error("api", "bank-account delete failed", { id: a.id }, err);
      toast.error(err);
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((a) => {
      if (typeFilter !== "ALL") {
        if (typeFilter === "BANK" && a.type !== "CHECKING" && a.type !== "SAVINGS") return false;
        if (typeFilter === "KASA" && a.type !== "MAIN_CASH" && a.type !== "SUB_CASH") return false;
        if (typeFilter === "CASH_HOLDER" && a.type !== "CASH_HOLDER") return false;
      }
      if (businessFilter && a.business_id !== businessFilter) return false;
      if (q) {
        const hay = [a.name, a.bank_name, a.iban, a.holder_person_name, a.business_name]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [list, query, typeFilter, businessFilter]);

  const businesses = useMemo(() => {
    const map = new Map<string, string>();
    list.forEach((a) => {
      if (a.business_id && a.business_name) map.set(a.business_id, a.business_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [list]);

  // MAIN_CASH her zaman en üstte (her business için)
  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      // Önce business name (gruplama), sonra type (MAIN_CASH üstte), sonra name
      const bn = (a.business_name || "").localeCompare(b.business_name || "");
      if (bn !== 0) return bn;
      const typeRank = (t: string) => t === "MAIN_CASH" ? 0 : t === "SUB_CASH" ? 1 : 2;
      const tr = typeRank(a.type) - typeRank(b.type);
      if (tr !== 0) return tr;
      return a.name.localeCompare(b.name);
    });
  }, [filtered]);

  const activeFiltered = filtered.filter((a) => a.is_active);
  const inactiveFiltered = filtered.filter((a) => !a.is_active);
  // v1.7.0.x (BUG fix): SUB_CASH ve MAIN_CASH'in current_balance'ı assigned
  // bank'lerin aggregate'idir — bunlar zaten CHECKING/SAVINGS/CASH_HOLDER
  // satırlarında ayrı sayılıyor. Topluya katarsak çift sayım olur. Sub-cash
  // INVARIANT: Σ sub.aggregate + unassigned.aggregate == MAIN.aggregate
  // (TODO 73dd2694). Toplam yalnız fiziksel para tutan satırlardan hesaplanır.
  const PHYSICAL_TYPES: ReadonlyArray<BankAccountType> = ["CHECKING", "SAVINGS", "CASH_HOLDER"];
  const physicalActive = activeFiltered.filter((a) => PHYSICAL_TYPES.includes(a.type));
  const physicalInactive = inactiveFiltered.filter((a) => PHYSICAL_TYPES.includes(a.type));
  const totalActive = physicalActive.reduce((sum, a) => sum + (a.current_balance || 0), 0);

  return (
    <div className="space-y-5 pb-24">
      {/* Header — UX-07 paylaşılan PageHeader. */}
      <PageHeader
        title="Banka Hesapları"
        subtitle="Banka + kasa + kişide tutulan — tüm hesaplarınız tek panelde"
        icon={Wallet}
        actions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="v2-btn v2-btn--ink v2-press inline-flex items-center gap-1.5 text-sm"
          >
            <Plus size={14} aria-hidden="true" />
            Yeni Hesap
          </button>
        }
      />

      {/* Stats */}
      <section className="grid grid-cols-3 gap-3">
        <div className="v2-card p-3">
          <p className="v2-eyebrow text-[10px]">Aktif Hesap</p>
          <p className="mt-1 text-lg font-bold text-[rgb(var(--v2-ink))]">{physicalActive.length}</p>
        </div>
        <div className="v2-card p-3">
          <p className="v2-eyebrow text-[10px]">Pasif Hesap</p>
          <p className="mt-1 text-lg font-bold text-[rgb(var(--v2-muted))]">{physicalInactive.length}</p>
        </div>
        <div className="v2-card p-3">
          <p className="v2-eyebrow text-[10px]">Toplam Bakiye</p>
          <p className="mt-1 text-lg font-bold text-accent-strong dark:text-accent">
            {formatCurrency(totalActive, "TRY")}
          </p>
        </div>
      </section>

      {/* Search + filter row */}
      <section className="space-y-2.5">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--v2-muted))]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hesap adı, banka, IBAN, kişi veya işletme ara…"
            className="w-full py-2 pl-9 pr-3 rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-sm text-[rgb(var(--v2-ink))] placeholder:text-[rgb(var(--v2-muted))] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-[rgb(var(--v2-sunken))]"
              aria-label="Aramayı temizle"
            >
              <X size={12} className="text-[rgb(var(--v2-muted))]" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              aria-pressed={typeFilter === f.key}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                typeFilter === f.key
                  ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold"
                  : "v2-sunken text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {businesses.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setBusinessFilter(null)}
              aria-pressed={businessFilter === null}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                businessFilter === null
                  ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold"
                  : "v2-sunken text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]",
              )}
            >
              Tüm İşletmeler
            </button>
            {businesses.map((b) => (
              <button
                key={b.id}
                onClick={() => setBusinessFilter(b.id)}
                aria-pressed={businessFilter === b.id}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                  businessFilter === b.id
                    ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold"
                    : "v2-sunken text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]",
                )}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}

        <label className="flex items-center gap-1.5 text-xs text-[rgb(var(--v2-muted))]">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="accent-accent"
          />
          Pasif hesapları göster
        </label>
      </section>

      {error && (
        <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-status-danger text-sm flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto -mr-1 p-0.5 hover:bg-status-danger/20 rounded">
            <X size={12} />
          </button>
        </div>
      )}

      {loading ? (
        // UX-08: ilk yükleme = skeleton (spinner yerine).
        <ListSkeleton rows={6} />
      ) : sortedFiltered.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={list.length === 0 ? "Henüz hesap eklenmemiş" : "Filtreyle eşleşen hesap yok"}
          action={
            list.length > 0 && (query || typeFilter !== "ALL" || businessFilter) ? (
              <button
                onClick={() => { setQuery(""); setTypeFilter("ALL"); setBusinessFilter(null); }}
                className="text-xs text-accent-strong dark:text-accent hover:opacity-80"
              >
                Filtreleri temizle
              </button>
            ) : undefined
          }
        />
      ) : (
        <section className="v2-card divide-y divide-[rgb(var(--v2-border))]">
          {sortedFiltered.map((a) => {
            const isMain = a.is_main_cash || a.type === "MAIN_CASH";
            const isSystem = a.is_system === true;
            // v1.6.23.27 (UI Fix WP TODO 7b6258b8): MAIN_CASH ve sistem hesapları (Genel Nakit) lock'lu.
            const canDelete = (a.is_user_deletable ?? !isMain) && !isSystem;
            const isLocked = isMain || isSystem;
            return (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailAccount(a)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDetailAccount(a);
                  }
                }}
                className={cn(
                  "p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-[rgb(var(--v2-sunken))] transition-colors focus:outline-none focus:ring-1 focus:ring-accent/50",
                  !a.is_active && "opacity-50",
                  isMain && "bg-status-warning/[0.04]",
                  isSystem && !isMain && "bg-purple-500/[0.04]",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AccountTypeBadge type={a.type} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[rgb(var(--v2-ink))] truncate flex items-center gap-1.5">
                      {a.name}
                      {isLocked && (
                        <Lock size={11} className={cn(
                          "shrink-0",
                          isMain ? "text-status-warning/70" : "text-purple-300/70",
                        )} />
                      )}
                    </p>
                    <p className="text-[11px] text-[rgb(var(--v2-muted))] truncate">
                      {isSystem
                        ? "Sistem hesabı (otomatik yaratılır, silinemez)"
                        : a.type === "CASH_HOLDER" && a.holder_person_name
                        ? `Kişide: ${a.holder_person_name}`
                        : isMain
                        ? "Otomatik yaratılır, silinemez"
                        : a.bank_name || "—"}
                      {a.iban && <> · {a.iban}</>}
                      {a.business_name && <> · {a.business_name}</>}
                      {a.owner_my_company_name && <> · 🏢 {a.owner_my_company_name}</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-sm font-semibold text-[rgb(var(--v2-ink))]">
                    {formatCurrency(a.current_balance, a.currency || "TRY")}
                  </p>
                  {/* Bankalar WP: bakiye düzelt — yalnız admin + bakiyesi tutulan tipler. */}
                  {isAdmin && ADJUSTABLE_TYPES.includes(a.type) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAdjustTarget(a);
                      }}
                      disabled={busyId === a.id}
                      className="p-1 rounded-md text-[rgb(var(--v2-muted))] hover:bg-accent/10 hover:text-accent-strong dark:hover:text-accent transition-colors"
                      title="Bakiyeyi düzelt (mutabakat)"
                      aria-label="Bakiyeyi düzelt"
                    >
                      <Scale size={16} />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (a.is_active && (a.current_balance ?? 0) !== 0) {
                        setConfirmAction({ account: a, active: false });
                      } else {
                        void toggleActive(a);
                      }
                    }}
                    disabled={busyId === a.id}
                    className={cn(
                      "p-1 rounded-md transition-colors",
                      a.is_active ? "text-accent-strong dark:text-accent hover:bg-accent/10" : "text-[rgb(var(--v2-muted))] hover:bg-[rgb(var(--v2-sunken))]",
                    )}
                    title={a.is_active ? "Pasif yap" : "Aktif yap"}
                    aria-label={a.is_active ? "Pasif yap" : "Aktif yap"}
                  >
                    {busyId === a.id ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : a.is_active ? (
                      <ToggleRight size={24} />
                    ) : (
                      <ToggleLeft size={24} />
                    )}
                  </button>
                  {canDelete ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(a);
                      }}
                      disabled={busyId === a.id}
                      className="p-1 rounded-md text-[rgb(var(--v2-muted))] hover:bg-status-danger/10 hover:text-status-danger transition-colors"
                      title="Sil"
                      aria-label="Sil"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <span
                      className="p-1 rounded-md text-[rgb(var(--v2-muted))]/60 cursor-not-allowed"
                      title={isSystem ? "Sistem hesabı silinemez (Genel Nakit)" : "Ana Kasa silinemez"}
                    >
                      <Lock size={16} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {confirmAction && (
        <ConfirmToggleModal
          account={confirmAction.account}
          deactivate={!confirmAction.active}
          force={confirmAction.force}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => toggleActive(confirmAction.account, true)}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          account={deleteTarget}
          busy={busyId === deleteTarget.id}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteAccount(deleteTarget)}
        />
      )}

      {showCreateModal && (
        <CreateBankAccountModal
          businesses={businesses}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); void refresh(); }}
        />
      )}

      <BankAccountDetailModal
        account={detailAccount}
        onClose={() => setDetailAccount(null)}
        // v1.6.23.27: SUB_CASH assignment değişince havuz listesini de yenile
        // (aggregate balance UI'da yansır).
        onChange={() => { void refresh(); }}
      />

      {/* Bankalar WP: admin-only bakiye düzeltme modalı (portal'lı). */}
      <AdjustBalanceModal
        account={adjustTarget}
        onClose={() => setAdjustTarget(null)}
        onAdjusted={() => { setAdjustTarget(null); void refresh(); }}
      />
    </div>
  );
}

function AccountTypeBadge({ type }: { type: BankAccountType }) {
  const map: Record<BankAccountType, { label: string; cls: string; icon: typeof Wallet }> = {
    CHECKING:    { label: "Banka",     cls: "bg-blue-500/15 text-blue-300 border-blue-500/30",         icon: Building2 },
    SAVINGS:     { label: "Vadeli",    cls: "bg-purple-500/15 text-purple-300 border-purple-500/30",   icon: Building2 },
    MAIN_CASH:   { label: "Ana Kasa",  cls: "bg-status-warning/15 text-status-warning border-status-warning/40", icon: Banknote },
    SUB_CASH:    { label: "Alt Kasa",  cls: "bg-accent/15 text-accent-strong dark:text-accent border-accent/30", icon: Banknote },
    CASH_HOLDER: { label: "Kişide",    cls: "bg-orange-500/15 text-orange-300 border-orange-500/30",   icon: HandCoins },
  };
  const m = map[type] ?? { label: type, cls: "v2-sunken text-[rgb(var(--v2-muted))]", icon: Wallet };
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] border ${m.cls}`}>
      <Icon size={10} />
      {m.label}
    </span>
  );
}

function ConfirmToggleModal({
  account, deactivate, force, onClose, onConfirm,
}: {
  account: BankAccountListItem;
  deactivate: boolean;
  force?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="v2-card shadow-v2-hover w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))]">
            {deactivate ? "Hesabı pasif yap" : "Hesabı aktif yap"}
          </h3>
          <button onClick={onClose} className="v2-icon-btn v2-press w-8 h-8" aria-label="Kapat">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-[rgb(var(--v2-muted))]">
          <strong className="text-[rgb(var(--v2-ink))]">{account.name}</strong>
          {force && (account.current_balance ?? 0) !== 0 && (
            <> hesabının bakiyesi <strong className="text-status-danger">
              {formatCurrency(account.current_balance, account.currency || "TRY")}
            </strong> — 0 değil. Yine de devam etmek istediğinden emin misin?</>
          )}
          {!force && deactivate && (
            <> hesabı pasif yapılacak. Master listede gizlenecek; tx referansları korunur.</>
          )}
          {!deactivate && <> hesabı tekrar aktif yapılacak.</>}
        </p>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl v2-sunken hover:border-accent/50 v2-press text-[rgb(var(--v2-ink))] text-sm transition-colors"
          >
            Vazgec
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "flex-1 px-4 py-2 rounded-xl text-sm font-semibold v2-press transition-all",
              deactivate ? "bg-status-danger text-white hover:opacity-90" : "bg-accent text-accent-ink hover:opacity-90",
            )}
          >
            {deactivate ? "Pasif Yap" : "Aktif Yap"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({
  account, busy, onClose, onConfirm,
}: {
  account: BankAccountListItem;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  // v1.6.23.27 (UI Fix WP TODO 78596760): SUB_CASH siliniyorsa kullanıcıya
  // "X assignment Ana Kasa'ya iade edilecek" uyarısı göster.
  const [assignmentCount, setAssignmentCount] = useState<number | null>(null);
  useEffect(() => {
    if (account.type !== "SUB_CASH") return;
    api.get<{ assignments: { id: string }[] }>(`/bank-accounts/${account.id}/sub-cash-detail?tx_limit=0`)
      .then((d) => setAssignmentCount(d.assignments?.length ?? 0))
      .catch(() => setAssignmentCount(0));
  }, [account]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="v2-card shadow-v2-hover !border-status-danger/30 w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))] flex items-center gap-2">
            <Trash2 size={16} className="text-status-danger" />
            {account.type === "SUB_CASH" ? "Alt Kasayı sil" : "Hesabı sil"}
          </h3>
          <button onClick={onClose} disabled={busy} className="v2-icon-btn v2-press w-8 h-8" aria-label="Kapat">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-[rgb(var(--v2-muted))]">
          <strong className="text-[rgb(var(--v2-ink))]">{account.name}</strong> hesabını kalıcı olarak silmek
          istediğine emin misin? Bağlı işlem varsa silinemez; önce pasif yapmanı öneririz.
        </p>
        {account.type === "SUB_CASH" && assignmentCount !== null && assignmentCount > 0 && (
          <p className="mt-3 p-2.5 rounded-lg bg-status-warning/10 border border-status-warning/30 text-status-warning text-xs">
            ⚠ Bu alt kasada <strong>{assignmentCount}</strong> entity atalı.
            Silersen tüm atamalar kaldırılır ve entity'ler Ana Kasa'ya iade olur
            (entity verisi silinmez).
          </p>
        )}
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2 rounded-xl v2-sunken hover:border-accent/50 v2-press text-[rgb(var(--v2-ink))] text-sm transition-colors disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 px-4 py-2 rounded-xl bg-status-danger hover:opacity-90 v2-press disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Sil
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── CREATE MODAL (v1.6.23.25 / TODO 9b3dcd5b) ───────────────────────

/**
 * v1.6.23.26: form mantığı reusable {@link BankAccountCreateForm}
 * component'ine taşındı. Bu modal sadece frame.
 */
function CreateBankAccountModal({
  businesses, onClose, onCreated,
}: {
  businesses: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="v2-card shadow-v2-hover w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--v2-border))]">
          <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))] flex items-center gap-2">
            <Plus size={16} className="text-accent-strong dark:text-accent" />
            Yeni Hesap
          </h3>
          <button type="button" onClick={onClose} className="v2-icon-btn v2-press w-8 h-8" aria-label="Kapat">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">
          <BankAccountCreateForm
            businesses={businesses}
            mode="ANY"
            onCancel={onClose}
            onCreated={onCreated}
          />
        </div>
      </div>
    </div>
  );
}

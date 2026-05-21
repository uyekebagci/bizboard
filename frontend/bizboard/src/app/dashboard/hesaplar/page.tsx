"use client";

/**
 * v1.6.23.22 (UI Fix WP TODO 9fff2618): Banka Hesapları (eski "Hesap Havuzu").
 * v1.6.23.25 (UI Fix WP TODO 9b3dcd5b + e9a619e3 + 5f82395a): Kasa hiyerarşisi
 *   + "+ Yeni Hesap" modal + MAIN_CASH visual lock + SUB_CASH full CRUD.
 *
 * <p>Tip enum: CHECKING / SAVINGS / MAIN_CASH (auto/unique/silinmez) /
 * SUB_CASH (manuel CRUD) / CASH_HOLDER (holder_person_id zorunlu).</p>
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, AlertTriangle, Wallet, Banknote, Building2, HandCoins,
  ToggleLeft, ToggleRight, X, Search, Plus, Trash2, Lock,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, cn } from "@/lib/utils";
import type { BankAccountListItem, BankAccountType } from "@/types";
import { BankAccountDetailModal } from "@/components/bank/BankAccountDetailModal";
import { BankAccountCreateForm } from "@/components/bank/BankAccountCreateForm";

type TypeFilter = "ALL" | "BANK" | "KASA" | "CASH_HOLDER";
const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "ALL",         label: "Tümü" },
  { key: "BANK",        label: "Banka" },
  { key: "KASA",        label: "Kasa" },         // MAIN_CASH + SUB_CASH
  { key: "CASH_HOLDER", label: "Kişide" },
];

export default function HesaplarPage() {
  const router = useRouter();

  const [list, setList] = useState<BankAccountListItem[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ account: BankAccountListItem; active: boolean; force?: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BankAccountListItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailAccount, setDetailAccount] = useState<BankAccountListItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

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
      setConfirmAction(null);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConfirmAction({ account: a, active: !a.is_active, force: true });
      } else {
        logger.error("api", "bank-account toggle failed", { id: a.id }, err);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAccount(a: BankAccountListItem) {
    setBusyId(a.id);
    try {
      await api.delete(`/bank-accounts/${a.id}`);
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Silinemedi";
      setError(msg);
      logger.error("api", "bank-account delete failed", { id: a.id }, err);
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
  const totalActive = activeFiltered.reduce((sum, a) => sum + (a.current_balance || 0), 0);

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
          >
            <ArrowLeft size={20} className="text-surface-300" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Banka Hesapları</h1>
            <p className="text-xs text-surface-400">
              Banka + kasa + kişide tutulan — tüm hesaplarınız tek panelde
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold shadow-sm"
        >
          <Plus size={14} />
          Yeni Hesap
        </button>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-3">
        <div className="card p-3">
          <p className="text-[10px] text-surface-400 uppercase">Aktif Hesap</p>
          <p className="mt-1 text-lg font-bold text-white">{activeFiltered.length}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-surface-400 uppercase">Pasif Hesap</p>
          <p className="mt-1 text-lg font-bold text-surface-400">{inactiveFiltered.length}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-surface-400 uppercase">Toplam Bakiye</p>
          <p className="mt-1 text-lg font-bold text-emerald-300">
            {formatCurrency(totalActive, "TRY")}
          </p>
        </div>
      </section>

      {/* Search + filter row */}
      <section className="space-y-2.5">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hesap adı, banka, IBAN, kişi veya işletme ara…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface-800 border border-surface-600 rounded-xl text-white placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-surface-700"
              aria-label="Aramayı temizle"
            >
              <X size={12} className="text-surface-400" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                typeFilter === f.key
                  ? "bg-brand-600 border-brand-500 text-white"
                  : "bg-surface-700 border-surface-600 text-surface-300 hover:text-white",
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
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                businessFilter === null
                  ? "bg-surface-500 border-surface-400 text-white"
                  : "bg-surface-700 border-surface-600 text-surface-300 hover:text-white",
              )}
            >
              Tüm İşletmeler
            </button>
            {businesses.map((b) => (
              <button
                key={b.id}
                onClick={() => setBusinessFilter(b.id)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                  businessFilter === b.id
                    ? "bg-indigo-500/20 border-indigo-400 text-indigo-200"
                    : "bg-surface-700 border-surface-600 text-surface-300 hover:text-white",
                )}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}

        <label className="flex items-center gap-1.5 text-xs text-surface-300">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Pasif hesapları göster
        </label>
      </section>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto -mr-1 p-0.5 hover:bg-red-500/20 rounded">
            <X size={12} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-surface-400" />
        </div>
      ) : sortedFiltered.length === 0 ? (
        <div className="card p-8 text-center">
          <Wallet size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">
            {list.length === 0
              ? "Henüz hesap eklenmemiş"
              : "Filtreyle eşleşen hesap yok"}
          </p>
          {list.length > 0 && (query || typeFilter !== "ALL" || businessFilter) && (
            <button
              onClick={() => { setQuery(""); setTypeFilter("ALL"); setBusinessFilter(null); }}
              className="mt-3 text-xs text-brand-400 hover:text-brand-300"
            >
              Filtreleri temizle
            </button>
          )}
        </div>
      ) : (
        <section className="card divide-y divide-surface-700">
          {sortedFiltered.map((a) => {
            const isMain = a.is_main_cash || a.type === "MAIN_CASH";
            const canDelete = a.is_user_deletable ?? !isMain;
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
                  "p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-surface-700/40 transition-colors focus:outline-none focus:ring-1 focus:ring-brand-500/50",
                  !a.is_active && "opacity-50",
                  isMain && "bg-amber-500/[0.04]",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AccountTypeBadge type={a.type} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                      {a.name}
                      {isMain && (
                        <Lock size={11} className="text-amber-300/70 shrink-0" />
                      )}
                    </p>
                    <p className="text-[11px] text-surface-400 truncate">
                      {a.type === "CASH_HOLDER" && a.holder_person_name
                        ? `Kişide: ${a.holder_person_name}`
                        : isMain
                        ? "Otomatik yaratılır, silinemez"
                        : a.bank_name || "—"}
                      {a.iban && <> · {a.iban}</>}
                      {a.business_name && <> · {a.business_name}</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-sm font-semibold text-white">
                    {formatCurrency(a.current_balance, a.currency || "TRY")}
                  </p>
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
                      a.is_active ? "text-emerald-400 hover:bg-emerald-500/10" : "text-surface-400 hover:bg-surface-700",
                    )}
                    title={a.is_active ? "Pasif yap" : "Aktif yap"}
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
                      className="p-1 rounded-md text-surface-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                      title="Sil"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <span
                      className="p-1 rounded-md text-surface-600 cursor-not-allowed"
                      title="Ana Kasa silinemez"
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
      />
    </div>
  );
}

function AccountTypeBadge({ type }: { type: BankAccountType }) {
  const map: Record<BankAccountType, { label: string; cls: string; icon: typeof Wallet }> = {
    CHECKING:    { label: "Banka",     cls: "bg-blue-500/15 text-blue-300 border-blue-500/30",         icon: Building2 },
    SAVINGS:     { label: "Vadeli",    cls: "bg-purple-500/15 text-purple-300 border-purple-500/30",   icon: Building2 },
    MAIN_CASH:   { label: "Ana Kasa",  cls: "bg-amber-500/15 text-amber-300 border-amber-500/40",      icon: Banknote },
    SUB_CASH:    { label: "Alt Kasa",  cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: Banknote },
    CASH_HOLDER: { label: "Kişide",    cls: "bg-orange-500/15 text-orange-300 border-orange-500/30",   icon: HandCoins },
  };
  const m = map[type] ?? { label: type, cls: "bg-surface-700 text-surface-300 border-surface-600", icon: Wallet };
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
      <div className="bg-surface-800 rounded-2xl border border-surface-600 w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-white">
            {deactivate ? "Hesabı pasif yap" : "Hesabı aktif yap"}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-700">
            <X size={16} className="text-surface-400" />
          </button>
        </div>
        <p className="text-sm text-surface-300">
          <strong className="text-white">{account.name}</strong>
          {force && (account.current_balance ?? 0) !== 0 && (
            <> hesabının bakiyesi <strong className="text-red-300">
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
            className="flex-1 px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm"
          >
            Vazgec
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 rounded-xl text-white text-sm font-semibold ${
              deactivate ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-surface-800 rounded-2xl border border-red-500/30 w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Trash2 size={16} className="text-red-400" />
            Hesabı sil
          </h3>
          <button onClick={onClose} disabled={busy} className="p-1 rounded-lg hover:bg-surface-700">
            <X size={16} className="text-surface-400" />
          </button>
        </div>
        <p className="text-sm text-surface-300">
          <strong className="text-white">{account.name}</strong> hesabını kalıcı olarak silmek
          istediğine emin misin? Bağlı işlem varsa silinemez; önce pasif yapmanı öneririz.
        </p>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-surface-800 rounded-2xl border border-surface-600 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Plus size={16} className="text-brand-400" />
            Yeni Hesap
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-surface-700">
            <X size={16} className="text-surface-400" />
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

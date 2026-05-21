"use client";

/**
 * v1.6.22 (WP-5): Master account havuzu yönetim sayfası.
 *
 * Tüm bank_account'ları liste; aktif/pasif filter chip'leri; pasif olanlar
 * grileşir. Aktiflik toggle PATCH /bank-accounts/{id}/active. Pasif yapılırken
 * bakiye 0 değil bile {force=true} ile zorla geçilir (uyarı modal'ı).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, AlertTriangle, Wallet, Banknote, Building2, HandCoins,
  ToggleLeft, ToggleRight, X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { logger } from "@/lib/logger";
import { formatCurrency, cn } from "@/lib/utils";
import type { BankAccountListItem } from "@/types";
import { BankAccountDetailModal } from "@/components/bank/BankAccountDetailModal";

export default function HesapHavuzuPage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const isAdmin = profile?.role === "admin";

  const [list, setList] = useState<BankAccountListItem[]>([]);
  const [showInactive, setShowInactive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ account: BankAccountListItem; active: boolean; force?: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // v1.6.23.19 (UI Fix WP 8b961444): detay modal — satır tıklayınca açılır.
  const [detailAccount, setDetailAccount] = useState<BankAccountListItem | null>(null);

  useEffect(() => {
    if (profile && !isAdmin) router.replace("/dashboard");
  }, [profile, isAdmin, router]);

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
        // Bakiye 0 değil — force ile geç onayı iste
        setConfirmAction({ account: a, active: !a.is_active, force: true });
      } else {
        logger.error("api", "bank-account toggle failed", { id: a.id }, err);
      }
    } finally {
      setBusyId(null);
    }
  }

  const active = list.filter((a) => a.is_active);
  const inactive = list.filter((a) => !a.is_active);
  const totalActive = active.reduce((sum, a) => sum + (a.current_balance || 0), 0);

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
        >
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Hesap Havuzu</h1>
          <p className="text-xs text-surface-400">Tüm banka hesapları + kasa + kişide tutulan</p>
        </div>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-3">
        <div className="card p-3">
          <p className="text-[10px] text-surface-400 uppercase">Aktif Hesap</p>
          <p className="mt-1 text-lg font-bold text-white">{active.length}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-surface-400 uppercase">Pasif Hesap</p>
          <p className="mt-1 text-lg font-bold text-surface-400">{inactive.length}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-surface-400 uppercase">Toplam Bakiye</p>
          <p className="mt-1 text-lg font-bold text-emerald-300">
            {formatCurrency(totalActive, "TRY")}
          </p>
        </div>
      </section>

      <label className="flex items-center gap-1.5 text-xs text-surface-300">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        Pasif hesapları göster
      </label>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-surface-400" />
        </div>
      ) : list.length === 0 ? (
        <div className="card p-8 text-center">
          <Wallet size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Henüz hesap eklenmemiş</p>
        </div>
      ) : (
        <section className="card divide-y divide-surface-700">
          {list.map((a) => (
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
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <AccountTypeBadge type={a.type} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{a.name}</p>
                  <p className="text-[11px] text-surface-400 truncate">
                    {a.type === "CASH_HOLDER" && a.holder_person_name
                      ? `Kişide: ${a.holder_person_name}`
                      : a.bank_name || "—"}
                    {a.iban && <> · {a.iban}</>}
                    {a.business_name && <> · {a.business_name}</>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
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
              </div>
            </div>
          ))}
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

      {/* v1.6.23.19 (UI Fix WP 8b961444): detay modalı */}
      <BankAccountDetailModal
        account={detailAccount}
        onClose={() => setDetailAccount(null)}
      />
    </div>
  );
}

function AccountTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string; icon: typeof Wallet }> = {
    CHECKING:    { label: "Banka",   cls: "bg-blue-500/15 text-blue-300 border-blue-500/30",     icon: Building2 },
    SAVINGS:     { label: "Vadeli",  cls: "bg-purple-500/15 text-purple-300 border-purple-500/30", icon: Building2 },
    CASH:        { label: "Kasa",    cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: Banknote },
    CASH_HOLDER: { label: "Kişide",  cls: "bg-orange-500/15 text-orange-300 border-orange-500/30",   icon: HandCoins },
  };
  const m = map[type] || { label: type, cls: "bg-surface-700 text-surface-300 border-surface-600", icon: Wallet };
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

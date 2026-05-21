"use client";

/**
 * v1.6.23.22 (UI Fix WP TODO 9fff2618): Banka Hesapları (eski "Hesap Havuzu").
 *
 * <p>v1.6.23.19'da multi-tenant izolasyonu backend'de tamamlandı; v1.6.23.22'de
 * sayfa adminden çıkarılıp herkese açıldı (sidebar TODO cb3fa697). Bu sayfa
 * USER için sadece kendi tenant(lar)ındaki hesapları gösterir; ADMIN için tümü.</p>
 *
 * <p>Özellikler:</p>
 * <ul>
 *   <li>Arama: name / bank_name / iban / holder_person / business_name</li>
 *   <li>Tip filtresi: chip — Tümü / Banka (CHECKING+SAVINGS) / Kasa / Kişide</li>
 *   <li>İşletme filtresi: chip — kullanıcının erişebildiği businesses (1'den fazla
 *       ise gösterilir; tek tenant'ta gizlenir)</li>
 *   <li>Aktif/Pasif toggle</li>
 *   <li>Satır click → BankAccountDetailModal</li>
 * </ul>
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, AlertTriangle, Wallet, Banknote, Building2, HandCoins,
  ToggleLeft, ToggleRight, X, Search,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, cn } from "@/lib/utils";
import type { BankAccountListItem } from "@/types";
import { BankAccountDetailModal } from "@/components/bank/BankAccountDetailModal";

type TypeFilter = "ALL" | "BANK" | "CASH" | "CASH_HOLDER";
const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "ALL",         label: "Tümü" },
  { key: "BANK",        label: "Banka" },
  { key: "CASH",        label: "Kasa" },
  { key: "CASH_HOLDER", label: "Kişide" },
];

export default function HesaplarPage() {
  const router = useRouter();

  const [list, setList] = useState<BankAccountListItem[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ account: BankAccountListItem; active: boolean; force?: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailAccount, setDetailAccount] = useState<BankAccountListItem | null>(null);

  // v1.6.23.22: search + filter state
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

  // Filter list — search + type + business
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((a) => {
      // Type filter
      if (typeFilter !== "ALL") {
        if (typeFilter === "BANK" && a.type !== "CHECKING" && a.type !== "SAVINGS") return false;
        if (typeFilter === "CASH" && a.type !== "CASH") return false;
        if (typeFilter === "CASH_HOLDER" && a.type !== "CASH_HOLDER") return false;
      }
      // Business filter
      if (businessFilter && a.business_id !== businessFilter) return false;
      // Search
      if (q) {
        const hay = [
          a.name, a.bank_name, a.iban, a.holder_person_name, a.business_name,
        ].filter(Boolean).join(" ").toLowerCase();
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

  const activeFiltered = filtered.filter((a) => a.is_active);
  const inactiveFiltered = filtered.filter((a) => !a.is_active);
  const totalActive = activeFiltered.reduce((sum, a) => sum + (a.current_balance || 0), 0);

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
          <h1 className="text-xl font-bold text-white">Banka Hesapları</h1>
          <p className="text-xs text-surface-400">
            Banka + kasa + kişide tutulan — tüm hesaplarınız tek panelde
          </p>
        </div>
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
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-surface-400" />
        </div>
      ) : filtered.length === 0 ? (
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
          {filtered.map((a) => (
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

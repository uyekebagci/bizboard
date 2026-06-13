"use client";

/**
 * WP 2786a36e (Beta v1.1): "Elde Tutulan Nakitler" widget.
 *
 * <p>İşletme detay sayfasında Alt Kasalar widget'ının altında. Tüm
 * CASH_HOLDER bank_account'ları listeler — kişi adı + bakiye. Empty state
 * + CTA + "Ana Kasa'ya dahildir" şeffaflık uyarısı içerir.</p>
 *
 * <p>Endpoint: GET /businesses/{id}/cash-holders-summary</p>
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { UserCircle2, Wallet, Plus, ArrowRight, Info } from "lucide-react";
import { api } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { Widget } from "@/components/v2";
import { BankAccountCreateForm } from "@/components/bank/BankAccountCreateForm";

interface CashHolderItem {
  bank_account_id: string;
  holder_name: string | null;
  name: string;
  current_balance: number;
  last_tx_at: string | null;
}

interface CashHoldersSummary {
  items: CashHolderItem[];
  total_amount: number;
  total_count: number;
}

interface Props {
  businessId: string;
  /** Widget'ın bağlı olduğu business adı — create modal preselect için. */
  businessName?: string;
  onChange?: () => void;
}

export function CashHoldersWidget({ businessId, businessName, onChange }: Props) {
  const { refreshKey, triggerRefresh } = useAppStore();
  const [summary, setSummary] = useState<CashHoldersSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const s = await api.get<CashHoldersSummary>(
        `/businesses/${businessId}/cash-holders-summary`,
      );
      setSummary(s);
    } catch {
      setSummary({ items: [], total_amount: 0, total_count: 0 });
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const handleCreated = () => {
    setShowCreate(false);
    void load();
    triggerRefresh();
    onChange?.();
  };

  const isEmpty = !loading && (summary?.items.length ?? 0) === 0;

  return (
    <>
      <Widget
        title="Elde Tutulan Nakitler"
        subtitle="Çalışan/saha şefi vb. kişilerde tutulan nakit"
        icon={Wallet}
        flush
        actions={
          <Link
            href="/dashboard/hesaplar"
            className="text-[11px] text-brand-300 hover:text-brand-200 inline-flex items-center gap-1"
          >
            Tümünü Yönet <ArrowRight size={11} />
          </Link>
        }
      >
        {/* Body */}
        {loading ? (
          <div className="p-4 text-center text-xs text-surface-400">Yükleniyor...</div>
        ) : isEmpty ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-sm text-surface-300">
              💵 Elde tutulan nakit kaydı yok.
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium"
            >
              <Plus size={12} /> Kişide Nakit Ekle
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-[rgb(var(--v2-border))]">
              {summary!.items.map((it) => {
                const display = it.holder_name || it.name;
                return (
                  <Link
                    key={it.bank_account_id}
                    href={`/dashboard/hesaplar?account=${it.bank_account_id}`}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-surface-700/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <UserCircle2 size={16} className="text-brand-300 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-surface-100 truncate">{display}</p>
                        {it.holder_name && it.holder_name !== it.name && (
                          <p className="text-[10px] text-surface-500 truncate">{it.name}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-emerald-300 shrink-0">
                      {formatCurrency(it.current_balance, "TRY")}
                    </span>
                  </Link>
                );
              })}
            </div>

            {/* Total + Add CTA */}
            <div className="px-4 py-2.5 border-t border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))]/30 flex items-center justify-between gap-3">
              <div className="text-[11px] text-surface-300">
                TOPLAM: <strong>{summary!.total_count}</strong> kişide
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-brand-300">
                  {formatCurrency(summary!.total_amount, "TRY")}
                </span>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-brand-600/20 hover:bg-brand-600/30 text-brand-300 border border-brand-500/40"
                >
                  <Plus size={10} /> Yeni
                </button>
              </div>
            </div>

            {/* Şeffaflık notu — çift sayım korkusunu önler */}
            <div className="px-4 py-2 border-t border-[rgb(var(--v2-border))] text-[10px] text-surface-400 flex items-center gap-1.5">
              <Info size={11} className="text-brand-400 shrink-0" />
              <span>Bu tutarlar <strong>Ana Kasa</strong> toplamına dahildir — çift sayım yok.</span>
            </div>
          </>
        )}
      </Widget>

      {/* Create modal — tip kilitli CASH_HOLDER yarat (ANY içinden kullanıcı seçer). */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="v2-card max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[rgb(var(--v2-border))] flex items-center gap-2">
              <UserCircle2 size={16} className="text-brand-300" />
              <h3 className="text-sm font-semibold text-surface-100">
                Kişide Nakit Ekle
                {businessName && (
                  <span className="text-surface-400 font-normal"> · {businessName}</span>
                )}
              </h3>
            </div>
            <div className="p-4">
              <BankAccountCreateForm
                preselectedBusinessId={businessId}
                onCancel={() => setShowCreate(false)}
                onCreated={handleCreated}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

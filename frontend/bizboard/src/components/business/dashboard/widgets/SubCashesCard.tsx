"use client";

// ───────────────────────── 4b. ALT KASALAR (SUB-CASH) ─────────────────────────
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)

/**
 * v1.6.23.29 (UI Fix WP): Alt Kasalar widget'ı.
 *
 * <p>Konsolide panoda SUB_CASH listesi — her satır: ad + aggregate balance.
 * Tıklayınca BankAccountsCard'ın modal flow'una atlar (yeni modal-in-modal
 * değil; aynı modal'da DETAIL view → SubCashDetailContent). "+ Yeni Kasa"
 * tetikleyicisi widget üzerinde direkt CREATE_SUB_CASH view'ını açar.</p>
 *
 * <p>Boş state: "Henüz alt kasa yok" + "+ Kasa Oluştur" CTA.</p>
 */

import { useEffect, useState } from "react";
import { Banknote, ChevronRight } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import type { ConsolidatedDashboard } from "@/types";
import { Widget } from "@/components/v2";
import { WidgetDetailModal } from "../WidgetDetailModal";
import { SubCashDetailContent } from "@/components/bank/SubCashDetailContent";
import { BankAccountCreateForm } from "@/components/bank/BankAccountCreateForm";
import { Footer } from "./shared";

export function SubCashesCard({
  d, onChange,
}: { d: ConsolidatedDashboard; onChange?: () => void }) {
  const subCashes = d.bank_accounts.filter((a) => a.type === "SUB_CASH");
  const total = subCashes.reduce((s, a) => s + (a.balance || 0), 0);

  type View = "LIST" | "DETAIL" | "CREATE";
  const [showModal, setShowModal] = useState(false);
  const [view, setView] = useState<View>("LIST");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const businessId = d.business_id;

  // v1.7.x WP TODO 46aca4d0: her sub-cash için "Bu Ay Gelir" fetch et.
  // Paralel — küçük dataset, runtime aggregation. (>10 sub-cash olunca batch
  // endpoint'i ekleyebiliriz.)
  const [incomeMap, setIncomeMap] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    if (subCashes.length === 0) { setIncomeMap({}); return; }
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    Promise.all(
      subCashes.map((s) =>
        api.get<{ total_income: number }>(
          `/bank-accounts/${s.id}/income-summary?from=${from}&to=${to}`,
        )
          .then((r) => [s.id, r?.total_income ?? 0] as const)
          .catch(() => [s.id, 0] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setIncomeMap(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subCashes.map((s) => s.id).join(",")]);
  const totalIncome = Object.values(incomeMap).reduce((a, v) => a + v, 0);

  function reset() {
    setShowModal(false);
    setView("LIST");
    setSelectedId(null);
  }

  const headerAction =
    view === "LIST" ? (
      <button
        type="button"
        onClick={() => setView("CREATE")}
        className="text-[11px] px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1"
      >
        <Banknote size={11} />
        + Kasa Oluştur
      </button>
    ) : (
      <button
        type="button"
        onClick={() => { setView("LIST"); setSelectedId(null); }}
        className="text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-200 flex items-center gap-1"
      >
        ← Liste
      </button>
    );

  const modalTitle =
    view === "DETAIL" && selectedId
      ? subCashes.find((s) => s.id === selectedId)?.name || "Alt Kasa"
      : view === "CREATE" ? "Yeni Alt Kasa" : "Alt Kasalar — Detay";

  return (
    <>
    <Widget
      title="Alt Kasalar"
      icon={Banknote}
      flush
      onClick={() => setShowModal(true)}
      ariaLabel="Alt kasalar detayını aç"
      actions={
        subCashes.length > 0 ? (
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {subCashes.length}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => { setShowModal(true); setView("CREATE"); }}
            className="text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1"
          >
            <Banknote size={11} />
            + Kasa
          </button>
        )
      }
    >
      {subCashes.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <Banknote size={20} className="mx-auto text-surface-500 mb-1.5" />
          <p className="text-xs text-surface-400">Henüz alt kasa yok</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-[rgb(var(--v2-border))]">
            {subCashes.map((s) => {
              const inc = incomeMap[s.id];
              return (
                <div key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-100 truncate">{s.name}</p>
                    {/* v1.7.x WP TODO 46aca4d0: Bu Ay Gelir alt satırı */}
                    {inc != null && (
                      <p className="text-[10px] text-surface-400 mt-0.5">
                        Bu Ay Gelir:{" "}
                        <span className={cn(
                          "font-medium",
                          inc > 0 ? "text-brand-300" : inc < 0 ? "text-red-300" : "text-surface-400",
                        )}>
                          {formatCurrency(inc, s.currency || "TRY")}
                        </span>
                      </p>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-emerald-300 shrink-0">
                    {formatCurrency(s.balance, s.currency || "TRY")}
                  </p>
                </div>
              );
            })}
          </div>
          <Footer
            left={`${subCashes.length} alt kasa`}
            right={
              <span>
                Bakiye{" "}
                <span className="text-emerald-300">{formatCurrency(total, "TRY")}</span>
                {" · "}
                Gelir{" "}
                <span className="text-brand-300">{formatCurrency(totalIncome, "TRY")}</span>
              </span>
            }
          />
        </>
      )}
    </Widget>

    <WidgetDetailModal
      open={showModal}
      onClose={reset}
      title={modalTitle}
      subtitle={
        view === "LIST"
          ? `${subCashes.length} alt kasa · Σ aggregate ${formatCurrency(total, "TRY")}`
          : view === "DETAIL" && selectedId
          ? subCashes.find((s) => s.id === selectedId)?.bank_name || "SUB_CASH"
          : "Yeni alt kasa (manuel CRUD)"
      }
      size="lg"
      headerAction={headerAction}
    >
      {view === "DETAIL" && selectedId && (
        <SubCashDetailContent subCashId={selectedId} onChange={onChange} />
      )}

      {view === "CREATE" && (
        <BankAccountCreateForm
          mode="SUB_CASH"
          preselectedBusinessId={businessId}
          businesses={businessId ? [{ id: businessId, name: "" }] : []}
          onCancel={() => setView("LIST")}
          onCreated={() => { setView("LIST"); onChange?.(); }}
        />
      )}

      {view === "LIST" && (
        subCashes.length === 0 ? (
          <div className="py-6 text-center">
            <Banknote size={24} className="mx-auto text-surface-500 mb-2" />
            <p className="text-sm text-surface-400 mb-3">
              Henüz alt kasa yok. Banka hesaplarını gruplamak için alt kasa oluştur.
            </p>
            <button
              type="button"
              onClick={() => setView("CREATE")}
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1"
            >
              <Banknote size={12} />
              + Kasa Oluştur
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-surface-400 mb-3">
              Her alt kasaya tıklayarak detayını + atanan entity'leri burada görebilirsin.
              Aggregate = atanan BANK_ACCOUNT'ların toplam bakiyesi.
            </p>
            <div className="space-y-2">
              {subCashes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSelectedId(s.id); setView("DETAIL"); }}
                  className="w-full text-left block p-3 rounded-lg border border-surface-700 hover:border-emerald-500/40 hover:bg-surface-700/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-surface-100 truncate">{s.name}</p>
                      <p className="text-[11px] text-surface-400">
                        Alt Kasa · {s.currency}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-emerald-300 shrink-0">
                      {formatCurrency(s.balance, s.currency || "TRY")}
                    </p>
                    <ChevronRight size={14} className="text-surface-400" />
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-surface-700 flex items-center justify-between text-sm">
              <span className="text-surface-300">Toplam aggregate</span>
              <span className="font-bold text-emerald-300">{formatCurrency(total, "TRY")}</span>
            </div>
          </>
        )
      )}
    </WidgetDetailModal>
    </>
  );
}

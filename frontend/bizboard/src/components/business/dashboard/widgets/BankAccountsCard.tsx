"use client";

// ───────────────────────── 4. PARA BULUNAN HESAPLAR ─────────────────────────
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)

import { useState } from "react";
import { Wallet, Banknote, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ConsolidatedDashboard } from "@/types";
import { WidgetDetailModal } from "../WidgetDetailModal";
import { BankAccountDetailContent } from "@/components/bank/BankAccountDetailContent";
import { SubCashDetailContent } from "@/components/bank/SubCashDetailContent";
import { BankAccountCreateForm } from "@/components/bank/BankAccountCreateForm";
import { SectionTitle, Footer, TypeBadge } from "./shared";

export function BankAccountsCard({
  d, compact, onChange,
}: { d: ConsolidatedDashboard; compact?: boolean; onChange?: () => void }) {
  // v1.6.23.16 (TODO d0ccb7f0): tıkla → modal
  // v1.6.23.23: POS modal-in-modal pattern (detay inline).
  // v1.6.23.26 (TODO b12c1dce): "+ Hesap Ekle" + "+ Kasa Oluştur" nested
  // create form — modal dışına çıkmadan inline hesap/kasa ekleme; submit
  // sonrası ana liste refresh + parent consolidated cache invalidate.
  type View = "LIST" | "DETAIL" | "CREATE_ANY" | "CREATE_SUB_CASH";
  const [showDetail, setShowDetail] = useState(false);
  const [view, setView] = useState<View>("LIST");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const accounts = d.bank_accounts;
  const selectedAccount = selectedAccountId
    ? accounts.find((a) => a.id === selectedAccountId) || null
    : null;
  const businessId = d.business_id;

  function resetModal() {
    setShowDetail(false);
    setView("LIST");
    setSelectedAccountId(null);
  }
  function handleCreated() {
    setView("LIST");
    onChange?.();
  }

  if (accounts.length === 0) {
    // v1.6.23.26: boş durumda bile widget tıklanabilir → CREATE_ANY ile aç
    return (
      <>
      <section
        onClick={() => { setShowDetail(true); setView("CREATE_ANY"); }}
        className="glass-card glass-hover p-4 cursor-pointer hover:ring-1 hover:ring-blue-500/40 transition-all"
      >
        <SectionTitle icon={Wallet} label="Para Bulunan Hesaplar" />
        <p className="text-xs text-surface-400 py-2">Henüz hesap eklenmemiş. + ekle</p>
      </section>
      <WidgetDetailModal
        open={showDetail}
        onClose={resetModal}
        title="Yeni Hesap"
        size="lg"
      >
        <BankAccountCreateForm
          mode="ANY"
          preselectedBusinessId={businessId}
          businesses={businessId ? [{ id: businessId, name: "" }] : []}
          onCancel={resetModal}
          onCreated={() => { resetModal(); onChange?.(); }}
        />
      </WidgetDetailModal>
      </>
    );
  }

  const total = accounts.reduce((a, x) => a + x.balance, 0);

  // Modal başlığı + headerAction view'a göre değişir
  const modalTitle =
    view === "DETAIL" && selectedAccount ? selectedAccount.name :
    view === "CREATE_ANY" ? "Yeni Hesap" :
    view === "CREATE_SUB_CASH" ? "Yeni Kasa" :
    "Para Bulunan Hesaplar — Detay";

  const modalSubtitle =
    view === "DETAIL" && selectedAccount
      ? `${selectedAccount.type}${selectedAccount.bank_name ? " · " + selectedAccount.bank_name : ""}`
      : view === "CREATE_ANY"
        ? "Hesap tipi seç ve detay gir — modal kapanmadan kaydedilir"
        : view === "CREATE_SUB_CASH"
        ? "Alt kasa oluştur — Ana Kasa dışı ek nakit havuzu"
        : `${accounts.length} hesap · toplam ${formatCurrency(total, "TRY")}`;

  const headerAction =
    view === "LIST" ? (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setView("CREATE_ANY")}
          className="text-[11px] px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center gap-1"
          title="Yeni banka / kişide hesap"
        >
          <Wallet size={11} />
          + Hesap Ekle
        </button>
        <button
          type="button"
          onClick={() => setView("CREATE_SUB_CASH")}
          className="text-[11px] px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1"
          title="Yeni alt kasa"
        >
          <Banknote size={11} />
          + Kasa Oluştur
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => { setView("LIST"); setSelectedAccountId(null); }}
        className="text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-200 flex items-center gap-1"
      >
        ← Hesap Listesi
      </button>
    );

  return (
    <>
    <section
      onClick={() => setShowDetail(true)}
      className="glass-card glass-hover overflow-hidden cursor-pointer hover:ring-1 hover:ring-blue-500/40 transition-all"
    >
      <div className="px-4 py-3 border-b border-surface-700">
        <SectionTitle icon={Wallet} label="Para Bulunan Hesaplar" inline />
      </div>
      <div className="divide-y divide-surface-700">
        {accounts.map((a) => (
          <div key={a.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2">
              <TypeBadge type={a.type} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{a.name}</p>
                <p className="text-[11px] text-surface-400 truncate">
                  {a.type === "CASH_HOLDER" && a.holder_name
                    ? `Kişide: ${a.holder_name}`
                    : a.bank_name || "—"}
                </p>
              </div>
            </div>
            <p className="text-sm font-semibold text-white shrink-0">
              {formatCurrency(a.balance, a.currency || "TRY")}
            </p>
          </div>
        ))}
      </div>
      <Footer left={`${accounts.length} hesap`} right={`Toplam ${formatCurrency(total, "TRY")}`} />
    </section>
    <WidgetDetailModal
      open={showDetail}
      onClose={resetModal}
      title={modalTitle}
      subtitle={modalSubtitle}
      size="lg"
      headerAction={headerAction}
    >
      {view === "DETAIL" && selectedAccount && (
        // v1.6.23.28 (UI Fix WP TODO 635e1c91 tetikleyici fix): SUB_CASH için
        // SubCashDetailContent (aggregate + atama yönetimi). Diğer tipler için
        // BankAccountDetailContent (son tx + trend).
        selectedAccount.type === "SUB_CASH"
          ? <SubCashDetailContent subCashId={selectedAccount.id} onChange={onChange} />
          : <BankAccountDetailContent accountId={selectedAccount.id} />
      )}

      {view === "CREATE_ANY" && (
        <BankAccountCreateForm
          mode="ANY"
          preselectedBusinessId={businessId}
          businesses={businessId ? [{ id: businessId, name: "" }] : []}
          onCancel={() => setView("LIST")}
          onCreated={handleCreated}
        />
      )}

      {view === "CREATE_SUB_CASH" && (
        <BankAccountCreateForm
          mode="SUB_CASH"
          preselectedBusinessId={businessId}
          businesses={businessId ? [{ id: businessId, name: "" }] : []}
          onCancel={() => setView("LIST")}
          onCreated={handleCreated}
        />
      )}

      {view === "LIST" && (
        <>
          <p className="text-xs text-surface-400 mb-3">
            Her hesaba tıklayarak detayını bu modal üzerinde görebilirsin.
            Yukarıdan yeni hesap veya kasa ekleyebilirsin.
          </p>
          <div className="space-y-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { setSelectedAccountId(a.id); setView("DETAIL"); }}
                className="w-full text-left block p-3 rounded-lg border border-surface-700 hover:border-blue-500/40 hover:bg-surface-700/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <TypeBadge type={a.type} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{a.name}</p>
                      <p className="text-[11px] text-surface-400 truncate">
                        {a.type === "CASH_HOLDER" && a.holder_name
                          ? `Kişide: ${a.holder_name}`
                          : a.bank_name || "—"}
                        {a.currency && a.currency !== "TRY" && ` · ${a.currency}`}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-white shrink-0">
                    {formatCurrency(a.balance, a.currency || "TRY")}
                  </p>
                  <ChevronRight size={14} className="text-surface-400" />
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-surface-700 flex items-center justify-between text-sm">
            <span className="text-surface-300">Toplam</span>
            <span className="font-bold text-white">{formatCurrency(total, "TRY")}</span>
          </div>
        </>
      )}
    </WidgetDetailModal>
    </>
  );
}

"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Settings, Plus, Trash2, Loader2, CreditCard, Banknote, Users as UsersIcon } from "lucide-react";
import type { PaymentMethod } from "@/types";
import { ConsolidatedWidgets } from "@/components/business/dashboard/ConsolidatedWidgets";
import { CarryOverBanner } from "@/components/closing/CarryOverBanner";
import { CloseTodayModal } from "@/components/closing/CloseTodayModal";
import { useConsolidatedDashboard } from "@/hooks/useConsolidatedDashboard";
import { useCashClosing } from "@/hooks/useCashClosing";
// v1.6.23: BusinessHeader widget kaldırıldı — info "Geri" satırına taşındı.
import { FinanceSummary } from "@/components/business/FinanceSummary";
import { TransactionList } from "@/components/business/TransactionList";
import { ModuleTabs } from "@/components/business/ModuleTabs";
import { FixedCostsWidget } from "@/components/business/FixedCostsWidget";
import { useBusiness } from "@/hooks/useBusiness";
import { useAppStore } from "@/lib/store";
import { api, ApiError } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import Link from "next/link";

export default function BusinessDetailPage() {
  const params = useParams();
  const router = useRouter();
  const businessId = params.id as string;
  const { business, transactions, summary, isLoading } = useBusiness(businessId);
  const { profile, triggerRefresh } = useAppStore();
  const isAdmin = profile?.role === "admin";

  // v1.6.2: admin-only sil
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // v1.6.4: POS/NAKIT filter chips
  const [paymentFilter, setPaymentFilter] = useState<"ALL" | PaymentMethod>("ALL");

  // v1.6.20 (WP-3): consolidated dashboard verisi + Günü Kapat modal kontrolü
  const { data: consolidated, refresh: refreshConsolidated } = useConsolidatedDashboard(businessId);
  const { preview, refresh: refreshClosing } = useCashClosing();
  const [showCloseModal, setShowCloseModal] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/businesses/${businessId}`);
      triggerRefresh();
      router.push("/dashboard");
    } catch (e) {
      setDeleteError(getErrorMessage(e));
      setDeleting(false);
    }
  }

  if (isLoading) {
    return <BusinessDetailSkeleton />;
  }

  if (!business) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <p className="text-surface-300 text-lg">Isletme bulunamadi</p>
        <button onClick={() => router.push("/dashboard")} className="btn-primary mt-4">
          Panele Don
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24 overflow-x-hidden max-w-full">
      {/* v1.6.23: Tek-satırlı page header — geri butonu + işletme adı + ekip
          üyesi sayısı + admin aksiyonları. Eski BusinessHeader card'ı kaldırıldı. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-xl text-surface-300 hover:text-white hover:bg-surface-700 transition-colors shrink-0"
            aria-label="Geri"
            title="Geri"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-white truncate leading-tight">
              {business.name}
            </h1>
            <p className="text-[11px] text-surface-400 flex items-center gap-1.5 mt-0.5">
              <span className="capitalize">{business.business_type_name || "Isletme"}</span>
              {business.members && business.members.length > 0 && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="inline-flex items-center gap-1">
                    <UsersIcon size={10} />
                    {business.members.length} ekip uyesi
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isAdmin && (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="p-2 rounded-xl hover:bg-red-500/10 text-surface-400 hover:text-red-400 transition-colors"
              title="Isletmeyi sil (admin)"
            >
              <Trash2 size={20} />
            </button>
          )}
          <Link
            href={`/business/${businessId}/settings`}
            className="p-2 rounded-xl hover:bg-surface-600 transition-colors"
            title="Ayarlar"
          >
            <Settings size={20} className="text-surface-300" />
          </Link>
        </div>
      </div>

      {/* v1.6.2: Admin delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="card p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-2">
              Isletmeyi Sil
            </h3>
            <p className="text-sm text-surface-400 mb-4">
              <strong className="text-white">{business.name}</strong> isletmesini
              silmek istediginden emin misin? Bu islem geri alinamaz. Bagli
              kayitlar (islemler, sabit giderler, personel, vb.) var ise silme
              reddedilebilir.
            </p>
            {deleteError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setDeleteConfirm(false); setDeleteError(null); }}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm disabled:opacity-50"
              >
                Iptal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center gap-2"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Evet, Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v1.6.23: BusinessHeader widget kaldırıldı — info "Geri" satırında. */}

      {/* v1.6.19 (WP-2): Dünden Kalan Eksik banner */}
      <CarryOverBanner />

      {/* v1.6.20 (WP-3): Consolidated dashboard widgets — DGR pano */}
      {consolidated && (
        <ConsolidatedWidgets data={consolidated} onCloseDay={() => setShowCloseModal(true)} />
      )}

      {/* Close Today Modal */}
      {showCloseModal && preview && (
        <CloseTodayModal
          preview={preview}
          onClose={() => setShowCloseModal(false)}
          onClosed={() => { void refreshClosing(); void refreshConsolidated(); }}
        />
      )}

      {/* Finance Summary Cards */}
      <FinanceSummary summary={summary} currency={business.currency} />

      {/* Fixed Costs Widget */}
      <FixedCostsWidget businessId={businessId} currency={business.currency} />

      {/* Module Tabs */}
      <ModuleTabs business={business} />

      {/* Recent Transactions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">
            Son Islemler
          </h2>
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/add-transaction?business=${businessId}&payment_method=POS`}
              className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-indigo-300 hover:text-indigo-200"
              title="POS islemi olustur"
            >
              <CreditCard size={14} />
              POS Islem
            </Link>
            <Link
              href={`/dashboard/add-transaction?business=${businessId}`}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <Plus size={16} />
              Ekle
            </Link>
          </div>
        </div>

        {/* v1.6.4: POS / Nakit filter chips */}
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setPaymentFilter("ALL")}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              paymentFilter === "ALL"
                ? "bg-surface-600 border-surface-500 text-white"
                : "bg-surface-700 border-surface-600 text-surface-300"
            }`}
          >
            Tumu
          </button>
          <button
            type="button"
            onClick={() => setPaymentFilter("POS")}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${
              paymentFilter === "POS"
                ? "bg-indigo-500/20 border-indigo-400 text-indigo-200"
                : "bg-surface-700 border-surface-600 text-surface-300"
            }`}
          >
            <CreditCard size={11} />
            POS
          </button>
          <button
            type="button"
            onClick={() => setPaymentFilter("NAKIT")}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${
              paymentFilter === "NAKIT"
                ? "bg-emerald-500/20 border-emerald-400 text-emerald-200"
                : "bg-surface-700 border-surface-600 text-surface-300"
            }`}
          >
            <Banknote size={11} />
            Nakit
          </button>
        </div>

        <TransactionList
          transactions={transactions}
          currency={business.currency}
          paymentFilter={paymentFilter}
        />
      </section>
    </div>
  );
}

function BusinessDetailSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-6 bg-surface-600 rounded w-24" />
      <div className="h-24 bg-surface-600 rounded-2xl" />
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-surface-600 rounded-xl" />
        ))}
      </div>
      <div className="h-10 bg-surface-600 rounded-xl" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-surface-600 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

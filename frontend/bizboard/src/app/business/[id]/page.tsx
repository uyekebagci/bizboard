"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Settings, Plus, Trash2, Loader2, CreditCard, Banknote, Users as UsersIcon, ArrowLeftRight, Building2 } from "lucide-react";
import type { PaymentMethod } from "@/types";
import { ConsolidatedWidgets } from "@/components/business/dashboard/ConsolidatedWidgets";
import { QuickActionsWidget } from "@/components/business/dashboard/QuickActionsWidget";
import { CarryOverBanner } from "@/components/closing/CarryOverBanner";
import { CloseTodayModal } from "@/components/closing/CloseTodayModal";
import { useConsolidatedDashboard } from "@/hooks/useConsolidatedDashboard";
import { useCashClosing } from "@/hooks/useCashClosing";
// v1.6.23: BusinessHeader widget kaldırıldı — info "Geri" satırına taşındı.
// v1.7.x (dashboard reorg): FinanceSummary (Gelir/Gider/Kar 3'lü kart) ve
// FixedCostsWidget (Sabit Masraflar) dashboard render'ından KALDIRILDI.
// FinanceSummary redundant (aynı bilgi Konsolide/Bugünün Kasa Durumu kartında);
// FixedCostsWidget özelliği KORUNDU (ModuleTabs > "Sabit Masraflar" modülünde
// hâlâ erişilebilir — sadece bu standalone dashboard widget'ı gizlendi).
import { TransactionList } from "@/components/business/TransactionList";
import { ModuleTabs } from "@/components/business/ModuleTabs";
import { useBusiness } from "@/hooks/useBusiness";
import { useAppStore } from "@/lib/store";
import { api, ApiError } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { AddTransactionModal } from "@/components/transactions/AddTransactionModal";
import { Widget } from "@/components/v2";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";

export default function BusinessDetailPage() {
  const params = useParams();
  const router = useRouter();
  const businessId = params.id as string;
  // v1.7.x (dashboard reorg): `summary` artık kullanılmıyor (FinanceSummary
  // widget'ı kaldırıldı); hook çağrısı veri katmanı için aynen korunuyor.
  const { business, transactions, isLoading } = useBusiness(businessId);
  const { profile, triggerRefresh } = useAppStore();
  const isAdmin = profile?.role === "admin";

  // Karar A: "Bugünün Kasa Durumu" widget'ı + gün açılış/kapanış UI'sı YALNIZ
  // DAY_CYCLE modülü AÇIK işletmede görünür (per-işletme yetenek).
  const dayCycleEnabled = !!business?.modules?.some(
    (m) => m.module === "day_cycle" && m.is_enabled,
  );

  // v1.6.2: admin-only sil
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // v1.6.4: POS/NAKIT filter chips
  const [paymentFilter, setPaymentFilter] = useState<"ALL" | PaymentMethod>("ALL");

  // v1.6.20 (WP-3): consolidated dashboard verisi + Günü Kapat modal kontrolü
  const { data: consolidated, refresh: refreshConsolidated } = useConsolidatedDashboard(businessId);
  const { preview, refresh: refreshClosing } = useCashClosing(businessId);
  const [showCloseModal, setShowCloseModal] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/businesses/${businessId}`);
      toast.info("İşletme silindi");
      triggerRefresh();
      router.push("/dashboard");
    } catch (e) {
      setDeleteError(getErrorMessage(e));
      toast.error(e);
      setDeleting(false);
    }
  }

  if (isLoading) {
    return <BusinessDetailSkeleton />;
  }

  if (!business) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <p className="text-[rgb(var(--v2-muted))] text-lg">İşletme bulunamadı</p>
        <button onClick={() => router.push("/dashboard")} className="btn-primary mt-4">
          Panele Dön
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24 overflow-x-hidden max-w-full">
      {/* v1.6.23: Tek-satırlı page header — geri butonu + işletme adı + ekip
          üyesi sayısı + admin aksiyonları. Eski BusinessHeader card'ı kaldırıldı. */}
      <PageHeader
        title={business.name}
        subtitle={[
          business.business_type_name || "İşletme",
          business.members && business.members.length > 0
            ? `${business.members.length} ekip üyesi`
            : undefined,
        ].filter(Boolean).join(" · ")}
        icon={Building2}
        size="sm"
        actions={
          <div className="flex items-center gap-1">
            {isAdmin && (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="p-2 rounded-xl hover:bg-red-500/10 text-[rgb(var(--v2-muted))] hover:text-status-danger transition-colors"
                title="İşletmeyi sil (admin)"
              >
                <Trash2 size={20} />
              </button>
            )}
            <Link
              href={`/business/${businessId}/settings`}
              className="p-2 rounded-xl hover:bg-[rgb(var(--v2-sunken))] transition-colors"
              title="Ayarlar"
            >
              <Settings size={20} className="text-[rgb(var(--v2-muted))]" />
            </Link>
          </div>
        }
      />

      {/* v1.6.2: Admin delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="modal-surface p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-[rgb(var(--v2-ink))] mb-2">
              İşletmeyi Sil
            </h3>
            <p className="text-sm text-[rgb(var(--v2-muted))] mb-4">
              <strong className="text-[rgb(var(--v2-ink))]">{business.name}</strong> işletmesini
              silmek istediğinden emin misin? Bu işlem geri alınamaz. Bağlı
              kayıtlar (işlemler, sabit giderler, personel, vb.) var ise silme
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
                className="px-4 py-2 rounded-xl bg-[rgb(var(--v2-sunken))] hover:opacity-80 text-[rgb(var(--v2-ink))] text-sm disabled:opacity-50"
              >
                İptal
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
      <CarryOverBanner businessId={businessId} />

      {/* v1.6.20 (WP-3) + v1.6.23.24 (UI Fix WP): Consolidated dashboard widgets — DGR pano.
          Son İşlemler bölümü Row 2 col 1'e slot olarak veriliyor (Hesaptan Harcama
          ile yan yana). "+ Yeni İşlem" butonu vurgulu solid renkli. */}
      {consolidated && (
        <ConsolidatedWidgets
          data={consolidated}
          dayCycleEnabled={dayCycleEnabled}
          onCloseDay={() => {
            // Beta v1.1: modal yerine dedicated /closure sayfası
            window.location.href = `/dashboard/closure?business_id=${consolidated.business_id}`;
          }}
          onChange={() => {
            void refreshConsolidated();
            triggerRefresh();
          }}
          recentTransactionsSlot={
            <RecentTransactionsSection
              businessId={businessId}
              transactions={transactions}
              currency={business.currency}
              paymentFilter={paymentFilter}
              setPaymentFilter={setPaymentFilter}
              onChange={() => {
                void refreshConsolidated();
                void refreshClosing();
                triggerRefresh();
              }}
            />
          }
          modulesSlot={
            /* fix(business-detail): Modüller widget'ı Row 1 (Konsolide + Kasa
               Durumu) hemen altına taşındı — Row 2'nin üstünde konumlanır. */
            <ModuleTabs business={business} />
          }
        />
      )}

      {/* Close Today Modal */}
      {showCloseModal && preview && (
        <CloseTodayModal
          preview={preview}
          businessId={businessId}
          onClose={() => setShowCloseModal(false)}
          onClosed={() => { void refreshClosing(); void refreshConsolidated(); }}
        />
      )}

      {/* v1.7.x (dashboard reorg): FinanceSummary (Gelir/Gider/Kar) ve
          FixedCostsWidget (Sabit Masraflar) bu konumdan kaldırıldı — bkz.
          import bloğundaki not. Veri/hesaplama (summary) ve FixedCosts
          özelliği yerinde duruyor; sadece bu sayfadaki render iptal edildi. */}

      {/* v1.7.x (dashboard reorg): Hızlı İşlemler EN ALTA taşındı
          (önceden ConsolidatedWidgets içinde Row 1 altındaydı). */}
      {consolidated && (
        <QuickActionsWidget businessId={consolidated.business_id} />
      )}
    </div>
  );
}

/**
 * v1.6.23.24 (UI Fix WP): Son İşlemler widget'ı — ConsolidatedWidgets'ın
 * Row 2 col 1'inde Hesaptan Harcama ile yan yana 50% genişlikte yer alır.
 *
 * <p>"+ Yeni İşlem" CTA solid brand renkli (önceki text-link versiyondan
 * yükseltildi — user'a göre "vurgulu" olmalı). POS / Nakit filter chip'leri
 * + TransactionList aynen taşındı.</p>
 */
function RecentTransactionsSection({
  businessId, transactions, currency, paymentFilter, setPaymentFilter, onChange,
}: {
  businessId: string;
  transactions: Parameters<typeof TransactionList>[0]["transactions"];
  currency: string;
  paymentFilter: "ALL" | PaymentMethod;
  setPaymentFilter: (p: "ALL" | PaymentMethod) => void;
  onChange: () => void;
}) {
  // v1.6.23.26 (UI Fix WP TODO 06c8f232): "+ Yeni İşlem" + POS shortcut artık
  // modal açıyor (sayfa değişimi yok). Modal kapanınca onChange ile cache
  // invalidate edilir.
  // v1.7.0-beta (Bankalar WP TODO c382d6e5): ⇄ Transfer kısayolu — '+ Gelir'
  // pattern'ine birebir uyumlu küçük chip; modal Transfer tab'iyle açılır.
  const [showAddModal, setShowAddModal] = useState<null | "ALL" | "POS" | "TRANSFER">(null);

  return (
    <Widget
      title="Son İşlemler"
      flush
      className="flex flex-col"
      actions={
        <>
          <button
            type="button"
            onClick={() => setShowAddModal("TRANSFER")}
            className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md v2-chip-accent"
            title="Hesaplar arası transfer"
          >
            <ArrowLeftRight size={11} />
            Transfer
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal("POS")}
            className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md v2-chip-accent"
            title="POS işlemi oluştur"
          >
            <CreditCard size={11} />
            POS
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal("ALL")}
            className="v2-btn v2-btn--accent v2-press !px-2.5 !py-1 !text-xs"
          >
            <Plus size={12} />
            Yeni İşlem
          </button>
        </>
      }
    >
      <AddTransactionModal
        open={showAddModal !== null}
        businessId={businessId}
        preselectedPaymentMethod={showAddModal === "POS" ? "POS" : null}
        preselectedType={showAddModal === "POS" ? "income" : null}
        initialTab={showAddModal === "TRANSFER" ? "transfer" : undefined}
        onClose={() => setShowAddModal(null)}
        onSuccess={onChange}
      />

      <div className="px-4 py-2 border-b border-[rgb(var(--v2-border))] flex gap-1.5">
        <button
          type="button"
          onClick={() => setPaymentFilter("ALL")}
          className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
            paymentFilter === "ALL"
              ? "v2-chip-ink"
              : "v2-chip"
          }`}
        >
          Tümü
        </button>
        <button
          type="button"
          onClick={() => setPaymentFilter("POS")}
          className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors inline-flex items-center gap-1 ${
            paymentFilter === "POS"
              ? "v2-chip-accent"
              : "v2-chip"
          }`}
        >
          <CreditCard size={10} />
          POS
        </button>
        <button
          type="button"
          onClick={() => setPaymentFilter("NAKIT")}
          className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors inline-flex items-center gap-1 ${
            paymentFilter === "NAKIT"
              ? "v2-chip-accent"
              : "v2-chip"
          }`}
        >
          <Banknote size={10} />
          Nakit
        </button>
      </div>

      <div className="max-h-[480px] overflow-y-auto">
        <TransactionList
          transactions={transactions}
          currency={currency}
          paymentFilter={paymentFilter}
          onChange={onChange}
        />
      </div>
    </Widget>
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

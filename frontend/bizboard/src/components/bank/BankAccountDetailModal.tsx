"use client";

/**
 * v1.6.23.19 (UI Fix WP 8b961444): Banka hesabı detay modalı (standalone).
 *
 * <p>v1.6.23.23: içerik {@link BankAccountDetailContent} olarak ayrıştırıldı —
 * hem bu standalone modal (/dashboard/hesaplar satırından), hem de
 * "Para Bulunan Hesaplar" widget'ı modal-in-modal pattern'iyle aynı içeriği
 * kullanır (POS Cihazları pattern'i ile birebir uyumlu).</p>
 */

import { WidgetDetailModal } from "@/components/business/dashboard/WidgetDetailModal";
import { BankAccountDetailContent } from "./BankAccountDetailContent";
import { SubCashDetailContent } from "./SubCashDetailContent";
import type { BankAccountListItem } from "@/types";

interface Props {
  account: BankAccountListItem | null;
  onClose: () => void;
  /** v1.6.23.27: SUB_CASH unassign sonrası parent refresh (havuz listesi). */
  onChange?: () => void;
}

export function BankAccountDetailModal({ account, onClose, onChange }: Props) {
  const open = !!account;
  const isSubCash = account?.type === "SUB_CASH";
  return (
    <WidgetDetailModal
      open={open}
      onClose={onClose}
      title={account?.name || "Hesap Detayı"}
      subtitle={account ? `${account.business_name ?? "?"} · ${account.type}` : undefined}
      size="lg"
    >
      {account && (
        isSubCash
          ? <SubCashDetailContent subCashId={account.id} onChange={onChange} />
          : <BankAccountDetailContent accountId={account.id} />
      )}
    </WidgetDetailModal>
  );
}

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
import type { BankAccountListItem } from "@/types";

interface Props {
  account: BankAccountListItem | null;
  onClose: () => void;
}

export function BankAccountDetailModal({ account, onClose }: Props) {
  const open = !!account;
  return (
    <WidgetDetailModal
      open={open}
      onClose={onClose}
      title={account?.name || "Hesap Detayı"}
      subtitle={account ? `${account.business_name ?? "?"} · ${account.type}` : undefined}
      size="lg"
    >
      {account && <BankAccountDetailContent accountId={account.id} />}
    </WidgetDetailModal>
  );
}

"use client";

/**
 * v1.7.0.x: /dashboard/add-transaction sidebar shortcut'undan açılan TYPE CHOOSER.
 *
 * <p>Eski davranış: bu sayfa direkt Gelir/Gider formu açıyordu. Yeni:
 * kullanıcı önce işlem tipini seçer (4 kart), ardından
 * /dashboard/add-transaction/[type] sub-route'una yönlendirilir
 * (deep-link destekli, back/forward çalışır).</p>
 *
 * <p>Modal akışı (Son İşlemler widget'ı + İşletme pano'su) etkilenmedi —
 * bu sayfa SADECE sidebar shortcut'u için.</p>
 *
 * <p>NAVİGASYON NOTU: Kart tıklamalarında router.replace kullanılır —
 * chooser history'de form ile yer DEĞİŞTİRİR. Bu sayede:
 * - Form ← geri butonu (router.replace chooser) → chooser [korunur]
 * - Browser geri ← form → chooser → dashboard [loop yok]
 * Link yerine replace kullanılmazsa: push zinciri chooser↔form loop'u
 * oluştururdu (her geri-ileri yeni history girişi ekler).</p>
 */

import { useRouter } from "next/navigation";
import {
  ArrowDownLeft, ArrowUpRight, CreditCard, ArrowLeftRight, ChevronRight, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Kart tiplerini href yerine type key ile tutuyoruz; onClick'te router.replace kullanılır
// (Link/push kullanmak chooser↔form history loop'una yol açar — bkz. dosya başı notu)

interface CardSpec {
  href: string;
  title: string;
  description: string;
  icon: typeof ArrowDownLeft;
  iconBg: string;
  iconColor: string;
  borderHover: string;
}

const CARDS: CardSpec[] = [
  {
    href: "/dashboard/add-transaction/income",
    title: "GELİR",
    description: "Müşteriden tahsilat, satış, kira geliri",
    icon: ArrowDownLeft,
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-600 dark:text-emerald-300",
    borderHover: "hover:border-emerald-500/50",
  },
  {
    href: "/dashboard/add-transaction/expense",
    title: "GİDER",
    description: "Tedarikçi ödemesi, fatura, masraf",
    icon: ArrowUpRight,
    iconBg: "bg-rose-500/15",
    iconColor: "text-rose-600 dark:text-rose-300",
    borderHover: "hover:border-rose-500/50",
  },
  {
    href: "/dashboard/add-transaction/pos",
    title: "POS",
    description: "Kartla çekim, POS cihazından tahsilat",
    icon: CreditCard,
    iconBg: "bg-blue-500/15",
    iconColor: "text-blue-600 dark:text-blue-300",
    borderHover: "hover:border-blue-500/50",
  },
  {
    href: "/dashboard/add-transaction/transfer",
    title: "TRANSFER",
    description: "Hesaplar arası para hareketi (havale/EFT/nakit)",
    icon: ArrowLeftRight,
    iconBg: "bg-purple-500/15",
    iconColor: "text-purple-600 dark:text-purple-300",
    borderHover: "hover:border-purple-500/50",
  },
];

export default function AddTransactionChooserPage() {
  const router = useRouter();

  return (
    <div className="max-w-3xl mx-auto pb-24 space-y-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="v2-press p-2 -ml-2 rounded-xl v2-sunken hover:border-[rgb(var(--accent))]/50 transition-colors"
          aria-label="Geri"
        >
          <ArrowLeft size={20} className="text-[rgb(var(--v2-muted))]" />
        </button>
        <h1 className="text-xl font-bold text-[rgb(var(--v2-ink))]">Yeni İşlem</h1>
      </div>

      <div className="text-center space-y-1">
        <h2 className="v2-display text-2xl">
          Hangi İşlemi Yapmak İstiyorsunuz?
        </h2>
        <p className="text-sm text-[rgb(var(--v2-muted))]">
          İşlem tipini seçin — sonraki adımda detayları girersiniz
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            // router.replace yerine Link/push kullanmak chooser↔form loop'u yaratır:
            // push her seferinde yeni history girişi ekler, geri-ileri döngüsü oluşur.
            // replace ile chooser'ın kendi history slot'u form ile değişir → loop imkansız.
            <button
              key={card.href}
              type="button"
              onClick={() => router.replace(card.href)}
              className={cn(
                "group relative v2-card p-5 sm:p-6 border-2 transition-all text-left w-full",
                "hover:scale-[1.02] cursor-pointer",
                card.borderHover,
              )}
            >
              <div className="flex items-start gap-4">
                <div className={cn(
                  "w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0",
                  card.iconBg,
                )}>
                  <Icon size={26} className={card.iconColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={cn("text-lg sm:text-xl font-bold mb-1", card.iconColor)}>
                    {card.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[rgb(var(--v2-muted))] leading-relaxed">
                    {card.description}
                  </p>
                </div>
                <ChevronRight
                  size={18}
                  className="text-[rgb(var(--v2-muted))] group-hover:text-[rgb(var(--v2-ink))] transition-colors shrink-0 mt-1"
                />
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-center text-[11px] text-[rgb(var(--v2-muted))]">
        💡 Hızlı erişim için ana sayfa &quot;Son İşlemler&quot; widget&apos;ındaki
        kısayolları da kullanabilirsiniz.
      </p>
    </div>
  );
}

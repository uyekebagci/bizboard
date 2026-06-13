/**
 * Legacy çek sayfası → /dashboard/cek-senet'e redirect.
 *
 * <p>Eski {@code Debt}-tabanlı "Çekler" sayfası (GET /cheques, yalnız okuma +
 * settle) kanonik Ledger v2 "Çek/Senet" portföyü ({@code /instruments}) ile
 * birleştirildi. Instrument modeli üst-küme: yön (alacak/borç), tür (çek/senet),
 * durum (portföy/tahsil/karşılıksız/ciro), cari FK ile bağ, P&L-nötr posting.</p>
 *
 * <p>Veri kaybı yok: /cheques backend endpoint'i (Telegram vade hatırlatıcısı için
 * ChequeReminderScheduler hâlâ kullanır) ve Debt tabanlı çek kayıtları korunur;
 * yalnız bu duplike frontend sayfası kaldırıldı. Eski bookmark'lar kırılmasın diye
 * server-side redirect ile kanonik sayfaya yönlendirilir.</p>
 */

import { redirect } from "next/navigation";

export default function CeklerLegacyRedirect() {
  redirect("/dashboard/cek-senet");
}

/**
 * Türkçe URL kısayolu: /dashboard/kategoriler → /dashboard/categories.
 *
 * <p>Kanonik kategori yönetim rotası {@code /dashboard/categories}. Kullanıcılar
 * (ve doğrulama akışları) Türkçe "kategoriler" yolunu doğal olarak deneyebildiği
 * için bu yol 404 vermesin diye server-side redirect ile kanonik sayfaya
 * yönlendirilir. Eski/yanlış bookmark'lar da kırılmaz.</p>
 */

import { redirect } from "next/navigation";

export default function KategorilerRedirect() {
  redirect("/dashboard/categories");
}

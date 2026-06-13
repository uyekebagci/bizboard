/**
 * UI v2 showcase → promote sonrası redirect.
 *
 * <p>Daxa "Genel Bakış" tasarımı GERÇEK /dashboard landing sayfası oldu
 * (bkz. ../page.tsx). Bu eski referans/showcase route'u duplike kalmasın diye
 * /dashboard'a yönlendirir; eski bookmark'lar kırılmaz.</p>
 */

import { redirect } from "next/navigation";

export default function DashboardV2Redirect() {
  redirect("/dashboard");
}

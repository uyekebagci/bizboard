import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSafeRedirectPath } from "@/lib/safe-redirect";

/**
 * Session flag cookie.
 *
 * <p>Bu cookie sadece bir BAYRAK — değeri "1", içinde TOKEN YOK.
 * Asıl güvenlik refresh token (HttpOnly, backend domain'inde) ve JWT
 * (Authorization header, in-memory) ile sağlanır. Bu bayrak yalnızca
 * middleware'in "kullanıcı yakın zamanda login oldu mu" sorusuna server-side
 * yanıt verebilmesi için var — böylece korumalı sayfalar redirect'le
 * korunabilir, blank screen flash'i yaşanmaz.</p>
 *
 * <p>Frontend ve backend ileride aynı parent domain'i paylaşırsa (örn.
 * *.cakirdag.com) bu bayrağa gerek kalmaz — backend HttpOnly cookie'sini
 * middleware'in de okumasına izin verecek şekilde kurabiliriz.</p>
 */
const SESSION_FLAG_COOKIE = "bb_session";

export function middleware(request: NextRequest) {
  const hasFlag = request.cookies.has(SESSION_FLAG_COOKIE);

  const publicRoutes = ["/auth/login"];
  const isPublicRoute = publicRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  if (!hasFlag && !isPublicRoute) {
    const redirectUrl = new URL("/auth/login", request.url);
    const currentPath =
      request.nextUrl.pathname + (request.nextUrl.search ?? "");
    if (isSafeRedirectPath(currentPath)) {
      redirectUrl.searchParams.set("redirect", currentPath);
    }
    return NextResponse.redirect(redirectUrl);
  }

  if (hasFlag && isPublicRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)",
  ],
};

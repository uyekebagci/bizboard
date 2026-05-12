import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSafeRedirectPath } from "@/lib/safe-redirect";

// Backend refresh token HttpOnly cookie'si (RefreshTokenService.COOKIE_NAME = "rt").
// Middleware sadece bu cookie'nin VARLIGINI sorar — icerigi okuyamaz/dogrulayamaz
// (HttpOnly + sunucu hash'i). Gercek dogrulama backend'de yapilir.
const REFRESH_COOKIE = "rt";

export function middleware(request: NextRequest) {
  const hasRefreshCookie = request.cookies.has(REFRESH_COOKIE);

  const publicRoutes = ["/auth/login"];
  const isPublicRoute = publicRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  if (!hasRefreshCookie && !isPublicRoute) {
    const redirectUrl = new URL("/auth/login", request.url);
    const currentPath =
      request.nextUrl.pathname + (request.nextUrl.search ?? "");
    if (isSafeRedirectPath(currentPath)) {
      redirectUrl.searchParams.set("redirect", currentPath);
    }
    return NextResponse.redirect(redirectUrl);
  }

  if (hasRefreshCookie && isPublicRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)",
  ],
};

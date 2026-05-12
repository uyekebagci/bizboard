/**
 * Frontend log batch ingestion proxy.
 *
 * Browser → Next.js API (server-side, CORS bypass) → Spring Boot /internal/logs
 *
 * Browser tarafindaki logger keepalive: true ile bu route'a POST eder. Token
 * cookie'den (same-origin) okunur, backend'a Bearer JWT olarak iletilir. Backend
 * "frontend" logger adıyla ana log pipeline'ina dökülür.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const BACKEND_URL =
  process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!BACKEND_URL) {
    // Backend yapilandirilmadi — sessizce kabul et, log düşür.
    return NextResponse.json({ ok: true });
  }

  // Authorization header > cookie (refresh akisi yerlesince cookie HttpOnly olur).
  let auth = req.headers.get("authorization");
  if (!auth) {
    const tokenCookie = req.cookies.get("token")?.value;
    if (tokenCookie) auth = `Bearer ${tokenCookie}`;
  }

  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Fire-and-forget: log forwarder kullaniciyi bekletmesin.
  fetch(`${BACKEND_URL}/internal/logs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: bodyText,
  }).catch(() => {
    /* swallow — log loglama hatasi yapmasin */
  });

  return NextResponse.json({ ok: true });
}

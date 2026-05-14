// ── API URL ────────────────────────────────────────────────────────────────
// Production'da NEXT_PUBLIC_API_URL zorunludur. Fallback yok — env eksikse
// hata fırlatıp early-fail oluruz. Dev'de localhost:8080 default'u var.
function resolveApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv;

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:8080";
  }

  throw new Error(
    "NEXT_PUBLIC_API_URL environment variable is not set. " +
      "Production build veya runtime konfigurasyonu eksik."
  );
}

export const API_URL = resolveApiUrl();

// ── Token mimarisi ─────────────────────────────────────────────────────────
//
// - Access token: 15 dakika TTL, BELLEKTE tutulur (XSS yüzeyi minimum).
//   Sayfa yenilenirse kaybolur → bootstrap'ta /auth/refresh ile sessiz yenilenir.
// - Refresh token: backend tarafından HttpOnly Secure SameSite=Strict cookie
//   olarak set edilir. JavaScript okuyamaz. Path=/auth ile sınırlı.
// - Logout: /auth/logout → backend revoke + cookie sil.
//
// Bu tasarım eski localStorage/sessionStorage'da plaintext token tutmaya göre
// XSS karşısında çok daha dayanıklı.

let accessToken: string | null = null;
let accessTokenExpiry: number | null = null; // epoch ms
let onTokenChange: ((token: string | null) => void) | null = null;

export function getToken(): string | null {
  return accessToken;
}

export function setToken(token: string, expiresInSeconds: number) {
  accessToken = token;
  accessTokenExpiry = Date.now() + expiresInSeconds * 1000;
  if (onTokenChange) onTokenChange(token);
}

export function clearToken() {
  accessToken = null;
  accessTokenExpiry = null;
  if (onTokenChange) onTokenChange(null);
}

export function isTokenExpiringSoon(thresholdSeconds = 60): boolean {
  if (!accessTokenExpiry) return true;
  return accessTokenExpiry - Date.now() < thresholdSeconds * 1000;
}

export function subscribeTokenChange(cb: (token: string | null) => void): () => void {
  onTokenChange = cb;
  return () => {
    onTokenChange = null;
  };
}

// ── Request ID & ApiError ─────────────────────────────────────────────────

export function newRequestId(): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return "req-" + rand.replace(/-/g, "").slice(0, 8);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly fieldErrors?: Record<string, string>,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "ApiError";
  }

  fieldError(field: string): string | undefined {
    return this.fieldErrors?.[field];
  }
}

// ── Refresh token akışı ──────────────────────────────────────────────────
//
// 401 alındığında token yenilenmeye çalışılır. Eş zamanlı 401'leri tek bir
// yenileme isteğinde toplamak için inflight promise paylaşılır.

interface RefreshResponse {
  token: string;
  expiresInSeconds: number;
  forcePasswordChange: boolean;
}

let inflightRefresh: Promise<RefreshResponse> | null = null;

export async function refreshAccessToken(): Promise<RefreshResponse> {
  if (inflightRefresh) return inflightRefresh;

  inflightRefresh = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include", // refresh cookie'sini gönder
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiError(
          res.status,
          body?.code ?? "AUTH-401",
          body?.message ?? "Oturum suresi doldu",
          body?.requestId ?? undefined,
          body?.errors
        );
      }
      const data = (await res.json()) as RefreshResponse;
      setToken(data.token, data.expiresInSeconds);
      return data;
    } finally {
      inflightRefresh = null;
    }
  })();

  return inflightRefresh;
}

/** Logout: backend'i bilgilendir (refresh token revoke) + access token temizle. */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // Sessizce sürdür: network yoksa bile yerel state'i temizle.
  }
  clearToken();
  // Login sayfasinda frontend-tarafindan set ettigimiz `rt` cookie'sini temizle.
  // Bu cookie middleware'in login durumunu anlamasi icin. Backend HttpOnly
  // refresh cookie'sine gectigimizde bu satir gerek kalmadan kaldirilabilir.
  if (typeof document !== "undefined") {
    document.cookie = "rt=; path=/; max-age=0; samesite=lax; secure";
  }
}

// ── Core fetch wrapper ────────────────────────────────────────────────────

interface RequestOptions extends RequestInit {
  requestId?: string;
  /** Token süresi yaklaştıysa istek öncesi otomatik refresh. Default true. */
  autoRefresh?: boolean;
  /** Refresh akışını devre dışı bırak (login/refresh endpoint'lerinde sonsuz döngüyü önler). */
  skipRefresh?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const reqId = options.requestId ?? newRequestId();

  // Proaktif refresh: token bitime yakınsa önceden yenile.
  if (
    options.autoRefresh !== false &&
    !options.skipRefresh &&
    accessToken &&
    isTokenExpiringSoon(60)
  ) {
    try {
      await refreshAccessToken();
    } catch {
      // refresh başarısız: aşağıdaki retry mantığı 401 yakalayıp ele alacak.
    }
  }

  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Request-ID": reqId,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers as Record<string, string>),
    };
    return fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include", // refresh cookie /auth path'inde gönderiliyor
      headers,
    });
  };

  let res: Response;
  try {
    res = await doFetch();
  } catch {
    throw new ApiError(
      0,
      "NET-0",
      "Ağ hatası — sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.",
      reqId
    );
  }

  // 401 → silent refresh + retry (tek defalık).
  if (
    res.status === 401 &&
    !options.skipRefresh &&
    options.autoRefresh !== false &&
    !path.startsWith("/auth/")
  ) {
    try {
      await refreshAccessToken();
      res = await doFetch();
    } catch {
      // refresh başarısız → 401 client'a yansır, yukarı throw aşağıda
    }
  }

  if (!res.ok) {
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10);
      throw new ApiError(
        429,
        "RATE-429",
        `Çok fazla istek gönderildi. ${retryAfter} saniye sonra tekrar deneyin.`,
        res.headers.get("X-Request-ID") ?? reqId,
        undefined,
        retryAfter
      );
    }

    const body = await res.json().catch(() => null);
    const code = body?.code ?? defaultCodeForStatus(res.status);
    const message = body?.message ?? res.statusText ?? "Istek basarisiz";
    const responseReqId =
      body?.requestId ?? res.headers.get("X-Request-ID") ?? reqId;
    const fieldErrors =
      body?.errors && typeof body.errors === "object" ? body.errors : undefined;

    throw new ApiError(res.status, code, message, responseReqId, fieldErrors);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case 400:
      return "VAL-400";
    case 401:
      return "AUTH-401";
    case 403:
      return "AUTH-403";
    case 404:
      return "RES-404";
    case 409:
      return "CONF-409";
    case 413:
      return "FILE-413";
    case 500:
      return "ERR-500";
    default:
      return "UNKNOWN";
  }
}

// ── API helpers ───────────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string, opts: RequestOptions = {}) => request<T>(path, opts),
  post: <T>(path: string, body: unknown, opts: RequestOptions = {}) =>
    request<T>(path, { ...opts, method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown, opts: RequestOptions = {}) =>
    request<T>(path, { ...opts, method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    request<T>(path, {
      ...opts,
      method: "PATCH",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  delete: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    request<T>(path, {
      ...opts,
      method: "DELETE",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),

  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    const reqId = newRequestId();

    if (accessToken && isTokenExpiringSoon(60)) {
      try {
        await refreshAccessToken();
      } catch {
        /* ignore */
      }
    }

    const doFetch = async (): Promise<Response> =>
      fetch(`${API_URL}${path}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "X-Request-ID": reqId,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: formData,
      });

    let res: Response;
    try {
      res = await doFetch();
    } catch {
      throw new ApiError(
        0,
        "NET-0",
        "Ağ hatası — dosya yüklenemedi. Bağlantınızı kontrol edin.",
        reqId
      );
    }

    if (res.status === 401) {
      try {
        await refreshAccessToken();
        res = await doFetch();
      } catch {
        /* ignore */
      }
    }

    if (!res.ok) {
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10);
        throw new ApiError(
          429,
          "RATE-429",
          `Çok fazla istek gönderildi. ${retryAfter} saniye sonra tekrar deneyin.`,
          res.headers.get("X-Request-ID") ?? reqId,
          undefined,
          retryAfter
        );
      }
      const body = await res.json().catch(() => null);
      const code = body?.code ?? defaultCodeForStatus(res.status);
      const message = body?.message ?? res.statusText ?? "Yukleme basarisiz";
      const responseReqId =
        body?.requestId ?? res.headers.get("X-Request-ID") ?? reqId;
      const fieldErrors =
        body?.errors && typeof body.errors === "object" ? body.errors : undefined;
      throw new ApiError(res.status, code, message, responseReqId, fieldErrors);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  },
};

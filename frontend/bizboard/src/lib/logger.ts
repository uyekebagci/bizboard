/**
 * ÇATI Frontend Logger
 * --------------------------------------------------------------
 * Dev   : renkli + emoji + hizali console.log (transport YOK)
 * Prod  : batch buffer (max 25 record / 5s) -> POST /api/logs
 *         error seviyesi: anında flush, keepalive ile tab close'ta da gönderir
 *
 * Field naming backend ile uyumlu (snake_case JSON):
 *   request_id, session_id, user_id, logger, level, message, context, error
 *
 * Kullanım:
 *   logger.info ("auth", "User login successful", { user_id });
 *   logger.error("api",  "Transaction create failed",
 *                { request_id, status: 500 }, err);
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogCategory =
  | "api"
  | "auth"
  | "ui"
  | "store"
  | "router"
  | "perf"
  | "boundary";

// ── Configuration ─────────────────────────────────────────────────────────

const IS_DEV = process.env.NODE_ENV !== "production";
const APP_VER = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
const APP_ENV = process.env.NEXT_PUBLIC_ENV ?? (IS_DEV ? "dev" : "prod");
// v1.6.16+: marka adı ÇATI; backend log ingestion search hala "bizboard-web"
// adıyla yazılmış geçmiş kayıtları da görebilir (öncesinde değiştirilen kayıt yok,
// fakat ileride bu adı "cati-web" olarak güncellersek backend tarafta hem eski
// hem yeni isim ile filtrelenebilir olmalı). Şu an internal stabilite için sabit.
const SVC_NAME = "bizboard-web";
const BATCH_MAX = 25;
const BATCH_MS = 5_000;

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
const MIN_LEVEL: LogLevel =
  (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel) ?? (IS_DEV ? "debug" : "info");

const PALETTE: Record<LogLevel, string> = {
  debug: "color:#9ca3af",
  info: "color:#10b981; font-weight:600",
  warn: "color:#f59e0b; font-weight:600",
  error: "color:#ef4444; font-weight:700",
};
const EMOJI: Record<LogLevel, string> = {
  debug: "🔍",
  info: "✅",
  warn: "⚠️ ",
  error: "🔴",
};

// ── Session ID ────────────────────────────────────────────────────────────

const SESSION_STORAGE_KEY = "bb_session_id";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!id) {
      const rand =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      id = "sess-" + rand.replace(/-/g, "").slice(0, 8);
      sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return "sess-unavailable";
  }
}

// ── Record shape (backend uyumlu snake_case) ──────────────────────────────

interface LogRecord {
  timestamp: string;
  level: LogLevel;
  logger: LogCategory;
  message: string;
  service: string;
  env: string;
  version: string;
  session_id: string;
  request_id?: string;
  user_id?: string;
  url: string;
  user_agent: string;
  context?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
}

// ── Buffer & Transport ────────────────────────────────────────────────────

let buffer: LogRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flush();
  }, BATCH_MS);
}

async function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (buffer.length === 0) return;

  // Buffer'i topla, sonra at — yarı yolda exception olursa kayıt kaybetmemek için.
  const batch = buffer;
  buffer = [];

  try {
    await fetch("/api/logs", {
      method: "POST",
      // keepalive: tab close edilirken bile son request'i gönderir
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: batch }),
    });
  } catch {
    // Sessizce drop — log loglama hatası kullanıcıyı bozmasın.
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flush();
    }
  });
  window.addEventListener("beforeunload", () => {
    void flush();
  });
}

// ── Console formatter (dev) ───────────────────────────────────────────────

function formatConsole(r: LogRecord): void {
  const t = r.timestamp.slice(11, 23); // HH:mm:ss.SSS
  const lvl = r.level.toUpperCase().padEnd(5);
  const cat = `[${r.logger}]`.padEnd(10);
  const head = `%c${t} ${EMOJI[r.level]} ${lvl} ${cat}`;
  const msg = `%c${r.message}`;
  const ctx = r.context && Object.keys(r.context).length > 0 ? r.context : undefined;

  const consoleFn =
    r.level === "error"
      ? console.error
      : r.level === "warn"
        ? console.warn
        : r.level === "debug"
          ? console.debug
          : console.info;

  const args: unknown[] = [head + " " + msg, PALETTE[r.level], "color:inherit"];
  if (ctx) args.push(ctx);
  if (r.error) args.push(r.error);
  consoleFn(...args);
}

// ── Public API ────────────────────────────────────────────────────────────

function emit(
  level: LogLevel,
  category: LogCategory,
  message: string,
  context?: Record<string, unknown>,
  err?: unknown
): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[MIN_LEVEL]) return;

  const record: LogRecord = {
    timestamp: new Date().toISOString(),
    level,
    logger: category,
    message,
    service: SVC_NAME,
    env: APP_ENV,
    version: APP_VER,
    session_id: getOrCreateSessionId(),
    request_id: context?.request_id as string | undefined,
    user_id: context?.user_id as string | undefined,
    url:
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "",
    user_agent:
      typeof navigator !== "undefined" ? navigator.userAgent : "node",
    context,
  };

  if (err instanceof Error) {
    record.error = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  } else if (err !== undefined) {
    record.error = { name: "non-Error", message: String(err) };
  }

  if (IS_DEV) {
    formatConsole(record);
    return; // dev'de transport YOK
  }

  buffer.push(record);
  if (level === "error" || buffer.length >= BATCH_MAX) {
    void flush();
  } else {
    scheduleFlush();
  }
}

export const logger = {
  debug: (
    c: LogCategory,
    m: string,
    ctx?: Record<string, unknown>
  ): void => emit("debug", c, m, ctx),
  info: (
    c: LogCategory,
    m: string,
    ctx?: Record<string, unknown>
  ): void => emit("info", c, m, ctx),
  warn: (
    c: LogCategory,
    m: string,
    ctx?: Record<string, unknown>
  ): void => emit("warn", c, m, ctx),
  error: (
    c: LogCategory,
    m: string,
    ctx?: Record<string, unknown>,
    e?: unknown
  ): void => emit("error", c, m, ctx, e),
};

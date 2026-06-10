/**
 * WP 4f6baaa3 (Beta v1.1 · UI/UX): Global toast wrapper.
 *
 * <p>react-hot-toast üzerinde ince bir katman — ApiError tipini otomatik açar
 * (message/code/requestId), Web Audio API ile kısa bir ses verir (success ding /
 * error buzz), `aria-live="polite"` toaster ile screen reader uyumludur.</p>
 *
 * <p>Ses çalmayı kapatmak isteyen kullanıcı için
 * <code>localStorage.setItem("cati.toast.muted", "1")</code> yeterli.</p>
 *
 * <p>Tüm CRUD mutation noktaları bu modülü çağırır: AddTransactionForm,
 * TransferForm, AddPaymentModal, WriteoffModal, ClosureQuickAddModal,
 * QuickActionExecute, vs.</p>
 */
import hotToast, { type ToastOptions } from "react-hot-toast";
import { ApiError } from "@/lib/api/client";

// ── Ses motoru (Web Audio API) ────────────────────────────────────────────

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  try {
    const W = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = W.AudioContext || W.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

function isMuted(): boolean {
  try {
    return localStorage.getItem("cati.toast.muted") === "1";
  } catch {
    return false;
  }
}

/**
 * Tek bir oscillator notası çal — kısa fade-in/out ile click sesi engellenir.
 *
 * @param freq Frekans (Hz)
 * @param durMs Süre (ms)
 * @param startOffsetMs Çalma başlangıç offset'i (ms)
 * @param type Dalga tipi (default sine = yumuşak)
 * @param peakGain Tepe gain (0..1, default 0.06 = sessiz)
 */
function playTone(
  freq: number,
  durMs: number,
  startOffsetMs = 0,
  type: OscillatorType = "sine",
  peakGain = 0.06,
): void {
  const ctx = getCtx();
  if (!ctx) return;
  // Bazı tarayıcılarda kullanıcı etkileşimi sonrası suspended kalabilir.
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const now = ctx.currentTime + startOffsetMs / 1000;
  const dur = durMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Linear ramp ile yumuşak attack/release — click sesini önler.
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + 0.012);
  gain.gain.linearRampToValueAtTime(0, now + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

function soundSuccess() {
  if (isMuted()) return;
  // C5 (523) → E5 (659) — kısa, neşeli "ding-ding"
  playTone(523.25, 90, 0);
  playTone(659.25, 110, 70);
}

function soundError() {
  if (isMuted()) return;
  // 220 Hz square — alçak, kısa "buzz"
  playTone(220, 180, 0, "square", 0.05);
  playTone(165, 180, 120, "square", 0.04);
}

function soundInfo() {
  if (isMuted()) return;
  // Tek nota E5 — nötr "blip"
  playTone(659.25, 90, 0, "sine", 0.045);
}

// ── ApiError mesaj çıkarma ────────────────────────────────────────────────

/**
 * Backend hata mesajını kullanıcı dostu metne dönüştürür.
 *
 * <p>Tercih sırası:</p>
 * <ol>
 *   <li>Network hatası (code NET-0): "Bağlantı sorunu, lütfen tekrar deneyin"</li>
 *   <li>Rate limit (429): zaten kullanıcı dostu Türkçe</li>
 *   <li>Field errors var ise: ilk field hatası</li>
 *   <li>ApiError.message (backend response)</li>
 *   <li>Generic Error.message</li>
 *   <li>Fallback "Bir hata oluştu"</li>
 * </ol>
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "NET-0") {
      return "Bağlantı sorunu, lütfen tekrar deneyin";
    }
    if (err.fieldErrors) {
      const firstField = Object.keys(err.fieldErrors)[0];
      if (firstField) return err.fieldErrors[firstField];
    }
    if (err.message && err.message.length > 0) return err.message;
    return "İşlem başarısız";
  }
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return "Bir hata oluştu";
}

// ── Public API ────────────────────────────────────────────────────────────

const successDefaults: ToastOptions = {
  duration: 3500,
  position: "top-right",
  style: {
    background: "linear-gradient(180deg,#125e3c,#0f5132)",
    color: "#d1fae5",
    border: "1px solid rgba(16,185,129,0.35)",
    fontSize: "13px",
    fontWeight: 500,
    borderRadius: "12px",
    padding: "11px 15px",
    boxShadow: "0 10px 30px -12px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset",
  },
  iconTheme: { primary: "#10b981", secondary: "#0f5132" },
};

const errorDefaults: ToastOptions = {
  duration: 5500,
  position: "top-right",
  style: {
    background: "linear-gradient(180deg,#5a2526,#491e1f)",
    color: "#fecaca",
    border: "1px solid rgba(244,63,94,0.4)",
    fontSize: "13px",
    fontWeight: 500,
    borderRadius: "12px",
    padding: "11px 15px",
    boxShadow: "0 10px 30px -12px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset",
  },
  iconTheme: { primary: "#f43f5e", secondary: "#491e1f" },
};

const infoDefaults: ToastOptions = {
  duration: 3500,
  position: "top-right",
  style: {
    background: "linear-gradient(180deg,#27364d,#1e293b)",
    color: "#cbd5e1",
    border: "1px solid rgba(148,163,184,0.35)",
    fontSize: "13px",
    fontWeight: 500,
    borderRadius: "12px",
    padding: "11px 15px",
    boxShadow: "0 10px 30px -12px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset",
  },
};

const warningDefaults: ToastOptions = {
  duration: 4500,
  position: "top-right",
  style: {
    background: "linear-gradient(180deg,#53290a,#422006)",
    color: "#fde68a",
    border: "1px solid rgba(245,158,11,0.4)",
    fontSize: "13px",
    fontWeight: 500,
    borderRadius: "12px",
    padding: "11px 15px",
    boxShadow: "0 10px 30px -12px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset",
  },
};

export const toast = {
  success(message: string, opts?: ToastOptions): string {
    soundSuccess();
    return hotToast.success(message, { ...successDefaults, ...opts });
  },
  /**
   * Hata toast'u. <code>err</code> string, Error veya ApiError olabilir;
   * ApiError ise mesaj otomatik çıkarılır.
   */
  error(err: unknown, opts?: ToastOptions): string {
    const msg = extractErrorMessage(err);
    soundError();
    return hotToast.error(msg, { ...errorDefaults, ...opts });
  },
  info(message: string, opts?: ToastOptions): string {
    soundInfo();
    return hotToast(message, { ...infoDefaults, ...opts });
  },
  warning(message: string, opts?: ToastOptions): string {
    // warning için ayrı ses yok — info-tone yeter.
    soundInfo();
    return hotToast(message, {
      ...warningDefaults,
      ...opts,
      icon: opts?.icon ?? "⚠️",
    });
  },
  /** Manuel dismiss (örn. uzun süreli toast'u kapatmak için). */
  dismiss(id?: string) {
    hotToast.dismiss(id);
  },
  /** Tüm aktif toast'ları temizle. */
  clear() {
    hotToast.dismiss();
  },
};

/** Kullanıcı sessize alma tercihi (Settings sayfasından bağlanabilir). */
export const toastSound = {
  isMuted,
  mute() {
    try { localStorage.setItem("cati.toast.muted", "1"); } catch { /* ignore */ }
  },
  unmute() {
    try { localStorage.removeItem("cati.toast.muted"); } catch { /* ignore */ }
  },
};

"use client";

/**
 * Telegram bot MVP: Profil/Bildirim ayarlarında "Telegram Bağla" bölümü.
 *
 * <p>Akış: GET status → bağlı değilse "Bağla" → POST link-code → kod + deep-link
 * göster (mobilde tıkla aç). Bağlıysa "Bağlı ✅ / Kaldır". Self-contained; başka
 * logic'e dokunmaz. Glass dili.</p>
 */

import { useEffect, useState } from "react";
import { Send, Loader2, Check, Copy, ExternalLink } from "lucide-react";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";

interface Status { linked: boolean; botConfigured: boolean }
interface LinkCode { code: string; deeplink: string; expiresAt: string }

export function TelegramLinkSection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [code, setCode] = useState<LinkCode | null>(null);

  async function loadStatus() {
    try {
      setStatus(await api.get<Status>("/api/me/notifications/telegram/status"));
    } catch {
      setStatus({ linked: false, botConfigured: false });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void loadStatus(); }, []);

  async function handleLink() {
    setIssuing(true);
    try {
      setCode(await api.post<LinkCode>("/api/me/notifications/telegram/link-code", {}));
    } catch (e) {
      toast.error(e);
    } finally {
      setIssuing(false);
    }
  }

  async function handleUnlink() {
    setUnlinking(true);
    try {
      await api.delete("/api/me/notifications/telegram/link");
      setCode(null);
      await loadStatus();
      toast.info("Telegram bağlantısı kaldırıldı");
    } catch (e) {
      toast.error(e);
    } finally {
      setUnlinking(false);
    }
  }

  if (loading) return null;
  // Bot yapılandırılmadıysa bölümü gösterme (token/username yok).
  if (!status?.botConfigured) return null;

  return (
    <section className="v2-card rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-accent/15 grid place-items-center">
          <Send size={18} className="text-[rgb(var(--accent))]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-[rgb(var(--v2-ink))]">Telegram Bildirimleri</h3>
          <p className="text-[11px] text-[rgb(var(--v2-muted))]">Bildirimleri Telegram&apos;dan da alın.</p>
        </div>
        {status.linked && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] font-medium">
            <Check size={11} /> Bağlı
          </span>
        )}
      </div>

      {status.linked ? (
        <button
          onClick={handleUnlink}
          disabled={unlinking}
          className="w-full py-2.5 rounded-xl bg-[rgb(var(--v2-sunken))] hover:bg-[rgb(var(--v2-border))] text-[rgb(var(--v2-ink))] text-sm font-medium border border-[rgb(var(--v2-border))] disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {unlinking ? <Loader2 size={14} className="animate-spin" /> : null}
          Bağlantıyı Kaldır
        </button>
      ) : code ? (
        <div className="space-y-2">
          <p className="text-[11px] text-[rgb(var(--v2-muted))]">
            Aşağıdaki bağlantıya tıklayın (mobilde Telegram açılır) ya da botta
            <span className="text-[rgb(var(--v2-ink))]"> /start {code.code}</span> yazın.
          </p>
          <div className="flex items-center gap-2">
            <code className="num flex-1 text-center text-lg font-bold tracking-widest text-[rgb(var(--v2-ink))] bg-[rgb(var(--v2-sunken))] border border-[rgb(var(--v2-border))] rounded-xl py-2">
              {code.code}
            </code>
            <button
              onClick={() => { navigator.clipboard?.writeText(code.code); toast.success("Kod kopyalandı"); }}
              title="Kodu kopyala"
              className="p-2.5 rounded-xl bg-[rgb(var(--v2-sunken))] hover:bg-[rgb(var(--v2-border))] text-[rgb(var(--v2-muted))]"
            >
              <Copy size={16} />
            </button>
          </div>
          <a
            href={code.deeplink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 rounded-xl v2-btn v2-btn--accent text-sm font-semibold inline-flex items-center justify-center gap-2"
            onClick={() => { setTimeout(() => void loadStatus(), 4000); }}
          >
            <ExternalLink size={15} /> Telegram'da Aç
          </a>
          <button
            onClick={() => void loadStatus()}
            className="w-full text-[11px] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
          >
            Bağladım, durumu yenile
          </button>
        </div>
      ) : (
        <button
          onClick={handleLink}
          disabled={issuing}
          className="w-full py-2.5 rounded-xl v2-btn v2-btn--accent text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {issuing ? <Loader2 size={14} className="animate-spin" /> : <Send size={15} />}
          Telegram Bağla
        </button>
      )}
    </section>
  );
}

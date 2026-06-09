"use client";

/**
 * WP f1fa3cd5 (otomasyon): Per-event bildirim tercih matrisi.
 *
 * <p>Satır = event (Türkçe etiket), kolon = kanal (In-App | Telegram), hücre = toggle.
 * Backend: GET/PUT /notifications/preferences. Default: In-App AÇIK, Telegram KAPALI
 * (opt-in). Telegram bağlantısı için üstte {@link TelegramLinkSection}.</p>
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { TelegramLinkSection } from "./TelegramLinkSection";

type Channel = "IN_APP" | "TELEGRAM";
interface Pref { event: string; channel: Channel; enabled: boolean }

// Gösterilecek event'ler + Türkçe etiket (backend NotificationEvent enum ile eşleşir).
const EVENTS: { key: string; label: string }[] = [
  { key: "DEBT_DUE_SOON", label: "Borç/alacak vadesi yaklaştı" },
  { key: "CHEQUE_DUE_SOON", label: "Çek/senet vadesi yaklaştı" },
  { key: "PAYMENT_RECEIVED", label: "Ödeme alındı" },
  { key: "CASH_CLOSING_REMINDER", label: "Kasa kapanışı hatırlatması" },
  { key: "TAX_DEADLINE_DUE_SOON", label: "Vergi son tarihi yaklaştı" },
  { key: "LOW_STOCK", label: "Düşük stok" },
  { key: "WARRANTY_EXPIRING", label: "Garanti bitiyor" },
  { key: "NEW_TRANSACTION", label: "Yeni işlem" },
  { key: "FIRM_ACCESS_GRANTED", label: "Firma erişimi verildi" },
];

// Default (kayıt yoksa): In-App açık, Telegram kapalı (backend ile aynı semantik).
function defaultEnabled(channel: Channel): boolean {
  return channel === "IN_APP";
}

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const cellKey = (ev: string, ch: Channel) => `${ev}|${ch}`;

  useEffect(() => {
    api.get<Pref[]>("/notifications/preferences")
      .then((list) => {
        const map: Record<string, boolean> = {};
        for (const p of list || []) map[cellKey(p.event, p.channel)] = p.enabled;
        setPrefs(map);
      })
      .catch(() => setPrefs({}))
      .finally(() => setLoading(false));
  }, []);

  function isOn(ev: string, ch: Channel): boolean {
    const k = cellKey(ev, ch);
    return k in prefs ? prefs[k] : defaultEnabled(ch);
  }

  async function toggle(ev: string, ch: Channel) {
    const k = cellKey(ev, ch);
    const next = !isOn(ev, ch);
    setPrefs((p) => ({ ...p, [k]: next }));
    setSaving(k);
    try {
      await api.put("/notifications/preferences", { event: ev, channel: ch, enabled: next });
    } catch (e) {
      setPrefs((p) => ({ ...p, [k]: !next })); // geri al
      toast.error(e);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <TelegramLinkSection />

      <section className="glass-card p-5">
        <h3 className="text-sm font-bold text-white mb-1">Bildirim Tercihleri</h3>
        <p className="text-[11px] text-surface-400 mb-3">
          Hangi olayda hangi kanaldan bildirim alacağınızı seçin. Telegram kapalıysa
          yalnız uygulama içi gösterilir.
        </p>

        {loading ? (
          <div className="py-6 flex justify-center"><Loader2 size={18} className="animate-spin text-surface-400" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-surface-400">
                  <th className="text-left font-medium py-2">Olay</th>
                  <th className="text-center font-medium py-2 w-20">Uygulama</th>
                  <th className="text-center font-medium py-2 w-20">Telegram</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-700/60">
                {EVENTS.map((ev) => (
                  <tr key={ev.key} className="row-hover">
                    <td className="py-2.5 text-surface-200">{ev.label}</td>
                    {(["IN_APP", "TELEGRAM"] as Channel[]).map((ch) => {
                      const on = isOn(ev.key, ch);
                      const busy = saving === cellKey(ev.key, ch);
                      return (
                        <td key={ch} className="text-center py-2.5">
                          <button
                            onClick={() => toggle(ev.key, ch)}
                            disabled={busy}
                            role="switch"
                            aria-checked={on}
                            aria-label={`${ev.label} — ${ch === "IN_APP" ? "Uygulama" : "Telegram"}`}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              on ? "bg-brand-600" : "bg-surface-600"
                            } ${busy ? "opacity-60" : ""}`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              on ? "translate-x-4" : "translate-x-1"
                            }`} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

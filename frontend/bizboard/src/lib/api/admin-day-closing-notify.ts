/**
 * Gün-Kapanışı Telegram Bildirimi (admin) — API istemcisi + tipler.
 *
 * <p>Backend {@code AdminDayClosingNotifyController} (/admin/day-closing-notify/**),
 * ADMIN-only. İşletme-başına tek toggle (<b>default KAPALI</b>). Bu controller
 * yanıtlarında BİLİNÇLİ snake_case anahtar kullanır ({@code business_id},
 * {@code enabled}) — tipler ona göre.</p>
 *
 * <ul>
 *   <li>{@code GET  /config?business_id=} — mevcut tercih</li>
 *   <li>{@code PUT  /config?business_id=} — tercihi güncelle (aktive/deaktive)</li>
 *   <li>{@code POST /test?business_id=&date=} — TEST: gün-özeti gövdesini ÖNİZLE
 *       (gerçek gönderim YAPMAZ).</li>
 * </ul>
 */

import { api } from "@/lib/api/client";

export interface DayClosingNotifyConfig {
  business_id: string;
  enabled: boolean;
}

export interface DayClosingNotifyTestPreview {
  business_id: string;
  date: string | null;
  enabled: boolean;
  title: string;
  summary: string;
}

export function getDayClosingNotifyConfig(
  businessId: string,
): Promise<DayClosingNotifyConfig> {
  return api.get<DayClosingNotifyConfig>(
    `/admin/day-closing-notify/config?business_id=${encodeURIComponent(businessId)}`,
  );
}

export function setDayClosingNotifyConfig(
  businessId: string,
  enabled: boolean,
): Promise<DayClosingNotifyConfig> {
  return api.put<DayClosingNotifyConfig>(
    `/admin/day-closing-notify/config?business_id=${encodeURIComponent(businessId)}`,
    { enabled },
  );
}

/**
 * TEST/önizleme — gerçek Telegram gönderimi YAPMAZ; verilen tarihin (yoksa en
 * son CLOSED kapanışın) özet gövdesini döner. {@code date} ISO (YYYY-MM-DD).
 */
export function testDayClosingNotify(
  businessId: string,
  date?: string,
): Promise<DayClosingNotifyTestPreview> {
  const qs = new URLSearchParams({ business_id: businessId });
  if (date && date.trim()) qs.set("date", date.trim());
  return api.post<DayClosingNotifyTestPreview>(
    `/admin/day-closing-notify/test?${qs.toString()}`,
    {},
  );
}

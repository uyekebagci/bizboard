package com.bizboard.common.enums;

/**
 * v1.6.18 (WP-1): Günlük kasa kapanışı durumu.
 *
 * <ul>
 *   <li>{@link #PENDING} — Gün henüz kapatılmadı (sistem otomatik kayıt açtı,
 *       kullanıcı onayı bekleniyor)</li>
 *   <li>{@link #CLOSED} — Gün kapatıldı; bakiye sabitlendi</li>
 *   <li>{@link #REOPENED} — Kapatılmış gün tekrar açıldı (düzeltme için)</li>
 * </ul>
 */
public enum CashClosingStatus {
    PENDING,
    CLOSED,
    REOPENED
}

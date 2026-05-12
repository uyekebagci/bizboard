/**
 * Open redirect koruması — login sonrası yönlendirme yapan her yerde kullan.
 *
 * Kabul: same-origin relative path ("/" ile başlayan, ama "//" ile başlamayan,
 *        control karakteri içermeyen, max 512 char).
 * Red:   "https://evil.com", "//evil.com", "/\\evil.com", control char, çok uzun.
 *
 * Saldırı senaryosu:
 *   /auth/login?redirect=https://evil.com/fake-login
 *   → kullanıcı login olur → router.push(redirect) → phishing
 */
export function isSafeRedirectPath(value: string | null | undefined): boolean {
  if (!value) return false;
  if (value.length > 512) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.startsWith("/\\")) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

/** Verilen değer güvenli ise döndürür, değilse fallback. */
export function safeRedirectOr(
  value: string | null | undefined,
  fallback: string
): string {
  return isSafeRedirectPath(value) ? (value as string) : fallback;
}

/**
 * Catch bloklarinda `err: unknown` ile guvenli mesaj cikarimi.
 * ESLint @typescript-eslint/no-explicit-any kurali ile uyumlu.
 *
 *   try {
 *     await api.post(...);
 *   } catch (err: unknown) {
 *     setError(getErrorMessage(err, "Beklenen mesaj"));
 *   }
 */
export function getErrorMessage(err: unknown, fallback = "Bir hata olustu"): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err;
  return fallback;
}

/** ApiError'in code'unu cikar (varsa). client.ts'deki ApiError ile uyumlu. */
export function getErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === "string") return c;
  }
  return null;
}

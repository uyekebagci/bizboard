/**
 * Test / staging ortami sabit banner'i. Operator/geliştirici hangi ortamda
 * calistigini hep gorsun (production'la karistirmasin diye).
 *
 * Render edilme kosulu: NEXT_PUBLIC_ENV === "test" veya "staging".
 * Production (default) ve dev'de hicbir sey render edilmez.
 */
export function EnvironmentBanner() {
  const env = process.env.NEXT_PUBLIC_ENV;
  if (env !== "test" && env !== "staging") return null;

  const isTest = env === "test";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`px-4 py-1.5 text-xs font-semibold text-center ${
        isTest
          ? "bg-amber-500/20 text-amber-200 border-b border-amber-500/40"
          : "bg-purple-500/20 text-purple-200 border-b border-purple-500/40"
      }`}
    >
      {isTest
        ? "⚠️ TEST ORTAMI — Veriler her gece prod'dan yenilenir, degisiklikleriniz kalici degildir"
        : "🟣 STAGING ORTAMI"}
    </div>
  );
}

/**
 * v1.6.2.2: sürüm display formatlayıcı.
 *
 * Versiyonlama kuralı (ÇATI):
 * - Maven pom.xml 4-component native destekler: `1.6.2.1`, `1.6.3` vb.
 * - npm package.json SemVer strict; hotfix için pre-release tag kullanılır:
 *   - `1.6.3` → planlı sürüm (3-component)
 *   - `1.6.3-1` → 1.6.3 üzerine hotfix #1
 *   - `1.6.3-2` → 1.6.3 üzerine hotfix #2
 *
 * UI'da hotfix yoksa 3-component göster, varsa 4-component:
 * - "1.6.3"   → "1.6.3"
 * - "1.6.3-1" → "1.6.3.1"
 * - "1.6.3-0" → "1.6.3"  (0 hotfix = baseline, asla gösterilmez)
 *
 * Diğer pre-release formatları olduğu gibi gösterilir (örn. "1.7.0-rc.1").
 */
export function formatVersion(raw: string | undefined | null): string {
  if (!raw) return "?";
  const m = raw.match(/^(\d+\.\d+\.\d+)-(\d+)$/);
  if (m) {
    const base = m[1];
    const hotfix = parseInt(m[2], 10);
    return hotfix > 0 ? `${base}.${hotfix}` : base;
  }
  return raw;
}

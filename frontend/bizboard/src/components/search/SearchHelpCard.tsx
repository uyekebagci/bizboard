"use client";

/**
 * v2.2.0 — "İleri seviye arama" yardım kartı (spec §10.6).
 *
 * Boş input'ta gösterilir: örnek sorgular (tıklanabilir) + field referansı.
 * Çift tema: glass-card / surface-* token'ları.
 */

import { Sparkles } from "lucide-react";

const EXAMPLES: { query: string; desc: string }[] = [
  { query: "tip:transaction kategori:KIRA tutar:>5000", desc: "Kira kategorisinde 5.000₺ üstü işlemler" },
  { query: 'isletme:"Veli" tarih:son-ay', desc: "Veli işletmesi, son bir aydaki kayıtlar" },
  { query: '"yıllık kira"', desc: "Tam ifade (exact phrase) araması" },
  { query: "kira NOT kasa", desc: "Kira içeren ama kasa içermeyen" },
  { query: "tip:debt durum:odenmemis", desc: "Ödenmemiş borç/alacaklar" },
];

const FIELDS: { token: string; desc: string }[] = [
  { token: "tip:", desc: "transaction, cari, borc, personel, hesap, firmam, cek, pos, envanter, arac, not, sabit, altkasa, grup, isletme" },
  { token: "isletme:", desc: "İşletme adı" },
  { token: "kategori:", desc: "Kategori" },
  { token: "tutar:", desc: ">5000, <1000, 1000..5000" },
  { token: "tarih:", desc: "2026-01, son-hafta, 2026-01..2026-03" },
  { token: "durum:", desc: "odenmemis / odendi (borç)" },
  { token: "vkn: / iban:", desc: "Yetki gerekli (maskeli döner)" },
];

export function SearchHelpCard({ onExample }: { onExample: (q: string) => void }) {
  return (
    <div className="max-w-3xl mx-auto v2-card !rounded-2xl p-6 md:p-8">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles size={20} className="text-brand-400" />
        <h2 className="text-lg font-semibold text-[rgb(var(--v2-ink))]">İleri Seviye Arama</h2>
      </div>

      <section className="mb-6">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--v2-muted))] mb-2">
          Örnekler
        </h3>
        <ul className="space-y-2">
          {EXAMPLES.map((ex) => (
            <li key={ex.query}>
              <button
                onClick={() => onExample(ex.query)}
                className="w-full text-left row-hover rounded-xl px-3 py-2 transition-colors"
              >
                <code className="text-sm text-brand-300 font-mono">{ex.query}</code>
                <p className="text-xs text-[rgb(var(--v2-muted))] mt-0.5">{ex.desc}</p>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--v2-muted))] mb-2">
          Alanlar
        </h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {FIELDS.map((f) => (
            <div key={f.token} className="flex items-baseline gap-2">
              <dt className="text-sm font-mono text-[rgb(var(--v2-ink))] shrink-0">{f.token}</dt>
              <dd className="text-xs text-[rgb(var(--v2-muted))]">{f.desc}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-xs text-[rgb(var(--v2-muted))]/70 mt-6">
        İpucu: Boşluk = VE (AND). <code className="font-mono">OR</code>,{" "}
        <code className="font-mono">NOT</code> ve tırnak{" "}
        <code className="font-mono">&quot;...&quot;</code> desteklenir. Üst bardan{" "}
        <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))]">/</kbd>{" "}
        ile hızlı arama açılır.
      </p>
    </div>
  );
}

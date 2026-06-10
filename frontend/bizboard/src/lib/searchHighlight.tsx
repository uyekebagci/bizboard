// v2.2.0 — server `<mark>` highlight'lı snippet'i güvenle React'a çevirir.
//
// Güvenlik (spec §10.3): server zaten metni HTML-escape edip yalnız <mark>
// ekler. Yine de FE tarafında defense-in-depth: stringi <mark>...</mark>
// sınırından parçalayıp React element'lerine çeviririz — `dangerouslySetInnerHTML`
// KULLANILMAZ, böylece beklenmedik bir tag asla DOM'a girmez.

import React from "react";

const MARK_SPLIT = /(<mark>.*?<\/mark>)/g;

/** HTML entity'leri geri çöz (server escape ettiği için görüntüde düz metin). */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function renderSnippet(snippet: string): React.ReactNode {
  if (!snippet) return null;
  const parts = snippet.split(MARK_SPLIT).filter(Boolean);
  return parts.map((part, i) => {
    const m = part.match(/^<mark>(.*?)<\/mark>$/);
    if (m) {
      return (
        <mark
          key={i}
          className="bg-brand-500/30 text-brand-200 rounded px-0.5"
        >
          {decodeEntities(m[1])}
        </mark>
      );
    }
    return <React.Fragment key={i}>{decodeEntities(part)}</React.Fragment>;
  });
}

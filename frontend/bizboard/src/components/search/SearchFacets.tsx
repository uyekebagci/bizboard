"use client";

/**
 * v2.2.0 — faceted filtre paneli (spec §10.2).
 *
 * Entity tipi checkbox'ları (sayımlı), işletme/kategori/tarih facet özetleri.
 * Tip seçimi parent'a callback ile bildirilir (sorguyu yeniden tetikler).
 *
 * Çift tema: surface-* token'ları.
 */

import {
  ENTITY_LABELS,
  type SearchEntityType,
  type SearchFacets as Facets,
} from "@/lib/api/search";

interface Props {
  facets: Facets;
  selectedTypes: SearchEntityType[];
  onToggleType: (type: SearchEntityType) => void;
}

export function SearchFacets({ facets, selectedTypes, onToggleType }: Props) {
  const typeEntries = Object.entries(facets.byType) as [SearchEntityType, number][];

  return (
    <div className="space-y-6">
      {/* Entity tipi */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-surface-500 mb-2">
          Tip
        </h3>
        {typeEntries.length === 0 ? (
          <p className="text-xs text-surface-500">—</p>
        ) : (
          <ul className="space-y-1">
            {typeEntries.map(([type, count]) => {
              const checked = selectedTypes.includes(type);
              return (
                <li key={type}>
                  <label className="flex items-center gap-2 text-sm text-surface-300 cursor-pointer row-hover rounded-lg px-2 py-1 -mx-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleType(type)}
                      className="accent-brand-500"
                    />
                    <span className="flex-1">{ENTITY_LABELS[type] ?? type}</span>
                    <span className="text-xs text-surface-500">{count}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <FacetGroup title="İşletme" data={facets.byBusiness} />
      <FacetGroup title="Kategori" data={facets.byCategory} />

      {facets.byDateBucket.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-surface-500 mb-2">
            Tarih
          </h3>
          <ul className="space-y-1">
            {facets.byDateBucket.map((b) => (
              <li
                key={b.month}
                className="flex items-center justify-between text-sm text-surface-300 px-2 py-1"
              >
                <span>{b.month}</span>
                <span className="text-xs text-surface-500">{b.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FacetGroup({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).slice(0, 8);
  if (entries.length === 0) return null;
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-surface-500 mb-2">
        {title}
      </h3>
      <ul className="space-y-1">
        {entries.map(([name, count]) => (
          <li
            key={name}
            className="flex items-center justify-between text-sm text-surface-300 px-2 py-1"
          >
            <span className="truncate">{name}</span>
            <span className="text-xs text-surface-500 shrink-0 ml-2">{count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

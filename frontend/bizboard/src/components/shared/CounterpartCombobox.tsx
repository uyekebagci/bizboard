"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, X, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { DarkSelect } from "@/components/shared/DarkSelect";
import type { Counterpart, CounterpartRole } from "@/types";

interface Props {
  /** Şu an seçilmiş counterpart id. */
  value: string | null;
  /** Free-text — counterpart seçilmediği durumda da formda kullanılır (eski string yedek). */
  textValue: string;
  /**
   * (counterpartId, text) — id null ise free-text mode. Yeni firma oluşturulduğunda
   * id + name iletilir.
   */
  onChange: (counterpartId: string | null, text: string) => void;
  /** "Kimden Alınacak" gibi label; alanın üstünde gösterilir. */
  label?: string;
  /** Inline yeni firma için varsayılan rol (CUSTOMER vs SUPPLIER). */
  defaultNewRole?: CounterpartRole;
  placeholder?: string;
}

/**
 * Counterpart seçim/oluşturma combobox.
 *
 * <p>Davranış:</p>
 * <ul>
 *   <li>Mount'ta {@code GET /counterparts} ile listeyi çeker (küçük tutulur — frontend filter).</li>
 *   <li>Kullanıcı yazarken liste filtrelenir; tıklayınca {@code value} set olur, free-text counterpart.name'e güncellenir.</li>
 *   <li>Liste sonunda "{searchText}'i karşı firma olarak oluştur" item'ı görünür; tıklayınca minimum form modal açılır (name + role). POST ile yeni counterpart kaydı, ardından seçim otomatik yapılır.</li>
 *   <li>X butonu ile seçim temizlenir, free-text mode'a döner.</li>
 * </ul>
 */
export function CounterpartCombobox({
  value,
  textValue,
  onChange,
  label,
  defaultNewRole = "CUSTOMER",
  placeholder = "Karsi firma sec veya ad gir...",
}: Props) {
  const [list, setList] = useState<Counterpart[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [createPrompt, setCreatePrompt] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tek seferlik fetch.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<Counterpart[]>("/counterparts")
      .then((data) => {
        if (!cancelled) setList(data || []);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Dış tıklama → kapat
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = textValue.trim().toLocaleLowerCase("tr");
    if (!q) return list.slice(0, 20);
    return list
      .filter((c) => c.name.toLocaleLowerCase("tr").includes(q))
      .slice(0, 20);
  }, [list, textValue]);

  // Kullanıcı text değiştirdiğinde value'yu reset etmiyoruz; sadece text drop edilirse temizlenir.
  function handleSelect(c: Counterpart) {
    onChange(c.id, c.name);
    setOpen(false);
  }

  function handleClear() {
    onChange(null, "");
  }

  function handleCreated(c: Counterpart) {
    setList((prev) => [c, ...prev]);
    onChange(c.id, c.name);
    setCreatePrompt(false);
    setOpen(false);
  }

  // text var ama tam eşleşme yoksa "oluştur" CTA göster.
  const exactMatch = filtered.some(
    (c) => c.name.toLocaleLowerCase("tr") === textValue.trim().toLocaleLowerCase("tr")
  );
  const showCreateCta = textValue.trim().length >= 2 && !exactMatch;

  const selectedName = value
    ? list.find((c) => c.id === value)?.name ?? textValue
    : null;

  return (
    <div ref={containerRef} className="relative">
      {label && <label className="label">{label}</label>}
      <div
        className={cn(
          "input flex items-center gap-2 cursor-text",
          selectedName && "border-brand-500"
        )}
        onClick={() => setOpen(true)}
      >
        {selectedName ? (
          <>
            <span className="px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 text-xs font-medium">
              {selectedName}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              className="ml-auto p-0.5 rounded hover:bg-white/10 text-surface-400 hover:text-white"
              title="Secimi kaldir"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              value={textValue}
              onFocus={() => setOpen(true)}
              onChange={(e) => onChange(null, e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-transparent border-0 outline-none text-sm placeholder-surface-400 text-white"
            />
            <ChevronDown size={16} className="text-surface-400 shrink-0" />
          </>
        )}
      </div>

      {open && !selectedName && (
        <div className="absolute z-30 mt-1 left-0 right-0 max-h-64 overflow-y-auto rounded-xl bg-surface-800 border border-surface-600 shadow-card-hover">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-surface-400">
              <Loader2 size={14} className="animate-spin" />
              Yukleniyor...
            </div>
          ) : error ? (
            <div className="px-3 py-3 text-xs text-red-400">{error}</div>
          ) : (
            <>
              {filtered.length === 0 && !showCreateCta && (
                <div className="px-3 py-3 text-xs text-surface-400">
                  Esleson kayit yok. Yazmaya devam et.
                </div>
              )}
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full text-left px-3 py-2 hover:bg-surface-700 transition-colors"
                >
                  <div className="text-sm text-white truncate">{c.name}</div>
                  <div className="text-[10px] text-surface-400 flex gap-2">
                    <span>{roleLabel(c.role)}</span>
                    {c.tax_id && <span>{c.tax_id}</span>}
                  </div>
                </button>
              ))}
              {showCreateCta && (
                <button
                  type="button"
                  onClick={() => setCreatePrompt(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 border-t border-surface-700 hover:bg-surface-700/50 transition-colors text-brand-400 text-sm"
                >
                  <Plus size={14} />
                  &quot;{textValue.trim()}&quot; karsi firma olarak olustur
                </button>
              )}
            </>
          )}
        </div>
      )}

      {createPrompt && (
        <InlineCreateModal
          initialName={textValue.trim()}
          defaultRole={defaultNewRole}
          onClose={() => setCreatePrompt(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

function roleLabel(r: CounterpartRole): string {
  switch (r) {
    case "CUSTOMER": return "Musteri";
    case "SUPPLIER": return "Tedarikci";
    case "BOTH": return "Her ikisi";
    default: return "Diger";
  }
}

// ── Inline yeni karşı firma modali ─────────────────────────
function InlineCreateModal({
  initialName,
  defaultRole,
  onClose,
  onCreated,
}: {
  initialName: string;
  defaultRole: CounterpartRole;
  onClose: () => void;
  onCreated: (c: Counterpart) => void;
}) {
  const [name, setName] = useState(initialName);
  const [role, setRole] = useState<CounterpartRole>(defaultRole);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Isim zorunlu"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post<Counterpart>("/counterparts", {
        name: name.trim(),
        role,
      });
      toast.success("Cari oluşturuldu");
      onCreated(created);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Olusturma basarisiz";
      setError(msg);
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form
        onSubmit={handleSubmit}
        className="glass-card w-full max-w-md p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white">Yeni Karsi Firma</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400"
          >
            <X size={16} />
          </button>
        </div>
        {error && (
          <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
            {error}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="label">Isim *</label>
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Rol</label>
            <DarkSelect
              value={role}
              onChange={(v) => setRole(v as CounterpartRole)}
              options={[
                { value: "CUSTOMER", label: "Musteri" },
                { value: "SUPPLIER", label: "Tedarikci" },
                { value: "BOTH", label: "Her ikisi" },
                { value: "OTHER", label: "Diger" },
              ]}
            />
            <p className="text-[10px] text-surface-400 mt-1">
              Vergi no, iletisim gibi ek detaylar Cari Hesap sayfasindan eklenebilir.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-200 text-xs"
          >
            Iptal
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-semibold"
          >
            {submitting ? "Olusturuluyor..." : "Olustur ve Sec"}
          </button>
        </div>
      </form>
    </div>
  );
}

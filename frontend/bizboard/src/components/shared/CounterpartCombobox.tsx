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
  placeholder = "Karşı firma seç veya ad gir...",
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
          selectedName && "border-[rgb(var(--accent))]/60"
        )}
        onClick={() => setOpen(true)}
      >
        {selectedName ? (
          <>
            <span className="px-2 py-0.5 rounded bg-[rgb(var(--accent))]/18 text-accent-strong dark:text-accent text-xs font-medium">
              {selectedName}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              className="ml-auto p-0.5 rounded hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
              title="Seçimi kaldır"
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
              className="flex-1 bg-transparent border-0 outline-none text-sm placeholder-[rgb(var(--v2-muted))] text-[rgb(var(--v2-ink))]"
            />
            <ChevronDown size={16} className="text-[rgb(var(--v2-muted))] shrink-0" />
          </>
        )}
      </div>

      {open && !selectedName && (
        <div className="absolute z-30 mt-1 left-0 right-0 max-h-64 overflow-y-auto rounded-xl bg-[rgb(var(--v2-card))] border border-[rgb(var(--v2-border))] shadow-2xl ring-1 ring-[rgb(var(--accent))]/20">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-[rgb(var(--v2-muted))]">
              <Loader2 size={14} className="animate-spin" />
              Yükleniyor...
            </div>
          ) : error ? (
            <div className="px-3 py-3 text-xs text-red-700 dark:text-red-400">{error}</div>
          ) : (
            <>
              {filtered.length === 0 && !showCreateCta && (
                <div className="px-3 py-3 text-xs text-[rgb(var(--v2-muted))]">
                  Eşleşen kayıt yok. Yazmaya devam et.
                </div>
              )}
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full text-left px-3 py-2 hover:bg-[rgb(var(--v2-sunken))] transition-colors"
                >
                  <div className="text-sm text-[rgb(var(--v2-ink))] truncate">{c.name}</div>
                  <div className="text-[10px] text-[rgb(var(--v2-muted))] flex gap-2">
                    <span>{roleLabel(c.role)}</span>
                    {c.tax_id && <span>{c.tax_id}</span>}
                  </div>
                </button>
              ))}
              {showCreateCta && (
                <button
                  type="button"
                  onClick={() => setCreatePrompt(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 border-t border-[rgb(var(--v2-border))] hover:bg-[rgb(var(--v2-sunken))] transition-colors text-accent-strong dark:text-accent text-sm"
                >
                  <Plus size={14} />
                  &quot;{textValue.trim()}&quot; karşı firma olarak oluştur
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
    case "CUSTOMER": return "Müşteri";
    case "SUPPLIER": return "Tedarikçi";
    case "BOTH": return "Her ikisi";
    default: return "Diğer";
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
    if (!name.trim()) { setError("İsim zorunlu"); return; }
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
      const msg = e instanceof ApiError ? e.message : "Oluşturma başarısız";
      setError(msg);
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <form
        onSubmit={handleSubmit}
        className="v2-card w-full max-w-md p-5 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-[rgb(var(--v2-border))]">
          <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))]">Yeni Karşı Firma</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>
        {error && (
          <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-700 dark:text-red-400 text-xs">
            {error}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="label">İsim *</label>
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
                { value: "CUSTOMER", label: "Müşteri" },
                { value: "SUPPLIER", label: "Tedarikçi" },
                { value: "BOTH", label: "Her ikisi" },
                { value: "OTHER", label: "Diğer" },
              ]}
            />
            <p className="text-[10px] text-[rgb(var(--v2-muted))] mt-1">
              Vergi no, iletişim gibi ek detaylar Cari Hesap sayfasından eklenebilir.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-[rgb(var(--v2-border))]">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-3 py-1.5 rounded-lg bg-[rgb(var(--v2-ink))] hover:opacity-90 text-[rgb(var(--v2-card))] text-xs font-semibold disabled:opacity-50"
          >
            {submitting ? "Oluşturuluyor..." : "Oluştur ve Seç"}
          </button>
        </div>
      </form>
    </div>
  );
}

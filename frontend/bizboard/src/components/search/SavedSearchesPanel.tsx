"use client";

/**
 * v2.2.0 — kayıtlı aramalar + son aramalar paneli (spec §10.4).
 *
 * - Kayıtlı: server-side CRUD (rename / sil).
 * - Son aramalar: localStorage (client-side, son 10).
 *
 * Çift tema: surface-* token'ları.
 */

import { useEffect, useState } from "react";
import { Bookmark, Trash2, Clock, Pencil, Check, X } from "lucide-react";
import { searchApi, type SavedSearch } from "@/lib/api/search";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

const RECENT_KEY = "bb_recent_searches";

export function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function pushRecent(query: string) {
  if (typeof window === "undefined" || !query.trim()) return;
  const list = readRecent().filter((q) => q !== query);
  list.unshift(query);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
}

interface Props {
  currentQuery: string;
  onRun: (query: string) => void;
}

export function SavedSearchesPanel({ currentQuery, onRun }: Props) {
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    void loadSaved();
    setRecent(readRecent());
  }, []);

  async function loadSaved() {
    try {
      setSaved(await searchApi.savedList());
    } catch {
      /* sessiz: panel opsiyonel */
    }
  }

  async function save() {
    if (!currentQuery.trim()) {
      toast.error("Önce bir arama yapın.");
      return;
    }
    const name = window.prompt("Kayıtlı arama adı:", currentQuery.trim());
    if (!name?.trim()) return;
    try {
      await searchApi.savedCreate({ name: name.trim(), query: currentQuery.trim() });
      toast.success("Arama kaydedildi.");
      void loadSaved();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  async function remove(id: string) {
    try {
      await searchApi.savedDelete(id);
      setSaved((s) => s.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  async function rename(id: string) {
    if (!editName.trim()) return;
    try {
      await searchApi.savedUpdate(id, { name: editName.trim() });
      setSaved((s) => s.map((x) => (x.id === id ? { ...x, name: editName.trim() } : x)));
      setEditId(null);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-surface-500 flex items-center gap-1.5">
            <Bookmark size={12} /> Kayıtlı Aramalar
          </h3>
          <button
            onClick={save}
            className="text-[11px] text-brand-400 hover:text-brand-300 transition-colors"
          >
            + Kaydet
          </button>
        </div>
        {saved.length === 0 ? (
          <p className="text-xs text-surface-500">Henüz kayıt yok.</p>
        ) : (
          <ul className="space-y-1">
            {saved.map((s) => (
              <li key={s.id} className="group flex items-center gap-1.5 row-hover rounded-lg px-2 py-1 -mx-2">
                {editId === s.id ? (
                  <>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="field !py-1 !px-2 text-xs flex-1"
                      autoFocus
                    />
                    <button onClick={() => rename(s.id)} aria-label="Kaydet" className="p-1 text-status-success">
                      <Check size={13} />
                    </button>
                    <button onClick={() => setEditId(null)} aria-label="İptal" className="p-1 text-surface-400">
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => onRun(s.query)}
                      className="flex-1 text-left text-sm text-surface-300 truncate"
                      title={s.query}
                    >
                      {s.name}
                    </button>
                    <button
                      onClick={() => { setEditId(s.id); setEditName(s.name); }}
                      aria-label="Yeniden adlandır"
                      className="p-1 text-surface-500 hover:text-surface-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => remove(s.id)}
                      aria-label="Sil"
                      className="p-1 text-surface-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {recent.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-surface-500 mb-2 flex items-center gap-1.5">
            <Clock size={12} /> Son Aramalar
          </h3>
          <ul className="space-y-1">
            {recent.map((q) => (
              <li key={q}>
                <button
                  onClick={() => onRun(q)}
                  className="w-full text-left text-sm text-surface-400 truncate row-hover rounded-lg px-2 py-1 -mx-2"
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

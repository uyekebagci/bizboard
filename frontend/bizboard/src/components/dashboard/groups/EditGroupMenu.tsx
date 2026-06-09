"use client";

/**
 * v1.6.12: Grup başlığındaki ⋮ menüsü.
 * Aksiyonlar: Yeniden adlandır / Renk değiştir / Önceliği değiştir / Sil.
 */

import { useState, useRef, useEffect } from "react";
import { MoreVertical, Pencil, Palette, Star, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  GROUP_COLORS, GROUP_COLOR_CLASSES,
  PRIORITY_PINNED, PRIORITY_HIGH, PRIORITY_NORMAL,
  priorityIcon, priorityLabel,
} from "@/lib/business-groups";
import type { BusinessGroup, GroupColor, GroupPriority } from "@/types";

interface Props {
  group: BusinessGroup;
  onRename: (newName: string) => Promise<void>;
  onChangeColor: (color: GroupColor) => Promise<void>;
  onChangePriority: (priority: GroupPriority) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function EditGroupMenu({
  group, onRename, onChangeColor, onChangePriority, onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<"color" | "priority" | "rename" | null>(null);
  const [renameDraft, setRenameDraft] = useState(group.name);
  const [pendingDelete, setPendingDelete] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSubmenu(null);
      }
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function handleRename() {
    if (!renameDraft.trim() || renameDraft.trim() === group.name) {
      setSubmenu(null); setOpen(false); return;
    }
    await onRename(renameDraft.trim());
    setSubmenu(null); setOpen(false);
  }

  async function handleDeleteConfirm() {
    await onDelete();
    setPendingDelete(false); setOpen(false);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setSubmenu(null); }}
        className="p-1.5 rounded-lg text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
        aria-label="Grup aksiyonlari"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-56 bg-surface-800 border border-surface-600 rounded-xl shadow-card-hover py-1 animate-fade-in">
          {!submenu && !pendingDelete && (
            <>
              <MenuItem icon={Pencil} label="Yeniden adlandir" onClick={() => { setRenameDraft(group.name); setSubmenu("rename"); }} />
              <MenuItem icon={Palette} label="Renk degistir" onClick={() => setSubmenu("color")} />
              <MenuItem icon={Star} label="Onceligi degistir" onClick={() => setSubmenu("priority")} />
              <div className="my-1 h-px bg-surface-700" />
              <MenuItem icon={Trash2} label="Grubu sil" onClick={() => setPendingDelete(true)} danger />
            </>
          )}

          {submenu === "rename" && (
            <div className="p-2 space-y-2">
              <input
                type="text"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                maxLength={80}
                className="input text-sm"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") void handleRename(); }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setSubmenu(null); }}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-sm text-surface-200"
                >
                  Vazgec
                </button>
                <button
                  onClick={() => void handleRename()}
                  disabled={!renameDraft.trim() || renameDraft.trim() === group.name}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-sm text-white font-medium"
                >
                  Kaydet
                </button>
              </div>
            </div>
          )}

          {submenu === "color" && (
            <div className="p-2">
              <div className="grid grid-cols-4 gap-1.5">
                {GROUP_COLORS.map((c) => {
                  const cls = GROUP_COLOR_CLASSES[c];
                  const active = group.color === c;
                  return (
                    <button
                      key={c}
                      onClick={async () => { await onChangeColor(c); setSubmenu(null); setOpen(false); }}
                      className={`h-8 rounded-lg ${cls.dot} ${active ? `ring-2 ring-offset-2 ring-offset-surface-800 ${cls.ring}` : "opacity-70 hover:opacity-100"} transition-all`}
                      aria-label={c}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {submenu === "priority" && (
            <div className="p-1">
              {([PRIORITY_PINNED, PRIORITY_HIGH, PRIORITY_NORMAL] as GroupPriority[]).map((p) => {
                const active = group.priority === p;
                return (
                  <button
                    key={p}
                    onClick={async () => { await onChangePriority(p); setSubmenu(null); setOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg ${
                      active ? "bg-brand-500/15 text-brand-300" : "text-surface-200 hover:bg-surface-700"
                    } transition-colors`}
                  >
                    {priorityIcon(p) || <span className="w-3" />}
                    <span>{priorityLabel(p)}</span>
                  </button>
                );
              })}
            </div>
          )}

          {pendingDelete && (
            <div className="p-3 space-y-2">
              <p className="text-xs text-surface-300">
                <strong className="text-white">&quot;{group.name}&quot;</strong> grubunu sil?
                Uye isletmeler grupsuz konuma duser.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPendingDelete(false)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-sm text-surface-200"
                >
                  Vazgec
                </button>
                <button
                  onClick={() => void handleDeleteConfirm()}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-sm text-white font-medium"
                >
                  Sil
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon, label, onClick, danger,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
        danger
          ? "text-red-400 hover:bg-red-900/30"
          : "text-surface-200 hover:bg-surface-700"
      }`}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}

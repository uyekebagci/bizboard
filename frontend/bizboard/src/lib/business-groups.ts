/**
 * v1.6.12: Business group sabit/yardımcılar — frontend tarafı.
 *
 * Backend ile uyumlu: priority 0/1/2 → PINNED/HIGH/NORMAL; renk paleti aynı.
 */

import type { GroupColor, GroupPriority } from "@/types";

export const PRIORITY_PINNED = 0 as const;
export const PRIORITY_HIGH = 1 as const;
export const PRIORITY_NORMAL = 2 as const;

export const GROUP_COLORS: GroupColor[] = [
  "zinc", "blue", "green", "orange", "red", "purple", "pink", "teal",
];

/** Tailwind utility class haritası — group accent + chip için. */
export const GROUP_COLOR_CLASSES: Record<GroupColor, {
  bar: string;           // left accent border (3px)
  chipBg: string;        // selector chip bg
  chipText: string;
  ring: string;          // focus ring
  dot: string;           // küçük renk noktası
}> = {
  zinc:   { bar: "bg-zinc-500",   chipBg: "bg-zinc-500/20 border-zinc-400/40",   chipText: "text-zinc-200",   ring: "ring-zinc-500",   dot: "bg-zinc-400" },
  blue:   { bar: "bg-blue-500",   chipBg: "bg-blue-500/20 border-blue-400/40",   chipText: "text-blue-200",   ring: "ring-blue-500",   dot: "bg-blue-400" },
  green:  { bar: "bg-green-500",  chipBg: "bg-green-500/20 border-green-400/40", chipText: "text-green-200",  ring: "ring-green-500",  dot: "bg-green-400" },
  orange: { bar: "bg-orange-500", chipBg: "bg-orange-500/20 border-orange-400/40", chipText: "text-orange-200", ring: "ring-orange-500", dot: "bg-orange-400" },
  red:    { bar: "bg-red-500",    chipBg: "bg-red-500/20 border-red-400/40",     chipText: "text-red-200",    ring: "ring-red-500",    dot: "bg-red-400" },
  purple: { bar: "bg-purple-500", chipBg: "bg-purple-500/20 border-purple-400/40", chipText: "text-purple-200", ring: "ring-purple-500", dot: "bg-purple-400" },
  pink:   { bar: "bg-pink-500",   chipBg: "bg-pink-500/20 border-pink-400/40",   chipText: "text-pink-200",   ring: "ring-pink-500",   dot: "bg-pink-400" },
  teal:   { bar: "bg-teal-500",   chipBg: "bg-teal-500/20 border-teal-400/40",   chipText: "text-teal-200",   ring: "ring-teal-500",   dot: "bg-teal-400" },
};

export function colorClassesOf(color: string | undefined | null) {
  const key = (color || "zinc").toLowerCase() as GroupColor;
  return GROUP_COLOR_CLASSES[key] ?? GROUP_COLOR_CLASSES.zinc;
}

export function priorityLabel(p: GroupPriority): string {
  switch (p) {
    case PRIORITY_PINNED: return "Sabitlenmis";
    case PRIORITY_HIGH: return "Yuksek";
    case PRIORITY_NORMAL: return "Normal";
  }
}

export function priorityIcon(p: GroupPriority): string {
  switch (p) {
    case PRIORITY_PINNED: return "📌";
    case PRIORITY_HIGH: return "⭐";
    case PRIORITY_NORMAL: return "";
  }
}

/** Stable sort: priority ASC, order_index ASC, created_at ASC. */
export function sortGroups<T extends { priority: number; order_index: number; created_at: string }>(
  groups: T[],
): T[] {
  return [...groups].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.order_index !== b.order_index) return a.order_index - b.order_index;
    return a.created_at.localeCompare(b.created_at);
  });
}

"use client";

/**
 * v1.6.12: Tek bir business group'un render'ı.
 *
 * - Sol kenarda 3px renkli accent çubuk (grup rengi)
 * - Header: priority ikonu + ad + üye sayısı + ⋮ menü + collapse toggle
 * - PINNED: 📌 + 'PINNED' rozeti + sticky pozisyon (parent CSS halleder)
 * - HIGH: ⭐ + subtle border vurgusu
 * - NORMAL: nötr görünüm
 * - Drop target: bu grubun member listesi (cross-group + within-group reorder)
 * - Member listesi BusinessCardDraggable kartları
 *
 * Note: "Grupsuz" virtual bucket için ayrı render kullanılır (UngroupedSection).
 */

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  PRIORITY_PINNED, PRIORITY_HIGH, priorityIcon, colorClassesOf,
} from "@/lib/business-groups";
import { BusinessCardDraggable } from "./BusinessCardDraggable";
import { EditGroupMenu } from "./EditGroupMenu";
import { cn } from "@/lib/utils";
import type { BusinessGroup, GroupColor, GroupPriority, Business, PortfolioSummary } from "@/types";

interface Props {
  group: BusinessGroup;
  businessesById: Record<string, Business>;
  portfolio?: PortfolioSummary | null;

  onRename: (newName: string) => Promise<void>;
  onChangeColor: (color: GroupColor) => Promise<void>;
  onChangePriority: (priority: GroupPriority) => Promise<void>;
  onDelete: () => Promise<void>;
  onRemoveMember: (businessId: string) => Promise<void>;
}

export function BusinessGroupCard({
  group, businessesById, portfolio,
  onRename, onChangeColor, onChangePriority, onDelete, onRemoveMember,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const colorCls = colorClassesOf(group.color);
  const isPinned = group.priority === PRIORITY_PINNED;
  const isHigh = group.priority === PRIORITY_HIGH;

  const { isOver, setNodeRef } = useDroppable({
    id: `group-drop:${group.id}`,
    data: { kind: "group", groupId: group.id },
  });

  const memberBusinesses = group.members
    .map((m) => businessesById[m.business_id])
    .filter((b): b is Business => Boolean(b));

  const memberIds = memberBusinesses.map((b) => `biz:${b.id}:${group.id}`);

  return (
    <section
      className={cn(
        "glass-card relative overflow-hidden",
        isPinned && "sticky top-0 z-10 ring-1 ring-white/5",
        isHigh && "ring-1 ring-white/5",
      )}
    >
      {/* Accent bar (3px sol kenar) */}
      <div className={cn("absolute inset-y-0 left-0 w-[3px]", colorCls.bar)} aria-hidden />

      {/* Header */}
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-surface-700">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 flex-1 text-left min-w-0"
          aria-expanded={!collapsed}
        >
          {priorityIcon(group.priority) && (
            <span className="text-sm leading-none">{priorityIcon(group.priority)}</span>
          )}
          <h3 className="font-semibold text-white text-sm truncate">{group.name}</h3>
          {isPinned && (
            <span className={cn("text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border", colorCls.chipBg, colorCls.chipText)}>
              PINNED
            </span>
          )}
          <span className="ml-auto text-[11px] text-surface-400 shrink-0">
            {memberBusinesses.length} isletme
          </span>
          {collapsed ? (
            <ChevronDown size={14} className="text-surface-400" />
          ) : (
            <ChevronUp size={14} className="text-surface-400" />
          )}
        </button>

        <EditGroupMenu
          group={group}
          onRename={onRename}
          onChangeColor={onChangeColor}
          onChangePriority={onChangePriority}
          onDelete={onDelete}
        />
      </header>

      {/* Members */}
      {!collapsed && (
        <div
          ref={setNodeRef}
          className={cn(
            "p-3 min-h-[100px] transition-colors",
            isOver && "bg-brand-500/5 ring-1 ring-brand-400/30 ring-inset",
          )}
        >
          {memberBusinesses.length === 0 ? (
            <div className="py-6 text-center text-xs text-surface-400 border-2 border-dashed border-surface-700 rounded-xl">
              Bu gruba isletme suruklemek icin <br/> asagidaki kartlardan birini buraya birakin.
            </div>
          ) : (
            <SortableContext items={memberIds} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {memberBusinesses.map((biz) => (
                  <BusinessCardDraggable
                    key={biz.id}
                    business={biz}
                    portfolio={portfolio}
                    fromGroupId={group.id}
                    onRemoveFromGroup={() => onRemoveMember(biz.id)}
                  />
                ))}
              </div>
            </SortableContext>
          )}
        </div>
      )}
    </section>
  );
}

"use client";

/**
 * v1.6.12: Dashboard'da işletmelerin gruplu görünümü.
 *
 * - PINNED grupları → HIGH grupları → NORMAL grupları → "Grupsuz" sırası
 * - "Grupsuz": hiçbir gruba üye olmayan işletmeler — silinemez, sürüklenemez (kendisi)
 * - Üye drag: kart başka bir gruba bırakılırsa POST /members ile eklenir
 * - "Yeni grup" butonu modal açar
 *
 * Note: Bu component mevcut {@link BusinessGrid}'in yerini alır. "Isletme Ekle"
 * butonu Grupsuz section sonunda.
 */

import { useMemo, useState } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { Plus, FolderPlus } from "lucide-react";
import { CreateGroupModal } from "./CreateGroupModal";
import { BusinessGroupCard } from "./BusinessGroupCard";
import { BusinessCardDraggable } from "./BusinessCardDraggable";
import { useBusinessGroups } from "@/hooks/useBusinessGroups";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import type { Business, PortfolioSummary } from "@/types";

interface Props {
  businesses: Business[];
  portfolio?: PortfolioSummary | null;
}

export function GroupedBusinessGrid({ businesses, portfolio }: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const {
    groups, loading,
    createGroup, updateGroup, deleteGroup,
    addMember, removeMember,
  } = useBusinessGroups();

  // dnd-kit sensor — küçük hareket ile yanlışlıkla drag başlamasın diye 5px threshold.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // businessId → Business lookup.
  const businessesById = useMemo(
    () => Object.fromEntries(businesses.map((b) => [b.id, b])),
    [businesses],
  );

  // Hangi işletmeler bir gruba üye? "Grupsuz" bucket için fark al.
  const memberBusinessIds = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      for (const m of g.members) set.add(m.business_id);
    }
    return set;
  }, [groups]);

  const ungrouped = useMemo(
    () => businesses.filter((b) => !memberBusinessIds.has(b.id)),
    [businesses, memberBusinessIds],
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;
    if (!activeData || activeData.kind !== "business") return;

    const businessId = activeData.businessId as string;
    const fromGroupId = activeData.fromGroupId as string | null;

    // Drop hedefi grup mu?
    if (!overData || overData.kind !== "group") return;
    const toGroupId = overData.groupId as string;

    if (fromGroupId === toGroupId) return; // no-op
    try {
      await addMember(toGroupId, businessId);
      // İsteğe bağlı: kaynağı da temizle. Şu an spec belirsiz — ben "move" yapıyorum:
      // bir karşı taraf grupta varsa onu çıkar. Spec'in "ekle" yorumu için
      // bu satırı kaldırın.
      if (fromGroupId) {
        await removeMember(fromGroupId, businessId);
      }
    } catch (err) {
      logger.error("ui", "Group drag failed", { businessId, fromGroupId, toGroupId }, err);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* Top toolbar */}
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-surface-100 sr-only">İşletmeler ve Gruplar</h2>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white text-xs font-semibold transition-colors"
          >
            <FolderPlus size={14} />
            Yeni Grup
          </button>
        </div>

        {/* Groups */}
        {groups.map((g) => (
          <BusinessGroupCard
            key={g.id}
            group={g}
            businessesById={businessesById}
            portfolio={portfolio}
            onRename={(name) => updateGroup(g.id, { name }).then(() => undefined)}
            onChangeColor={(color) => updateGroup(g.id, { color }).then(() => undefined)}
            onChangePriority={(priority) => updateGroup(g.id, { priority }).then(() => undefined)}
            onDelete={() => deleteGroup(g.id)}
            onRemoveMember={(bizId) => removeMember(g.id, bizId)}
          />
        ))}

        {/* Grupsuz (virtual, en altta, silinemez) */}
        <UngroupedSection
          businesses={ungrouped}
          portfolio={portfolio}
          onAddBusiness={() => router.push("/dashboard/add")}
        />
      </div>

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onSubmit={async (input) => {
            await createGroup({ name: input.name, color: input.color, priority: input.priority });
          }}
        />
      )}
    </DndContext>
  );
}

/**
 * v1.6.12: "Grupsuz" virtual bucket — herhangi bir gruba üye olmayan işletmeler.
 *
 * - Drop target ı yok (zaten varsayılan), buradan kart alırsanız sadece kaynaktır
 * - Sticky değil, drag edilemez (kendisi)
 * - "Isletme Ekle" plus tile burada
 */
function UngroupedSection({
  businesses, portfolio, onAddBusiness,
}: {
  businesses: Business[];
  portfolio?: PortfolioSummary | null;
  onAddBusiness: () => void;
}) {
  return (
    <section className="glass-card relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-[3px] bg-surface-600" aria-hidden />
      <header className="modal-header">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-surface-300 text-sm">Grupsuz</h3>
          <span className="text-[11px] text-surface-400">{businesses.length} işletme</span>
        </div>
      </header>

      <div className="p-3">
        <div className={cn(
          "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3",
          businesses.length === 0 && "min-h-[40px]",
        )}>
          {businesses.map((b) => (
            <BusinessCardDraggable
              key={b.id}
              business={b}
              portfolio={portfolio}
              fromGroupId={null}
            />
          ))}

          {/* Isletme Ekle — Redesign: transparan dashed glass kutu (mockup). */}
          <button
            onClick={onAddBusiness}
            className="group rounded-2xl p-4 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-surface-600/70 hover:border-brand-500/60 hover:bg-brand-500/5 transition-all min-h-[140px]"
          >
            <span className="w-11 h-11 rounded-2xl bg-surface-700/50 grid place-items-center group-hover:bg-brand-500/15 group-hover:scale-105 transition">
              <Plus size={22} className="text-surface-400 group-hover:text-brand-300" />
            </span>
            <span className="text-sm font-semibold text-surface-400 group-hover:text-surface-100">İşletme Ekle</span>
          </button>
        </div>
      </div>
    </section>
  );
}

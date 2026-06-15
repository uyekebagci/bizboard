"use client";

/**
 * v1.7.x WP 8b961444 TODO bb1fc0f0: Firmalarım sayfası.
 *
 * <p>Hem admin hem non-admin için aynı route. Backend `/firms` endpoint'i
 * `isAdmin()` kontrolü ile listeyi filtreler:
 * <ul>
 *   <li>Admin: tüm firmalar</li>
 *   <li>Non-admin: yalnızca my_company_user_access üzerinden verilen firmalar</li>
 * </ul></p>
 *
 * <p>Görünümler:
 * <ul>
 *   <li><strong>Liste</strong>: flat card grid</li>
 *   <li><strong>Grup</strong>: collapsible sections, sondaki "Gruplanmamış"
 *       drag-drop destekli (yalnızca admin)</li>
 * </ul></p>
 *
 * <p>Row click → FirmDetailModal (view default). Admin için
 * [Düzenle] / [Erişim Yönet] / [Sil] butonları aktif.</p>
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2, Plus, FolderPlus, LayoutGrid, List as ListIcon,
  ChevronDown, ChevronRight, Search, Loader2, AlertTriangle,
  Pencil, ShieldOff, Inbox,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useAppStore } from "@/lib/store";
import type { MyCompany, MyCompanyGroup, Business } from "@/types";
import { FirmDetailModal } from "@/components/firms/FirmDetailModal";
import { FirmAccessModal } from "@/components/firms/FirmAccessModal";
import { CreateGroupModal } from "@/components/firms/CreateGroupModal";
import { CreateFirmModal } from "@/components/firms/CreateFirmModal";
import { EditGroupModal } from "@/components/firms/EditGroupModal";
import { NotesModule } from "@/components/business/NotesModule";

type ViewMode = "list" | "group";

const VIEW_KEY = "bb_firmalarim_view_v1";
const COLLAPSE_KEY = "bb_firmalarim_collapsed_v1";

const COMPANY_TYPE_LABEL: Record<string, string> = {
  AS: "Anonim Şirket",
  LTD: "Limited Şirket",
  SAHIS: "Şahıs İşletmesi",
  KOOP: "Kooperatif",
  DERNEK: "Dernek",
  OTHER: "Diğer",
};

const UNGROUPED_ID = "__ungrouped__";

export default function FirmalarimPage() {
  const profile = useAppStore((s) => s.profile);
  const isAdmin = profile?.role === "admin";

  const [firms, setFirms] = useState<MyCompany[]>([]);
  const [groups, setGroups] = useState<MyCompanyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("group");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Modals
  const [selectedFirm, setSelectedFirm] = useState<MyCompany | null>(null);
  const [accessFirm, setAccessFirm] = useState<MyCompany | null>(null);
  const [showCreateFirm, setShowCreateFirm] = useState(false);
  const [createFirmGroupId, setCreateFirmGroupId] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [editGroup, setEditGroup] = useState<MyCompanyGroup | null>(null);

  // Drag-drop state (admin only)
  const [dragFirmId, setDragFirmId] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);

  // Firmalarım'a özel notlar (scope=FIRMALARIM). Alacaklar sayfasıyla AYNI desen:
  // notlar business_id'ye bağlı → /businesses ile resolve. Tek işletme → auto-select
  // (seçici gizli); çoklu işletme → basit seçici. Notlar Firmalarım kümesine izole;
  // alacaklar/işletme notlarına sızmaz.
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [notesBusinessId, setNotesBusinessId] = useState<string>("");

  // ── Persisted view preference ──────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEW_KEY);
      if (raw === "list" || raw === "group") setView(raw);
      const rawC = localStorage.getItem(COLLAPSE_KEY);
      if (rawC) setCollapsed(JSON.parse(rawC));
    } catch { /* noop */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* noop */ }
  }, [view]);
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed)); } catch { /* noop */ }
  }, [collapsed]);

  // ── Fetch ──────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fs, gs] = await Promise.all([
        api.get<MyCompany[]>("/firms"),
        api.get<MyCompanyGroup[]>("/firms/groups"),
      ]);
      setFirms(fs || []);
      setGroups(gs || []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Veri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // Notlar için işletme listesi (tek ise auto-select) — alacaklar sayfasıyla aynı.
  useEffect(() => {
    api.get<Business[]>("/businesses")
      .then((r) => {
        const list = r || [];
        setBusinesses(list);
        if (list.length >= 1) setNotesBusinessId((prev) => prev || list[0].id);
      })
      .catch(() => { /* sessiz — notlar bölümü görünmez */ });
  }, []);

  // Modal refresh — selectedFirm güncellenince firms listesindeki versiyona referans tut
  useEffect(() => {
    if (selectedFirm) {
      const fresh = firms.find((f) => f.id === selectedFirm.id);
      if (fresh && fresh !== selectedFirm) setSelectedFirm(fresh);
    }
  }, [firms]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Search filter ──────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return firms;
    const q = search.toLocaleLowerCase("tr");
    return firms.filter((f) =>
      f.legal_name.toLocaleLowerCase("tr").includes(q) ||
      (f.tax_id || "").includes(q) ||
      (f.tax_office || "").toLocaleLowerCase("tr").includes(q));
  }, [firms, search]);

  // ── Grouping ───────────────────────────────────────────────
  type GroupSection = {
    id: string;
    name: string;
    color: string | null;
    icon: string | null;
    order_index: number;
    group?: MyCompanyGroup;
    firms: MyCompany[];
  };

  const sections: GroupSection[] = useMemo(() => {
    const byGroup = new Map<string, MyCompany[]>();
    for (const f of filtered) {
      const k = f.group_id || UNGROUPED_ID;
      const arr = byGroup.get(k);
      if (arr) arr.push(f); else byGroup.set(k, [f]);
    }
    const out: GroupSection[] = groups.map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      icon: g.icon,
      order_index: g.order_index,
      group: g,
      firms: byGroup.get(g.id) || [],
    }));
    // Gruplanmamış HER ZAMAN en sonda
    out.push({
      id: UNGROUPED_ID,
      name: "Gruplanmamış",
      color: null,
      icon: "📦",
      order_index: 9999,
      firms: byGroup.get(UNGROUPED_ID) || [],
    });
    return out;
  }, [filtered, groups]);

  // ── Drag-drop handlers (admin only) ────────────────────────
  function onDragStart(e: React.DragEvent, firm: MyCompany) {
    if (!isAdmin) return;
    setDragFirmId(firm.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", firm.id);
  }
  function onDragOver(e: React.DragEvent, groupId: string) {
    if (!isAdmin || !dragFirmId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverGroup !== groupId) setDragOverGroup(groupId);
  }
  function onDragLeave() { setDragOverGroup(null); }

  async function onDrop(e: React.DragEvent, targetGroupId: string) {
    if (!isAdmin) return;
    e.preventDefault();
    const firmId = e.dataTransfer.getData("text/plain") || dragFirmId;
    setDragFirmId(null);
    setDragOverGroup(null);
    if (!firmId) return;

    const firm = firms.find((f) => f.id === firmId);
    if (!firm) return;
    const newGroupId = targetGroupId === UNGROUPED_ID ? null : targetGroupId;
    if ((firm.group_id ?? null) === newGroupId) return;

    // Optimistic
    const prev = firms;
    const targetGroup = newGroupId ? groups.find((g) => g.id === newGroupId) : null;
    setFirms((curr) => curr.map((f) => f.id === firmId ? {
      ...f,
      group_id: newGroupId,
      group_name: targetGroup?.name ?? null,
      group_color: targetGroup?.color ?? null,
      group_icon: targetGroup?.icon ?? null,
    } : f));

    try {
      await api.patch(`/firms/${firmId}`, { group_id: newGroupId });
      // firm_count'ları senkron için silent refresh
      const gs = await api.get<MyCompanyGroup[]>("/firms/groups");
      setGroups(gs || []);
      toast.success("Grup güncellendi");
    } catch (err) {
      // Rollback
      setFirms(prev);
      setError(err instanceof ApiError ? err.message : "Grup değiştirilemedi");
      toast.error(err);
    }
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-0">
          <h1 className="v2-display text-xl flex items-center gap-2">
            <Building2 size={20} className="text-accent-strong dark:text-accent" />
            Firmalarım
          </h1>
          <p className="text-xs text-[rgb(var(--v2-muted))] mt-0.5">
            {isAdmin
              ? "Tüm firmalar — gruplara ayır, kullanıcı erişimi yönet."
              : "Sana erişim verilen firmalar."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <>
              <button onClick={() => { setCreateFirmGroupId(null); setShowCreateFirm(true); }}
                className="v2-btn v2-btn--ink v2-press text-xs inline-flex items-center gap-1.5">
                <Plus size={14} /> Yeni Firma
              </button>
              <button onClick={() => setShowCreateGroup(true)}
                className="v2-sunken hover:border-accent/50 v2-press rounded-xl px-3 py-2 text-xs font-semibold text-[rgb(var(--v2-ink))] inline-flex items-center gap-1.5 transition-colors">
                <FolderPlus size={14} /> Yeni Grup
              </button>
            </>
          )}
          <div className="inline-flex items-center gap-1 v2-sunken p-1 rounded-xl">
            <button onClick={() => setView("list")}
              aria-pressed={view === "list"}
              className={cn("px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors",
                view === "list" ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold" : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]")}>
              <ListIcon size={12} /> Liste
            </button>
            <button onClick={() => setView("group")}
              aria-pressed={view === "group"}
              className={cn("px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors",
                view === "group" ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold" : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]")}>
              <LayoutGrid size={12} /> Grup
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[rgb(var(--v2-muted))]" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Firma, VKN veya vergi dairesi ara…"
          className="w-full py-2 pl-7 pr-2 rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-sm text-[rgb(var(--v2-ink))] placeholder:text-[rgb(var(--v2-muted))] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all" />
      </div>

      {/* Body */}
      {error && (
        <div className="p-2.5 rounded-lg bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs flex items-start gap-2">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* UI: lg+ iki kolon — SOL firma listesi/grupları, SAĞ Firmalarım'a özel
          notlar (sticky, kendi içinde scroll). <lg tek kolon: notlar listenin
          altına iner (DOM sırası: sol → sağ). Alacaklar sayfasıyla AYNI yerleşim. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
        {/* SOL kolon: firma listesi / gruplar */}
        <div className="space-y-4 min-w-0">
      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 size={20} className="animate-spin text-[rgb(var(--v2-muted))]" />
        </div>
      ) : firms.length === 0 ? (
        <EmptyState isAdmin={isAdmin} onCreate={() => setShowCreateFirm(true)} />
      ) : view === "list" ? (
        <CardGrid firms={filtered} onClick={setSelectedFirm}
          isAdmin={isAdmin} onDragStart={onDragStart} />
      ) : (
        <div className="space-y-3">
          {sections.map((s) => {
            const isCollapsed = collapsed[s.id];
            const isUngrouped = s.id === UNGROUPED_ID;
            const isDragOver = dragOverGroup === s.id;
            // Boş "Gruplanmamış" gizle (admin olmasa da)
            if (isUngrouped && s.firms.length === 0) return null;
            return (
              <div key={s.id}
                onDragOver={(e) => onDragOver(e, s.id)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, s.id)}
                className={cn("rounded-2xl border transition-colors",
                  isDragOver ? "border-accent bg-accent/5" : "border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-card))]")}>
                {/* Header */}
                <div className="px-3 py-2.5 flex items-center gap-2">
                  <button onClick={() => toggleCollapse(s.id)}
                    className="p-1 rounded hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))]"
                    aria-label={isCollapsed ? "Genişlet" : "Daralt"}>
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold border",
                      !s.color && "v2-sunken text-[rgb(var(--v2-ink))]",
                    )}
                    style={s.color ? {
                      color: s.color, borderColor: s.color, background: `${s.color}22`,
                    } : undefined}>
                    {s.icon && <span>{s.icon}</span>}
                    {s.name}
                  </span>
                  <span className="text-[10px] text-[rgb(var(--v2-muted))] ml-1">{s.firms.length} firma</span>
                  {isAdmin && !isUngrouped && s.group && (
                    <>
                      <button onClick={() => setEditGroup(s.group!)}
                        className="ml-1 p-1 rounded hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
                        title="Grubu düzenle" aria-label="Grubu düzenle">
                        <Pencil size={11} />
                      </button>
                      <button onClick={() => { setCreateFirmGroupId(s.id); setShowCreateFirm(true); }}
                        className="ml-auto px-2 py-1 rounded-md v2-sunken hover:border-accent/50 v2-press text-[rgb(var(--v2-ink))] text-[10px] font-medium inline-flex items-center gap-1 transition-colors">
                        <Plus size={10} /> Firma Ekle
                      </button>
                    </>
                  )}
                  {(!isAdmin || isUngrouped) && <span className="ml-auto" />}
                </div>

                {!isCollapsed && (
                  s.firms.length === 0 ? (
                    <div className="px-4 pb-4 pt-1 text-xs text-[rgb(var(--v2-muted))] italic">
                      {isAdmin && !isUngrouped
                        ? "Bu grupta firma yok. Bir firmayı sürükleyip bırakabilirsin veya yukarıdan ekleyebilirsin."
                        : "Bu grupta firma yok."}
                    </div>
                  ) : (
                    <div className="px-3 pb-3">
                      <CardGrid firms={s.firms} onClick={setSelectedFirm}
                        isAdmin={isAdmin} onDragStart={onDragStart} />
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
        </div>

        {/* SAĞ kolon: Firmalarım'a ÖZEL notlar (scope=FIRMALARIM). lg+ sticky +
            kendi içinde scroll → ne kadar not olursa olsun sayfa aşağı uzamaz.
            Tek işletme → seçici gizli; çoklu işletmede basit seçici. Alacaklar
            sayfasıyla AYNI yerleşim + mobil davranış. */}
        {notesBusinessId && (
          <section className="space-y-2 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto no-scrollbar">
            {businesses.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-[rgb(var(--v2-muted))]">Notlar — İşletme:</label>
                <select
                  value={notesBusinessId}
                  onChange={(e) => setNotesBusinessId(e.target.value)}
                  className="w-auto py-1.5 px-3 rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-sm text-[rgb(var(--v2-ink))] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                >
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}
            <NotesModule businessId={notesBusinessId} scope="FIRMALARIM" />
          </section>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────── */}
      {selectedFirm && (
        <FirmDetailModal
          firm={selectedFirm}
          canEdit={!!isAdmin}
          canManageAccess={!!isAdmin}
          groups={groups}
          onClose={() => setSelectedFirm(null)}
          onChange={() => { void fetchAll(); }}
          onManageAccess={(f) => { setAccessFirm(f); setSelectedFirm(null); }}
          onGroupCreated={(g) => setGroups((curr) => [...curr, g])}
        />
      )}

      {accessFirm && (
        <FirmAccessModal
          firm={accessFirm}
          allFirms={firms}
          onClose={() => { setAccessFirm(null); void fetchAll(); }}
        />
      )}

      {showCreateFirm && (
        <CreateFirmModal
          groups={groups}
          defaultGroupId={createFirmGroupId}
          onClose={() => setShowCreateFirm(false)}
          onCreated={() => { setShowCreateFirm(false); void fetchAll(); }}
          onGroupCreated={(g) => setGroups((curr) => [...curr, g])}
        />
      )}

      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={(g) => {
            setShowCreateGroup(false);
            setGroups((curr) => [...curr, g]);
          }}
        />
      )}

      {editGroup && (
        <EditGroupModal
          group={editGroup}
          onClose={() => setEditGroup(null)}
          onUpdated={(g) => {
            setEditGroup(null);
            setGroups((curr) => curr.map((x) => x.id === g.id ? g : x));
            // Firmalar üzerindeki cached group_* alanlarını da güncelle
            setFirms((curr) => curr.map((f) => f.group_id === g.id ? {
              ...f, group_name: g.name, group_color: g.color, group_icon: g.icon,
            } : f));
          }}
          onDeleted={(id) => {
            setEditGroup(null);
            setGroups((curr) => curr.filter((x) => x.id !== id));
            // Group silindi → firmalar SET NULL ile gruplanmamışa düştü
            setFirms((curr) => curr.map((f) => f.group_id === id ? {
              ...f, group_id: null, group_name: null, group_color: null, group_icon: null,
            } : f));
          }}
        />
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function CardGrid({
  firms, onClick, isAdmin, onDragStart,
}: {
  firms: MyCompany[];
  onClick: (f: MyCompany) => void;
  isAdmin: boolean;
  onDragStart: (e: React.DragEvent, f: MyCompany) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {firms.map((f) => (
        <FirmCard key={f.id} firm={f}
          onClick={() => onClick(f)}
          draggable={isAdmin}
          onDragStart={(e) => onDragStart(e, f)} />
      ))}
    </div>
  );
}

function FirmCard({
  firm, onClick, draggable, onDragStart,
}: {
  firm: MyCompany;
  onClick: () => void;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <button onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      className={cn(
        "text-left p-3 rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-card))] v2-lift",
        "hover:border-accent/50 transition-colors",
        draggable && "cursor-grab active:cursor-grabbing",
      )}>
      <div className="flex items-start gap-2">
        <div className="w-9 h-9 rounded-lg v2-sunken flex items-center justify-center shrink-0">
          <Building2 size={16} className="text-[rgb(var(--v2-muted))]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[rgb(var(--v2-ink))] truncate">{firm.legal_name}</p>
          <p className="text-[10px] text-[rgb(var(--v2-muted))] mt-0.5">
            {COMPANY_TYPE_LABEL[firm.company_type] || firm.company_type}
            {firm.tax_id && <span className="ml-1.5">· VKN {firm.tax_id}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            {firm.is_default && (
              <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-status-warning/15 text-status-warning border border-status-warning/30">
                Default
              </span>
            )}
            {firm.group_name && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border"
                style={{
                  color: firm.group_color || undefined,
                  borderColor: firm.group_color || undefined,
                  background: firm.group_color ? `${firm.group_color}22` : undefined,
                }}>
                {firm.group_icon && <span>{firm.group_icon}</span>}
                {firm.group_name}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function EmptyState({ isAdmin, onCreate }: { isAdmin: boolean; onCreate: () => void }) {
  if (!isAdmin) {
    return (
      <div className="v2-card py-12 px-6 text-center">
        <ShieldOff size={28} className="mx-auto text-[rgb(var(--v2-muted))] mb-3" />
        <p className="text-sm font-semibold text-[rgb(var(--v2-ink))] mb-1">Henüz hiçbir firmaya erişiminiz yok</p>
        <p className="text-xs text-[rgb(var(--v2-muted))]">Yöneticinizden firma erişimi talep ediniz.</p>
      </div>
    );
  }
  return (
    <div className="v2-card py-12 px-6 text-center">
      <Inbox size={28} className="mx-auto text-[rgb(var(--v2-muted))] mb-3" />
      <p className="text-sm font-semibold text-[rgb(var(--v2-ink))] mb-1">Henüz firma yok</p>
      <p className="text-xs text-[rgb(var(--v2-muted))] mb-4">İlk firmayı ekleyerek başlayın.</p>
      <button onClick={onCreate}
        className="v2-btn v2-btn--ink v2-press text-xs inline-flex items-center gap-1.5">
        <Plus size={14} /> Yeni Firma
      </button>
    </div>
  );
}

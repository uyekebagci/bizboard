"use client";

/**
 * Ledger v2 (Faz B, §4): Gün Kapanışı — Mutabakat & Kaçak ekranı.
 *
 * - Üstte: bugünün SAĞLAMA HESAP önizlemesi (opening/computed) + "Günü Kapat".
 * - Geçmiş kapanışlar: tarih + durum + computed/actual/variance + kaçak rozeti;
 *   her satırda "Detay" (drill-down) + admin "Düzenle (onaylı)".
 * - Admin: bekleyen düzenleme istekleri paneli (onayla/reddet) + devir zinciri
 *   yeniden hesap + geri dönük tarih (kapanış modal'ında tarih seçici).
 *
 * Çift tema (surface/brand token'ları); modal'lar portal'lı (CloseDayModal vb.).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, CalendarCheck, Lock, ShieldAlert, Search, FileEdit,
  RefreshCw, CheckCircle2, XCircle, History, Sunrise, Unlock,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useBusinesses } from "@/hooks/useBusinesses";
import { useDayClose } from "@/hooks/useDayClose";
import { useDayOpen } from "@/hooks/useDayOpen";
import { useDayCloseEdit } from "@/hooks/useDayCloseEdit";
import { CloseDayModal } from "@/components/dayclose/CloseDayModal";
import { OpenDayModal } from "@/components/dayclose/OpenDayModal";
import { DrillDownModal } from "@/components/dayclose/DrillDownModal";
import { EditRequestModal } from "@/components/dayclose/EditRequestModal";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import type { DayClose } from "@/types";

export default function GunKapanisiPage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const isAdmin = profile?.role === "admin";
  const { businesses } = useBusinesses();
  const businessId = businesses?.[0]?.id ?? null;

  const { preview, closings, loading, error, refresh, drillDown, recompute } = useDayClose(businessId);
  const {
    preview: openPreview, status: dayStatus, refresh: refreshOpen,
  } = useDayOpen(businessId);
  const { requests, approve, reject } = useDayCloseEdit(businessId);

  const [showClose, setShowClose] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [drillDate, setDrillDate] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<DayClose | null>(null);
  const { request: submitEdit } = useDayCloseEdit(businessId);

  const today = preview;
  const todayClosed = today?.status === "CLOSED";
  const lifecycle = dayStatus?.lifecycle_status ?? "UNOPENED";
  const isUnopened = lifecycle === "UNOPENED";
  const isOpen = lifecycle === "OPEN";
  const enforcement = dayStatus?.enforcement_enabled ?? false;
  const pendingEdits = requests.filter((r) => r.status === "PENDING");

  async function refreshAll() {
    await Promise.all([refresh(), refreshOpen()]);
  }

  async function handleRecompute() {
    if (!businessId) return;
    const from = closings.length
      ? closings[closings.length - 1].close_date
      : new Date().toISOString().slice(0, 10);
    try {
      const r = await recompute(from);
      toast.success(`Devir zinciri yeniden hesaplandı (${r.touched} gün)`);
    } catch (err) {
      toast.error(err);
    }
  }

  async function handleApprove(id: string) {
    try { await approve(id); toast.success("Düzenleme onaylandı + uygulandı"); await refresh(); }
    catch (err) { toast.error(err); }
  }

  async function handleReject(id: string) {
    const note = window.prompt("Red gerekçesi:");
    if (note == null) return;
    try { await reject(id, note); toast.success("Düzenleme reddedildi"); }
    catch (err) { toast.error(err); }
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="v2-icon-btn v2-press" aria-label="Geri">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="v2-display text-xl">Gün Kapanışı — Mutabakat</h1>
          <p className="text-xs text-[rgb(var(--v2-muted))]">SAĞLAMA HESAP · kaçak tespiti · devir zinciri</p>
        </div>
        {isAdmin && (
          <button onClick={handleRecompute}
            className="v2-sunken hover:border-accent/50 v2-press rounded-xl px-3 py-2 text-xs flex items-center gap-1.5 text-[rgb(var(--v2-ink))] transition-colors"
            title="Devir zincirini yeniden hesapla">
            <RefreshCw size={13} /> Zincir
          </button>
        )}
      </div>

      {/* Gün Açılışı durumu — state machine: AÇILMAMIŞ → AÇIK → KAPALI */}
      {dayStatus && !todayClosed && (
        <section className={cn(
          "v2-card p-4",
          isUnopened && "border-accent/30 bg-accent/5",
          isOpen && "border-accent/20 bg-accent/5",
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {isOpen
                  ? <Unlock size={14} className="text-accent-strong dark:text-accent" />
                  : <Sunrise size={14} className="text-accent-strong dark:text-accent" />}
                <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))]">
                  {isOpen ? "Bugün Açık" : "Bugün Henüz Açılmadı"}
                </h2>
                <LifecycleBadge status={lifecycle} />
                {enforcement && (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full v2-sunken text-[rgb(var(--v2-muted))]">
                    Kilit Aktif
                  </span>
                )}
              </div>
              {isUnopened ? (
                <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">
                  {enforcement
                    ? "İşlem girebilmek için önce günü açın (devir + yuvarlama)."
                    : "Devir + yuvarlama ile günü açabilirsiniz. (İşlem kilidi kapalı.)"}
                </p>
              ) : (
                <p className="text-2xl font-bold text-[rgb(var(--v2-ink))] num">
                  {formatCurrency(openPreview?.rounded_total ?? 0, "TRY")}
                  <span className="text-[11px] font-normal text-[rgb(var(--v2-muted))] ml-2">açılış</span>
                </p>
              )}
            </div>
            {isUnopened && (
              <button onClick={() => setShowOpen(true)}
                className="v2-btn v2-btn--accent v2-press text-sm shrink-0 flex items-center gap-1.5">
                <Sunrise size={15} /> Günü Aç
              </button>
            )}
            {isOpen && (
              <button onClick={() => setShowOpen(true)}
                className="v2-sunken hover:border-accent/50 v2-press rounded-xl px-3 py-2 text-xs shrink-0 text-[rgb(var(--v2-ink))] transition-colors">
                Açılışı Düzenle
              </button>
            )}
          </div>
        </section>
      )}

      {/* Bugünün durumu */}
      {today && (
        <section className={cn(
          "v2-card p-4",
          !todayClosed && "border-status-warning/30 bg-status-warning/5",
          todayClosed && today.alarm_fired && "border-status-danger/30 bg-status-danger/5",
          todayClosed && !today.alarm_fired && "border-accent/20 bg-accent/5",
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {todayClosed
                  ? <Lock size={14} className="text-accent-strong dark:text-accent" />
                  : <CalendarCheck size={14} className="text-status-warning" />}
                <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))]">
                  {todayClosed ? "Bugün Kapatıldı" : "Bugün Henüz Kapatılmadı"}
                </h2>
                {todayClosed && today.alarm_fired && (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-status-danger/15 text-status-danger border border-status-danger/30 flex items-center gap-1">
                    <ShieldAlert size={9} /> Kaçak
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-[rgb(var(--v2-ink))] num">
                {formatCurrency(today.computed_closing, "TRY")}
              </p>
              <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">
                Önceki Kasa {formatCurrency(today.opening_balance, "TRY")}
                {" · Gelen +"}{formatCurrency(today.total_in, "TRY")}
                {" · Giden -"}{formatCurrency(today.total_out, "TRY")}
              </p>
              {todayClosed && today.variance != null && Math.abs(today.variance) > 0.005 && (
                <p className={cn("mt-2 text-xs font-medium",
                  today.variance > 0 ? "text-status-danger" : "text-accent-strong dark:text-accent")}>
                  {today.variance > 0 ? "Eksik" : "Fazla"}: {today.variance > 0 ? "+" : ""}
                  {formatCurrency(today.variance, "TRY")}
                  {today.reason_category && <span className="text-[rgb(var(--v2-muted))]"> ({today.reason_category})</span>}
                </p>
              )}
            </div>
            {!todayClosed && (
              <button onClick={() => setShowClose(true)}
                className="v2-btn v2-btn--accent v2-press text-sm shrink-0">
                Günü Kapat
              </button>
            )}
          </div>
        </section>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-status-danger text-sm">{error}</div>
      )}

      {/* Bekleyen düzenleme istekleri (admin) */}
      {isAdmin && pendingEdits.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--v2-ink))]">
            <History size={14} className="text-status-warning" /> Bekleyen Düzenleme Onayları
          </div>
          <div className="v2-card divide-y divide-[rgb(var(--v2-border))]">
            {pendingEdits.map((r) => (
              <div key={r.id} className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-[rgb(var(--v2-ink))]">{r.close_date}</p>
                  <p className="text-[11px] text-[rgb(var(--v2-muted))] truncate">
                    {r.reason_category} — {r.reason_note}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => handleApprove(r.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-accent/15 text-accent-strong dark:text-accent border border-accent/30 text-xs flex items-center gap-1 hover:bg-accent/25 v2-press transition-colors">
                    <CheckCircle2 size={12} /> Onayla
                  </button>
                  <button onClick={() => handleReject(r.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-status-danger/15 text-status-danger border border-status-danger/30 text-xs flex items-center gap-1 hover:bg-status-danger/25 v2-press transition-colors">
                    <XCircle size={12} /> Reddet
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Kapanış geçmişi */}
      {loading && closings.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-[rgb(var(--v2-muted))]" />
        </div>
      ) : closings.length === 0 ? (
        <div className="v2-card p-8 text-center">
          <CalendarCheck size={32} className="mx-auto text-[rgb(var(--v2-muted))] mb-2" />
          <p className="text-[rgb(var(--v2-ink))] font-medium">Geçmiş kapanış kaydı yok</p>
        </div>
      ) : (
        <section className="space-y-2">
          <div className="v2-card divide-y divide-[rgb(var(--v2-border))]">
            {closings.map((c) => (
              <DayCloseRow key={c.id ?? c.close_date} dc={c} isAdmin={isAdmin}
                onDrill={() => setDrillDate(c.close_date)}
                onEdit={() => setEditTarget(c)} />
            ))}
          </div>
        </section>
      )}

      {/* Modal'lar */}
      <OpenDayModal preview={showOpen ? openPreview : null} businessId={businessId ?? ""}
        isAdmin={isAdmin} onClose={() => setShowOpen(false)}
        onOpened={() => { void refreshAll(); }} />
      <CloseDayModal preview={showClose ? preview : null} businessId={businessId ?? ""}
        isAdmin={isAdmin} onClose={() => setShowClose(false)}
        onClosed={() => { void refreshAll(); }} />
      <DrillDownModal date={drillDate} load={drillDown} onClose={() => setDrillDate(null)} />
      <EditRequestModal dayClose={editTarget} submit={submitEdit} onClose={() => setEditTarget(null)} />
    </div>
  );
}

function DayCloseRow({ dc, isAdmin, onDrill, onEdit }: {
  dc: DayClose; isAdmin: boolean; onDrill: () => void; onEdit: () => void;
}) {
  const v = dc.variance;
  const closed = dc.status === "CLOSED";
  return (
    <div className="p-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-[rgb(var(--v2-ink))]">
            {new Date(dc.close_date).toLocaleDateString("tr-TR", {
              day: "numeric", month: "long", year: "numeric", weekday: "short",
            })}
          </p>
          <StatusBadge dc={dc} />
          {dc.is_backdated && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-status-warning/15 text-status-warning border border-status-warning/25">
              Geri Dönük
            </span>
          )}
          {dc.alarm_fired && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-status-danger/15 text-status-danger border border-status-danger/30 flex items-center gap-1">
              <ShieldAlert size={9} /> Kaçak
            </span>
          )}
        </div>
        <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">
          Olması Gereken {formatCurrency(dc.computed_closing, "TRY")}
          {dc.actual_total != null && <> · Son Kasa {formatCurrency(dc.actual_total, "TRY")}</>}
        </p>
        {dc.reason_category && (
          <p className="text-[11px] text-status-warning mt-0.5">
            {dc.reason_category}
            {dc.reason_note && <span className="text-[rgb(var(--v2-muted))]"> — {dc.reason_note.slice(0, 60)}</span>}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {v != null && Math.abs(v) > 0.005 && (
          <span className={cn("text-sm font-semibold", v > 0 ? "text-status-danger" : "text-accent-strong dark:text-accent")}>
            {v > 0 ? "+" : ""}{formatCurrency(v, "TRY")}
          </span>
        )}
        <div className="flex gap-1.5">
          <button onClick={onDrill}
            className="v2-icon-btn v2-press w-8 h-8" title="Kaçak detayı" aria-label="Kaçak detayı">
            <Search size={13} />
          </button>
          {isAdmin && closed && dc.id && (
            <button onClick={onEdit}
              className="v2-icon-btn v2-press w-8 h-8" title="Düzenle (onaylı)" aria-label="Düzenle (onaylı)">
              <FileEdit size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LifecycleBadge({ status }: { status: string }) {
  const cls = status === "OPEN"
    ? "bg-accent/15 text-accent-strong dark:text-accent border-accent/30"
    : status === "CLOSED"
      ? "v2-sunken text-[rgb(var(--v2-muted))]"
      : "bg-accent/15 text-accent-strong dark:text-accent border-accent/30";
  const label = status === "OPEN" ? "AÇIK" : status === "CLOSED" ? "KAPALI" : "AÇILMAMIŞ";
  return (
    <span className={cn("text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border", cls)}>
      {label}
    </span>
  );
}

function StatusBadge({ dc }: { dc: DayClose }) {
  const status = dc.status;
  const cls = status === "CLOSED"
    ? "bg-accent/15 text-accent-strong dark:text-accent border-accent/30"
    : status === "REOPENED"
      ? "bg-status-warning/15 text-status-warning border-status-warning/30"
      : "v2-sunken text-[rgb(var(--v2-muted))]";
  const isAuto = dc.created_via === "AUTO_CRON";
  const label = status === "CLOSED"
    ? (isAuto ? "OTO KAPALI" : "KAPALI")
    : status === "REOPENED" ? "YENİDEN AÇILDI" : "BEKLİYOR";
  return (
    <span className={cn("text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border", cls)}>
      {label}
    </span>
  );
}

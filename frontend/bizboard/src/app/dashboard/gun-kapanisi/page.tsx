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
  RefreshCw, CheckCircle2, XCircle, History,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useBusinesses } from "@/hooks/useBusinesses";
import { useDayClose } from "@/hooks/useDayClose";
import { useDayCloseEdit } from "@/hooks/useDayCloseEdit";
import { CloseDayModal } from "@/components/dayclose/CloseDayModal";
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
  const { requests, approve, reject } = useDayCloseEdit(businessId);

  const [showClose, setShowClose] = useState(false);
  const [drillDate, setDrillDate] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<DayClose | null>(null);
  const { request: submitEdit } = useDayCloseEdit(businessId);

  const today = preview;
  const todayClosed = today?.status === "CLOSED";
  const pendingEdits = requests.filter((r) => r.status === "PENDING");

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
          className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors">
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Gün Kapanışı — Mutabakat</h1>
          <p className="text-xs text-surface-400">SAĞLAMA HESAP · kaçak tespiti · devir zinciri</p>
        </div>
        {isAdmin && (
          <button onClick={handleRecompute}
            className="btn-secondary px-3 py-2 text-xs flex items-center gap-1.5"
            title="Devir zincirini yeniden hesapla">
            <RefreshCw size={13} /> Zincir
          </button>
        )}
      </div>

      {/* Bugünün durumu */}
      {today && (
        <section className={cn(
          "card p-4 border",
          !todayClosed && "border-amber-500/30 bg-amber-500/5",
          todayClosed && today.alarm_fired && "border-red-500/30 bg-red-500/5",
          todayClosed && !today.alarm_fired && "border-emerald-500/20 bg-emerald-500/5",
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {todayClosed
                  ? <Lock size={14} className="text-emerald-400" />
                  : <CalendarCheck size={14} className="text-amber-400" />}
                <h2 className="text-sm font-semibold text-white">
                  {todayClosed ? "Bugün Kapatıldı" : "Bugün Henüz Kapatılmadı"}
                </h2>
                {todayClosed && today.alarm_fired && (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1">
                    <ShieldAlert size={9} /> Kaçak
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-white num">
                {formatCurrency(today.computed_closing, "TRY")}
              </p>
              <p className="text-[11px] text-surface-400 mt-0.5">
                Önceki Kasa {formatCurrency(today.opening_balance, "TRY")}
                {" · Gelen +"}{formatCurrency(today.total_in, "TRY")}
                {" · Giden -"}{formatCurrency(today.total_out, "TRY")}
              </p>
              {todayClosed && today.variance != null && Math.abs(today.variance) > 0.005 && (
                <p className={cn("mt-2 text-xs font-medium",
                  today.variance > 0 ? "text-red-400" : "text-emerald-400")}>
                  {today.variance > 0 ? "Eksik" : "Fazla"}: {today.variance > 0 ? "+" : ""}
                  {formatCurrency(today.variance, "TRY")}
                  {today.reason_category && <span className="text-surface-400"> ({today.reason_category})</span>}
                </p>
              )}
            </div>
            {!todayClosed && (
              <button onClick={() => setShowClose(true)}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors shrink-0">
                Günü Kapat
              </button>
            )}
          </div>
        </section>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
      )}

      {/* Bekleyen düzenleme istekleri (admin) */}
      {isAdmin && pendingEdits.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <History size={14} className="text-amber-300" /> Bekleyen Düzenleme Onayları
          </div>
          <div className="glass-card divide-y divide-surface-700">
            {pendingEdits.map((r) => (
              <div key={r.id} className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-white">{r.close_date}</p>
                  <p className="text-[11px] text-surface-400 truncate">
                    {r.reason_category} — {r.reason_note}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => handleApprove(r.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-600/30 text-xs flex items-center gap-1 hover:bg-emerald-600/30">
                    <CheckCircle2 size={12} /> Onayla
                  </button>
                  <button onClick={() => handleReject(r.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-red-600/15 text-red-300 border border-red-600/30 text-xs flex items-center gap-1 hover:bg-red-600/25">
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
          <Loader2 size={28} className="animate-spin text-surface-400" />
        </div>
      ) : closings.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <CalendarCheck size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Geçmiş kapanış kaydı yok</p>
        </div>
      ) : (
        <section className="space-y-2">
          <div className="glass-card divide-y divide-surface-700">
            {closings.map((c) => (
              <DayCloseRow key={c.id ?? c.close_date} dc={c} isAdmin={isAdmin}
                onDrill={() => setDrillDate(c.close_date)}
                onEdit={() => setEditTarget(c)} />
            ))}
          </div>
        </section>
      )}

      {/* Modal'lar */}
      <CloseDayModal preview={showClose ? preview : null} businessId={businessId ?? ""}
        isAdmin={isAdmin} onClose={() => setShowClose(false)}
        onClosed={() => { void refresh(); }} />
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
          <p className="text-sm font-medium text-white">
            {new Date(dc.close_date).toLocaleDateString("tr-TR", {
              day: "numeric", month: "long", year: "numeric", weekday: "short",
            })}
          </p>
          <StatusBadge dc={dc} />
          {dc.is_backdated && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25">
              Geri Dönük
            </span>
          )}
          {dc.alarm_fired && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1">
              <ShieldAlert size={9} /> Kaçak
            </span>
          )}
        </div>
        <p className="text-[11px] text-surface-400 mt-0.5">
          Olması Gereken {formatCurrency(dc.computed_closing, "TRY")}
          {dc.actual_total != null && <> · Son Kasa {formatCurrency(dc.actual_total, "TRY")}</>}
        </p>
        {dc.reason_category && (
          <p className="text-[11px] text-amber-300 mt-0.5">
            {dc.reason_category}
            {dc.reason_note && <span className="text-surface-400"> — {dc.reason_note.slice(0, 60)}</span>}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {v != null && Math.abs(v) > 0.005 && (
          <span className={cn("text-sm font-semibold", v > 0 ? "text-red-400" : "text-emerald-400")}>
            {v > 0 ? "+" : ""}{formatCurrency(v, "TRY")}
          </span>
        )}
        <div className="flex gap-1.5">
          <button onClick={onDrill}
            className="p-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-300" title="Kaçak detayı">
            <Search size={13} />
          </button>
          {isAdmin && closed && dc.id && (
            <button onClick={onEdit}
              className="p-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-300" title="Düzenle (onaylı)">
              <FileEdit size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ dc }: { dc: DayClose }) {
  const status = dc.status;
  const cls = status === "CLOSED"
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
    : status === "REOPENED"
      ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
      : "bg-surface-700 text-surface-300 border-surface-600";
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

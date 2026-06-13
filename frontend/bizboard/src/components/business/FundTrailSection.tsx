"use client";

/**
 * "Para İzi" (fund-trail) — işlem detayında çift-yönlü fon-izi görünümü.
 *
 * <p>İki bölüm:</p>
 * <ul>
 *   <li><b>Kaynak</b>: bu para nereden geldi (bu tx'in HEDEF olduğu bağlar).</li>
 *   <li><b>Kullanım / Harcamalar</b>: bu para nereye gitti (bu tx'in KAYNAK
 *       olduğu bağlar) + <b>kalan</b> göstergesi.</li>
 * </ul>
 * Her bağ satırından karşı-işleme tıklanıp gidilebilir (drill). "Kaynağa bağla"
 * aksiyonu yeni fon-bağı ekler (kalan&gt;0 kaynaklara, kısmi tutarla).
 *
 * <p><b>STRICT:</b> saf izlenebilirlik — bakiye/Net Kâr DEĞİŞMEZ. Çift tema
 * (surface-* token; dark default + light otomatik).</p>
 */

import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Link2,
  Loader2,
  Trash2,
  ChevronRight,
  Route,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useFundTrail, type FundLink } from "@/hooks/useFundTrail";
import { FundLinkModal } from "@/components/business/FundLinkModal";

interface Props {
  businessId: string;
  txId: string;
  /** Detay modal'daki bu işlemin tutarı (kaynak tahsis tavanı). */
  txAmount: number;
  currency: string;
  /** Karşı işleme git (drill-down). null/undefined → drill kapalı. */
  onNavigate?: (txId: string) => void;
  /**
   * Dışarıdan "Para Bağla" tetiği. Üst-seviye bir aksiyon (ör. detay modal'ın
   * tepesindeki belirgin buton veya işlem satırındaki kısayol) bu sayacı
   * artırınca bağlama modalı açılır + bölüme kaydırılır. Keşfedilebilirlik için:
   * aksiyon sayfanın görünür kısmında, asıl mantık burada tek yerde toplanır.
   */
  openBindSignal?: number;
}

export function FundTrailSection({
  businessId,
  txId,
  txAmount,
  currency,
  onNavigate,
  openBindSignal,
}: Props) {
  const { trail, loading, listSourceCandidates, bind, unlink } = useFundTrail(
    businessId,
    txId,
  );
  const [binding, setBinding] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  // Dış tetik (üst buton / satır kısayolu): modalı aç + bölüme kaydır.
  // Sayaç 0'dan başlar; ilk mount'ta (0) tetiklenmez, her artış bir tetiktir.
  useEffect(() => {
    if (openBindSignal === undefined || openBindSignal <= 0) return;
    setBinding(true);
    // Bölüm görünür alanda değilse oraya kaydır (uzun detay modal'ında alt sırada).
    requestAnimationFrame(() => {
      document
        .getElementById("fund-trail-section")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [openBindSignal]);

  async function handleUnlink(linkId: string) {
    setUnlinkingId(linkId);
    try {
      await unlink(linkId);
      toast.success("Fon-bağı kopartıldı (bakiye değişmedi)");
    } catch (err) {
      toast.error(err);
    } finally {
      setUnlinkingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 bg-surface-700 rounded-xl text-surface-400 text-xs">
        <Loader2 size={14} className="animate-spin" /> Para izi yükleniyor…
      </div>
    );
  }

  const hasAny =
    trail.sources.length > 0 || trail.usages.length > 0 || trail.remaining > 0;

  return (
    <div id="fund-trail-section" className="space-y-3 scroll-mt-4">
      {/* Başlık + bağla aksiyonu (keşfedilebilir: belirgin etiket + buton) */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-surface-400 uppercase tracking-wider flex items-center gap-1.5">
          <Route size={12} className="text-brand-300" /> Para İzi
        </p>
        <button
          type="button"
          onClick={() => setBinding(true)}
          aria-label="Bu işlemi bir kaynak işleme bağla"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-brand-500/15 hover:bg-brand-500/25 text-brand-300 border border-brand-500/30 transition-colors"
        >
          <Link2 size={12} /> Para bağla
        </button>
      </div>

      {!hasAny && (
        <div className="p-3 bg-surface-700/60 rounded-xl text-xs text-surface-400">
          Bu işlem için henüz fon-bağı yok. &quot;Para bağla&quot; ile paranın
          nereden geldiğini işaretleyebilirsiniz (bakiye/Net Kâr değişmez).
        </div>
      )}

      {/* ── KAYNAK: bu para nereden geldi ── */}
      {trail.sources.length > 0 && (
        <div className="p-3 bg-surface-700 rounded-xl">
          <p className="text-[10px] text-emerald-300 uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <ArrowDownLeft size={12} /> Kaynak — nereden geldi ({trail.sources.length})
          </p>
          <div className="space-y-1.5">
            {trail.sources.map((l) => (
              <LinkRow
                key={l.id}
                link={l}
                counterTxId={l.source_transaction_id}
                counterDirection={l.source_direction}
                counterDate={l.source_date}
                counterDesc={l.source_description}
                counterWho={l.source_counterpart_name}
                currency={currency}
                onNavigate={onNavigate}
                onUnlink={handleUnlink}
                unlinking={unlinkingId === l.id}
                tone="emerald"
              />
            ))}
          </div>
        </div>
      )}

      {/* ── KULLANIM / HARCAMALAR: bu para nereye gitti + kalan ── */}
      {(trail.usages.length > 0 || trail.remaining > 0) && (
        <div className="p-3 bg-surface-700 rounded-xl">
          <p className="text-[10px] text-rose-300 uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <ArrowUpRight size={12} /> Kullanım / Harcamalar ({trail.usages.length})
          </p>

          {/* Tahsis göstergesi */}
          <div className="mb-2 text-[11px] text-surface-300 space-y-1">
            <div className="flex justify-between">
              <span>Tutar</span>
              <span className="text-surface-100">{formatCurrency(trail.amount, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tahsis edilen</span>
              <span className="text-surface-100">{formatCurrency(trail.allocated, currency)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className={cn(trail.remaining > 0 ? "text-amber-300" : "text-surface-400")}>
                Kalan
              </span>
              <span className={cn(trail.remaining > 0 ? "text-amber-300" : "text-surface-400")}>
                {formatCurrency(trail.remaining, currency)}
              </span>
            </div>
            {/* Tahsis bar'ı */}
            <div className="h-1.5 rounded-full bg-surface-800 overflow-hidden">
              <div
                className="h-full bg-rose-400/70"
                style={{
                  width:
                    trail.amount > 0
                      ? `${Math.min(100, (trail.allocated / trail.amount) * 100)}%`
                      : "0%",
                }}
              />
            </div>
          </div>

          {trail.usages.length > 0 && (
            <div className="space-y-1.5">
              {trail.usages.map((l) => (
                <LinkRow
                  key={l.id}
                  link={l}
                  counterTxId={l.target_transaction_id}
                  counterDirection={l.target_direction}
                  counterDate={l.target_date}
                  counterDesc={l.target_description}
                  counterWho={l.target_counterpart_name}
                  currency={currency}
                  onNavigate={onNavigate}
                  onUnlink={handleUnlink}
                  unlinking={unlinkingId === l.id}
                  tone="rose"
                />
              ))}
            </div>
          )}
        </div>
      )}

      {binding && (
        <FundLinkModal
          targetAmount={txAmount}
          currency={currency}
          loadCandidates={listSourceCandidates}
          onBind={async (sourceTxId, amount, note) => {
            setBinding(false);
            return bind(sourceTxId, amount, note);
          }}
          onClose={() => setBinding(false)}
        />
      )}
    </div>
  );
}

// ── Tek bağ satırı (drill + unlink) ──
function LinkRow({
  link,
  counterTxId,
  counterDirection,
  counterDate,
  counterDesc,
  counterWho,
  currency,
  onNavigate,
  onUnlink,
  unlinking,
  tone,
}: {
  link: FundLink;
  counterTxId: string;
  counterDirection?: string | null;
  counterDate?: string | null;
  counterDesc?: string | null;
  counterWho?: string | null;
  currency: string;
  onNavigate?: (txId: string) => void;
  onUnlink: (linkId: string) => void;
  unlinking: boolean;
  tone: "emerald" | "rose";
}) {
  const isIncome = (counterDirection || "").toUpperCase() === "INCOME";
  const label =
    counterDesc?.trim() ||
    counterWho?.trim() ||
    (isIncome ? "Giriş işlemi" : "Çıkış işlemi");
  const sub = [counterDate, counterWho && counterDesc ? counterWho : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-2 rounded-lg bg-surface-800/60 border",
        tone === "emerald" ? "border-emerald-500/20" : "border-rose-500/20",
      )}
    >
      <button
        type="button"
        onClick={() => onNavigate?.(counterTxId)}
        disabled={!onNavigate}
        className={cn(
          "flex-1 min-w-0 text-left",
          onNavigate && "hover:opacity-80 cursor-pointer",
        )}
        title={onNavigate ? "Karşı işleme git" : undefined}
      >
        <p className="text-sm text-surface-100 truncate flex items-center gap-1">
          {label}
          {onNavigate && <ChevronRight size={12} className="text-surface-400 shrink-0" />}
        </p>
        <p className="text-[11px] text-surface-400 truncate">
          <span className={tone === "emerald" ? "text-emerald-300" : "text-rose-300"}>
            {formatCurrency(link.amount, currency)}
          </span>
          {sub && <> · {sub}</>}
          {link.note && <> · {link.note}</>}
        </p>
      </button>
      <button
        type="button"
        onClick={() => onUnlink(link.id)}
        disabled={unlinking}
        title="Bağı kopar"
        className="p-1.5 rounded-lg text-surface-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors shrink-0 disabled:opacity-50"
      >
        {unlinking ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>
    </div>
  );
}

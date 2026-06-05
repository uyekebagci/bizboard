"use client";

/**
 * v1.6.23.27 (UI Fix WP TODO 31c441cb + d50bef73): SUB_CASH detay paneli.
 *
 * <p>Standalone CASH_HOLDER/CHECKING/SAVINGS için {@link BankAccountDetailContent}
 * kullanılır; SUB_CASH için aggregate + assignment yönetimi gerektiği için
 * bu ayrı component. Iki kart:</p>
 *
 * <ul>
 *   <li><b>Balance kartı</b>: aggregate ($ SUB) + main + unassigned snapshot +
 *       INVARIANT görselleştirmesi. Atanmış entity'ler liste — her satırda
 *       contribution + "Kaldır" butonu</li>
 *   <li><b>Tx kartı</b>: COALESCE ile resolve edilmiş son N tx (tx_limit=20)</li>
 *   <li><b>"+ Atama Ekle"</b> butonu — picker modal açar (sayfada kalır)</li>
 * </ul>
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, AlertTriangle, TrendingUp, Receipt, Plus, X, Trash2, Search, ChevronLeft, ChevronRight, BarChart3, CalendarRange, Rewind } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, cn, trNormalize } from "@/lib/utils";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { toast } from "@/lib/toast";
import type { SubCashDetail, SubCashEntityType, SubCashIncomeSummary } from "@/types";
import { RetroactiveInclusionModal } from "./RetroactiveInclusionModal";

// Period preset → from/to (YYYY-MM-DD)
type PeriodPreset = "THIS_MONTH" | "LAST_MONTH" | "THIS_YEAR" | "LAST_30D";

function periodRange(preset: PeriodPreset): { from: string; to: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (preset) {
    case "THIS_MONTH": {
      const from = new Date(y, m, 1);
      const to = new Date(y, m + 1, 0);
      return { from: iso(from), to: iso(to), label: "Bu Ay" };
    }
    case "LAST_MONTH": {
      const from = new Date(y, m - 1, 1);
      const to = new Date(y, m, 0);
      return { from: iso(from), to: iso(to), label: "Geçen Ay" };
    }
    case "THIS_YEAR": {
      const from = new Date(y, 0, 1);
      const to = new Date(y, 11, 31);
      return { from: iso(from), to: iso(to), label: "Bu Yıl" };
    }
    case "LAST_30D": {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 29);
      return { from: iso(from), to: iso(to), label: "Son 30 Gün" };
    }
  }
}

const PAGE_SIZE = 50;

interface Props {
  subCashId: string;
  /** Submit/unassign sonrası parent (modal) refresh tetikleyebilir. */
  onChange?: () => void;
}

export function SubCashDetailContent({ subCashId, onChange }: Props) {
  const [data, setData] = useState<SubCashDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [busyAssignId, setBusyAssignId] = useState<string | null>(null);
  // WP Sub-Cash Retroactive Inclusion: modal + remove inclusion
  const [showRetroactive, setShowRetroactive] = useState(false);
  const [busyRemoveTxId, setBusyRemoveTxId] = useState<string | null>(null);

  // v1.7.x WP TODO f3b3cd2f + 7bebe2f8: Periyot geliri + breakdown
  const [period, setPeriod] = useState<PeriodPreset>("THIS_MONTH");
  const [income, setIncome] = useState<SubCashIncomeSummary | null>(null);
  const [loadingIncome, setLoadingIncome] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<SubCashDetail>(
        `/bank-accounts/${subCashId}/sub-cash-detail?tx_limit=20`,
      );
      setData(r);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Detay yuklenemedi";
      setError(msg);
      logger.error("api", "sub-cash detail fetch failed", { subCashId }, err);
    } finally {
      setLoading(false);
    }
  }, [subCashId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // v1.7.x: periyot değişince income fetch
  const periodRangeMemo = useMemo(() => periodRange(period), [period]);
  useEffect(() => {
    let cancelled = false;
    setLoadingIncome(true);
    api.get<SubCashIncomeSummary>(
      `/bank-accounts/${subCashId}/income-summary?from=${periodRangeMemo.from}&to=${periodRangeMemo.to}`,
    )
      .then((r) => { if (!cancelled) setIncome(r); })
      .catch(() => { if (!cancelled) setIncome(null); })
      .finally(() => { if (!cancelled) setLoadingIncome(false); });
    return () => { cancelled = true; };
  }, [subCashId, periodRangeMemo]);

  async function unassign(assignmentId: string) {
    setBusyAssignId(assignmentId);
    try {
      await api.delete(`/bank-accounts/${subCashId}/assignments/${assignmentId}`);
      toast.info("Atama kaldırıldı");
      await refresh();
      onChange?.();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Kaldirilamadi";
      setError(msg);
      toast.error(err);
    } finally {
      setBusyAssignId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 size={28} className="animate-spin text-surface-400" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5" />
        <span>{error || "Veri yok"}</span>
      </div>
    );
  }

  const invariantOk =
    Math.abs(data.aggregate + data.unassigned_aggregate - data.main_aggregate) < 0.01;

  return (
    <div className="space-y-5">
      {/* Balance + Periyot Geliri (iki kart yan yana) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* SOL: Mevcut Bakiye + INVARIANT */}
        <div>
          <div className="flex items-center justify-between mb-2 gap-2">
            <h4 className="text-xs font-semibold text-surface-200 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp size={12} /> Mevcut Bakiye <span className="text-surface-500 normal-case text-[10px]">(anlık)</span>
            </h4>
            {/* Beta v1.1 hotfix: stale bakiye temizleme (admin recovery) */}
            <button
              type="button"
              onClick={async () => {
                if (!confirm("Sub-cash bakiyesini inclusion table'dan SIFIRDAN yeniden hesapla — bu stale değeri kalıcı sıfırlayıp doğru tutara çeker. Devam?")) return;
                try {
                  await api.post(`/bank-accounts/${subCashId}/recompute-balance`, {});
                  toast.success("Bakiye yeniden hesaplandı");
                  void refresh();
                  onChange?.();
                } catch (err) { toast.error(err); }
              }}
              className="text-[10px] px-2 py-1 rounded-md bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40"
              title="Stale bakiye varsa düzelt"
            >
              ↻ Yeniden Hesapla
            </button>
          </div>
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4">
            {/* Beta v1.1 fix: SUB_CASH'in kendi current_balance'ı (recompute
                edilmiş + manuel inclusion'lar dahil). Önceki davranış sadece
                "atanmış entity'lerin bakiye toplamı" gösteriyordu → entity
                ataması olmayan kasalarda her zaman 0 görünüyordu. */}
            <p className="text-2xl font-bold text-emerald-300 truncate">
              {formatCurrency(data.sub_cash?.current_balance ?? data.aggregate, "TRY")}
            </p>
            <p className="text-[10px] text-surface-400 mt-1">
              SUB_CASH bakiye (inclusion + atama)
            </p>
            {data.aggregate !== (data.sub_cash?.current_balance ?? 0) && (
              <p className="text-[10px] text-surface-500 mt-0.5">
                Atanan entity'ler: {formatCurrency(data.aggregate, "TRY")}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Stat label="Ana Kasa" value={data.main_aggregate} />
            <Stat label="Atanmamış" value={data.unassigned_aggregate} />
          </div>
          <p className={cn(
            "mt-2 text-[10px] flex items-center gap-1",
            invariantOk ? "text-surface-500" : "text-red-300",
          )}>
            INVARIANT: Σ(sub) + atanmamış = ana kasa →
            {" "}{formatCurrency(data.aggregate, "TRY")} +{" "}
            {formatCurrency(data.unassigned_aggregate, "TRY")} ={" "}
            <strong>{formatCurrency(data.aggregate + data.unassigned_aggregate, "TRY")}</strong>
            {" "}vs <strong>{formatCurrency(data.main_aggregate, "TRY")}</strong>
            {invariantOk ? " ✓" : " ✗"}
          </p>
        </div>

        {/* SAĞ: Periyot Geliri (v1.7.x WP TODO f3b3cd2f) */}
        <div>
          <div className="flex items-center justify-between mb-2 gap-2">
            <h4 className="text-xs font-semibold text-surface-200 uppercase tracking-wider flex items-center gap-1">
              <CalendarRange size={12} /> {periodRangeMemo.label} Gelir <span className="text-surface-500 normal-case text-[10px]">(periyot)</span>
            </h4>
            <div className="min-w-[120px]">
              <DarkSelect
                value={period}
                onChange={(v) => setPeriod(v as PeriodPreset)}
                options={[
                  { value: "THIS_MONTH", label: "Bu Ay" },
                  { value: "LAST_MONTH", label: "Geçen Ay" },
                  { value: "THIS_YEAR", label: "Bu Yıl" },
                  { value: "LAST_30D", label: "Son 30 Gün" },
                ]}
              />
            </div>
          </div>
          <div className="rounded-xl bg-brand-500/10 border border-brand-500/30 p-4">
            {loadingIncome ? (
              <Loader2 size={24} className="animate-spin text-brand-300" />
            ) : (
              <>
                <p className={cn(
                  "text-2xl font-bold truncate",
                  (income?.total_income ?? 0) >= 0 ? "text-brand-200" : "text-red-300",
                )}>
                  {formatCurrency(income?.total_income ?? 0, "TRY")}
                </p>
                <p className="text-[10px] text-surface-400 mt-1">
                  {income?.tx_count ?? 0} işlem · {periodRangeMemo.from} → {periodRangeMemo.to}
                </p>
              </>
            )}
          </div>
          <p className="mt-2 text-[10px] text-amber-300/80 flex items-start gap-1">
            <AlertTriangle size={10} className="mt-0.5 shrink-0" />
            <span>
              Bakiye anlık, gelir periyot toplamıdır. Sub-cash'ler arası
              gelir overlap olabilir (multi-attribution).
            </span>
          </p>
        </div>
      </section>

      {/* Atanan entity'ler */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-surface-200 uppercase tracking-wider">
            Atanan Entity'ler ({data.assignments.length})
          </h4>
          <button
            type="button"
            onClick={() => setShowAssignPicker(true)}
            className="text-[11px] font-semibold px-2 py-1 rounded-md bg-brand-600 hover:bg-brand-500 text-white inline-flex items-center gap-1"
          >
            <Plus size={11} />
            Atama Ekle
          </button>
        </div>
        {data.assignments.length === 0 ? (
          <p className="text-xs text-surface-500 italic">
            Henüz entity atanmamış. Yukardan ekle.
          </p>
        ) : (
          <div className="rounded-xl border border-surface-700 divide-y divide-surface-700">
            {data.assignments.map((a) => (
              <div key={a.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="text-surface-200 truncate flex items-center gap-1.5">
                    <EntityTypeBadge type={a.entity_type} />
                    {a.entity_name}
                  </p>
                  <p className="text-[10px] text-surface-500 truncate">
                    {a.entity_type === "BANK_ACCOUNT"
                      ? `Katkı: ${formatCurrency(a.entity_balance_contribution, "TRY")}`
                      : "Aggregate'a katkı yok — sadece tx grouping"}
                  </p>
                </div>
                <p className="text-emerald-300 font-medium shrink-0 text-xs">
                  {a.entity_type === "BANK_ACCOUNT"
                    ? formatCurrency(a.entity_balance_contribution, "TRY")
                    : "—"}
                </p>
                <button
                  onClick={() => unassign(a.id)}
                  disabled={busyAssignId === a.id}
                  className="p-1 rounded-md text-surface-400 hover:bg-red-500/10 hover:text-red-300 transition-colors disabled:opacity-50"
                  title="Atamayı kaldır (entity Ana Kasa'ya iade)"
                >
                  {busyAssignId === a.id
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Trash2 size={12} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* v1.7.x WP TODO 7bebe2f8: Gelir Dağılımı (kaynak bazlı) */}
      {income && income.breakdown_by_source.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-surface-200 uppercase tracking-wider mb-2 flex items-center gap-1">
            <BarChart3 size={12} /> Gelir Dağılımı — {periodRangeMemo.label}
          </h4>
          <div className="rounded-xl border border-surface-700 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-surface-800/60 text-surface-400 text-[10px] uppercase">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Kaynak</th>
                  <th className="text-right px-3 py-2 font-medium">Tx</th>
                  <th className="text-right px-3 py-2 font-medium">Gelir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-700">
                {income.breakdown_by_source.map((s) => {
                  const href = s.source_type === "COUNTERPART"
                    ? `/dashboard/counterparts/${s.source_id}`
                    : s.source_type === "POS_DEVICE"
                      ? `/dashboard/pos-cihazlari/${s.source_id}`
                      : `/dashboard/hesaplar`;
                  return (
                    <tr
                      key={`${s.source_type}-${s.source_id}`}
                      className="hover:bg-surface-700/40 cursor-pointer transition-colors"
                      onClick={() => { window.location.href = href; }}
                    >
                      <td className="px-3 py-2 text-surface-200">
                        <span className="inline-flex items-center gap-1.5">
                          <EntityTypeBadge type={s.source_type} />
                          <span className="truncate">{s.source_name}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-surface-300">{s.tx_count}</td>
                      <td className={cn(
                        "px-3 py-2 text-right font-semibold whitespace-nowrap",
                        s.income >= 0 ? "text-emerald-300" : "text-red-300",
                      )}>
                        {formatCurrency(s.income, "TRY")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tx kartı (inclusion table'dan) */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-surface-200 uppercase tracking-wider flex items-center gap-1">
            <Receipt size={12} /> Bu Sub-Cash&apos;in İşlemleri ({data.transactions.length})
          </h4>
          <button
            type="button"
            onClick={() => setShowRetroactive(true)}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center gap-1"
          >
            <Rewind size={11} />
            Geri Dönük Ekle
          </button>
        </div>
        {data.transactions.length === 0 ? (
          <p className="text-xs text-surface-500 italic">
            Bu sub-cash&apos;e dahil edilmiş işlem yok. Yeni tx oluştururken
            entity match olursa otomatik eklenir; eski tx&apos;ler için
            &quot;Geri Dönük Ekle&quot; kullanın.
          </p>
        ) : (
          <div className="rounded-xl border border-surface-700 divide-y divide-surface-700 max-h-64 overflow-y-auto">
            {data.transactions.map((t) => {
              const isManual = t.inclusion_scope === "MANUAL";
              const isAuto = t.inclusion_scope === "AUTOMATIC";
              return (
                <div key={t.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="text-surface-200 truncate flex items-center gap-1.5">
                      <span className="truncate">{t.description || "—"}</span>
                      {isAuto && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-700 text-surface-400 border border-surface-600">
                          AUTO
                        </span>
                      )}
                      {isManual && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30">
                          MANUEL
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-surface-500">{t.date} · {t.payment_method}</p>
                  </div>
                  <p className={cn(
                    "font-medium shrink-0",
                    t.direction === "INCOME" ? "text-emerald-300" : "text-red-300",
                  )}>
                    {t.direction === "INCOME" ? "+" : "−"}{formatCurrency(t.amount, t.currency || "TRY")}
                  </p>
                  <button
                    type="button"
                    title="Bu sub-cash'ten çıkar"
                    disabled={busyRemoveTxId === t.id}
                    onClick={async () => {
                      if (!confirm("Bu işlemi sub-cash'ten çıkarmak istiyor musun?")) return;
                      setBusyRemoveTxId(t.id);
                      try {
                        await api.delete(`/bank-accounts/${subCashId}/inclusions/${t.id}`);
                        toast.info("İşlem çıkarıldı");
                        await refresh();
                        onChange?.();
                      } catch (err) {
                        toast.error(err);
                      } finally {
                        setBusyRemoveTxId(null);
                      }
                    }}
                    className="p-1 rounded-md text-surface-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50 shrink-0"
                  >
                    {busyRemoveTxId === t.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={11} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* WP Sub-Cash Retroactive Inclusion modal */}
      {showRetroactive && (
        <RetroactiveInclusionModal
          subCashId={subCashId}
          subCashName={data.sub_cash.name}
          onClose={() => setShowRetroactive(false)}
          onAdded={() => { void refresh(); onChange?.(); }}
        />
      )}

      {showAssignPicker && (
        <AssignmentPicker
          subCashId={subCashId}
          businessId={data.sub_cash.business_id ?? ""}
          existingAssignments={data.assignments}
          onClose={() => setShowAssignPicker(false)}
          onAssigned={() => { setShowAssignPicker(false); void refresh(); onChange?.(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "emerald" }) {
  return (
    <div className="bg-surface-900 border border-surface-700 rounded-xl p-3">
      <p className="text-[10px] uppercase text-surface-400">{label}</p>
      <p className={cn(
        "mt-1 text-sm font-semibold truncate",
        accent === "emerald" ? "text-emerald-300" : "text-white",
      )}>
        {formatCurrency(value, "TRY")}
      </p>
    </div>
  );
}

function EntityTypeBadge({ type }: { type: SubCashEntityType }) {
  const map = {
    BANK_ACCOUNT: { label: "Hesap", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
    POS_DEVICE:   { label: "POS",   cls: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
    COUNTERPART:  { label: "Cari",  cls: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  };
  const m = map[type];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] border ${m.cls}`}>
      {m.label}
    </span>
  );
}

// ─────────── Assignment Picker (d50bef73) ───────────

interface AssignmentPickerProps {
  subCashId: string;
  businessId: string;
  existingAssignments: SubCashDetail["assignments"];
  onClose: () => void;
  onAssigned: () => void;
}

interface EntityOption {
  id: string;
  name: string;
  type: SubCashEntityType;
  subtitle?: string;
  balance?: number;
  /** v1.6.23.28: aktif/pasif filter için */
  active: boolean;
  /** v1.6.23.28: TR-normalized search haystack (precomputed). */
  searchHaystack: string;
}

function AssignmentPicker({
  subCashId, businessId, existingAssignments, onClose, onAssigned,
}: AssignmentPickerProps) {
  const [tab, setTab] = useState<SubCashEntityType>("BANK_ACCOUNT");
  const [options, setOptions] = useState<EntityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // v1.6.23.28 (UI Fix WP TODO 24310479): search + filter + pagination state
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(0);

  // Mevcut atamaları ID setine çevir — disable + sort için
  const assignedIds = useMemo(
    () => new Set(existingAssignments.map((a) => `${a.entity_type}:${a.entity_id}`)),
    [existingAssignments],
  );

  // Tab/inactive değişince sayfayı sıfırla, query'i koru
  useEffect(() => { setPage(0); }, [tab, showInactive, query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let result: EntityOption[] = [];
      if (tab === "BANK_ACCOUNT") {
        // v1.6.23.28: backend zaten include_inactive=true ile pasifleri döner.
        const accounts = await api.get<Array<{
          id: string; name: string; type: string; bank_name: string | null;
          iban: string | null; business_id: string | null; current_balance: number;
          is_active: boolean;
        }>>(showInactive ? "/bank-accounts?include_inactive=true" : "/bank-accounts");
        result = (accounts || [])
          .filter((a) => a.business_id === businessId)
          .filter((a) => a.type !== "MAIN_CASH" && a.type !== "SUB_CASH")
          .map((a) => {
            // IBAN son 4 hane
            const ibanTail = a.iban && a.iban.length >= 4
              ? a.iban.slice(-4) : "";
            return {
              id: a.id,
              name: a.name,
              type: "BANK_ACCOUNT" as const,
              subtitle: a.bank_name || a.type,
              balance: a.current_balance,
              active: a.is_active,
              searchHaystack: trNormalize(
                `${a.name} ${a.bank_name ?? ""} ${a.iban ?? ""} ${ibanTail} ${a.type}`,
              ),
            };
          });
      } else if (tab === "POS_DEVICE") {
        const devices = await api.get<Array<{
          id: string; name: string; bank_name: string | null;
          business_id: string | null; is_active: boolean;
          owner_counterpart_name?: string | null;
        }>>(showInactive ? "/pos-devices?include_inactive=true" : "/pos-devices");
        result = (devices || [])
          .filter((d) => d.business_id === businessId)
          .map((d) => ({
            id: d.id, name: d.name,
            type: "POS_DEVICE" as const,
            subtitle: d.bank_name || "POS",
            active: d.is_active,
            searchHaystack: trNormalize(
              `${d.name} ${d.bank_name ?? ""} ${d.owner_counterpart_name ?? ""}`,
            ),
          }));
      } else {
        // COUNTERPART — pasiflik kavramı yok, hep aktif kabul
        const cps = await api.get<Array<{
          id: string; name: string; business_id: string | null; role?: string;
          tax_id?: string | null; contact_phone?: string | null;
        }>>("/counterparts");
        result = (cps || [])
          .filter((c) => c.business_id === businessId)
          .map((c) => ({
            id: c.id, name: c.name,
            type: "COUNTERPART" as const,
            subtitle: c.role || "—",
            active: true,
            searchHaystack: trNormalize(
              `${c.name} ${c.tax_id ?? ""} ${c.contact_phone ?? ""} ${c.role ?? ""}`,
            ),
          }));
      }
      setOptions(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Liste yuklenemedi");
    } finally {
      setLoading(false);
    }
  }, [tab, businessId, showInactive]);

  useEffect(() => { void load(); }, [load]);

  // v1.6.23.28: search + filter + sort (atanmamış üstte + ad ASC)
  const filteredSorted = useMemo(() => {
    const q = trNormalize(query.trim());
    let list = options;
    if (q) list = list.filter((o) => o.searchHaystack.includes(q));
    // COUNTERPART için active filter no-op (her zaman true)
    list = list.filter((o) => showInactive || o.active);
    return [...list].sort((a, b) => {
      const aAssigned = assignedIds.has(`${a.type}:${a.id}`);
      const bAssigned = assignedIds.has(`${b.type}:${b.id}`);
      if (aAssigned !== bAssigned) return aAssigned ? 1 : -1; // unassigned first
      return a.name.localeCompare(b.name, "tr");
    });
  }, [options, query, showInactive, assignedIds]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filteredSorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  async function assignOne(opt: EntityOption) {
    setBusyId(opt.id);
    setError(null);
    try {
      await api.post(`/bank-accounts/${subCashId}/assignments`, {
        entity_type: opt.type,
        entity_id: opt.id,
      });
      toast.success("Atama eklendi");
      onAssigned();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Atama basarisiz");
      logger.error("api", "sub-cash assign failed", { subCashId, opt }, err);
      toast.error(err);
    } finally {
      setBusyId(null);
    }
  }

  const hasInactiveChip = tab !== "COUNTERPART";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-800 rounded-2xl border border-surface-600 w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-surface-700 shrink-0">
          <h3 className="text-sm font-semibold text-white">Atama Ekle</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-700">
            <X size={16} className="text-surface-400" />
          </button>
        </div>

        {/* Tip tab'leri */}
        <div className="px-4 py-2 border-b border-surface-700 flex gap-1.5 shrink-0">
          {(["BANK_ACCOUNT", "POS_DEVICE", "COUNTERPART"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setQuery(""); }}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-medium border",
                tab === t
                  ? "bg-brand-600 border-brand-500 text-white"
                  : "bg-surface-700 border-surface-600 text-surface-300",
              )}
            >
              {t === "BANK_ACCOUNT" ? "Banka/Kasa" : t === "POS_DEVICE" ? "POS" : "Cari"}
            </button>
          ))}
        </div>

        {/* Search + active chip — v1.6.23.28 (TODO 24310479) */}
        <div className="px-4 py-2 border-b border-surface-700 shrink-0 space-y-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === "BANK_ACCOUNT" ? "Ad / banka / IBAN ara…" :
                tab === "POS_DEVICE"   ? "Ad / banka / sahip ara…" :
                                          "Ad / VKN / telefon ara…"
              }
              className="w-full pl-7 pr-7 py-1.5 text-xs bg-surface-900 border border-surface-600 rounded-lg text-white placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface-700"
                aria-label="Aramayı temizle"
              >
                <X size={10} className="text-surface-400" />
              </button>
            )}
          </div>
          {hasInactiveChip && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowInactive(false)}
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-medium border",
                  !showInactive
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-200"
                    : "bg-surface-700 border-surface-600 text-surface-300",
                )}
              >
                Aktif
              </button>
              <button
                onClick={() => setShowInactive(true)}
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-medium border",
                  showInactive
                    ? "bg-surface-500 border-surface-400 text-white"
                    : "bg-surface-700 border-surface-600 text-surface-300",
                )}
              >
                Tümü
              </button>
            </div>
          )}
        </div>

        <p className="text-[10px] text-amber-300/80 px-4 py-1.5 border-b border-surface-700 shrink-0">
          {tab === "BANK_ACCOUNT"
            ? "BANK_ACCOUNT katkı verir (current_balance). MAIN_CASH ve SUB_CASH atanamaz."
            : "POS_DEVICE / COUNTERPART aggregate'a 0 katkı verir (sadece tx grouping)."}
        </p>

        {error && (
          <div className="mx-4 mt-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-surface-400" />
            </div>
          ) : paged.length === 0 ? (
            <p className="text-xs text-surface-500 text-center py-6">
              {query
                ? "Arama sonucu yok."
                : "Atanabilir entity yok."}
            </p>
          ) : (
            <div className="space-y-1">
              {paged.map((o) => {
                const already = assignedIds.has(`${o.type}:${o.id}`);
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={already || busyId === o.id}
                    onClick={() => assignOne(o)}
                    className={cn(
                      "w-full text-left p-2.5 rounded-lg border flex items-center justify-between gap-2 transition-colors",
                      already
                        ? "border-surface-700 bg-surface-900 opacity-50 cursor-not-allowed"
                        : "border-surface-700 hover:border-brand-500/40 hover:bg-surface-700/40",
                      !o.active && !already && "opacity-60",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                        {o.name}
                        {!o.active && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-surface-700 text-surface-400 border border-surface-600">
                            pasif
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-surface-400">
                        {o.subtitle}
                        {already && " · zaten bu sub-cash'te"}
                      </p>
                    </div>
                    {o.balance != null && (
                      <p className="text-xs font-semibold text-surface-300 shrink-0">
                        {formatCurrency(o.balance, "TRY")}
                      </p>
                    )}
                    {busyId === o.id && (
                      <Loader2 size={12} className="animate-spin text-surface-400" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* v1.6.23.28 (TODO 24310479): pagination footer */}
        {!loading && filteredSorted.length > PAGE_SIZE && (
          <div className="px-4 py-2 border-t border-surface-700 flex items-center justify-between shrink-0 text-[11px]">
            <span className="text-surface-400">
              {safePage * PAGE_SIZE + 1}–
              {Math.min((safePage + 1) * PAGE_SIZE, filteredSorted.length)}
              {" / "}{filteredSorted.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="p-1 rounded-md hover:bg-surface-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={12} className="text-surface-300" />
              </button>
              <span className="px-1.5 text-surface-300">
                {safePage + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="p-1 rounded-md hover:bg-surface-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={12} className="text-surface-300" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

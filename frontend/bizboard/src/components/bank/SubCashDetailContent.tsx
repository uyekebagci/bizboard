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

import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle, TrendingUp, Receipt, Plus, X, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, cn } from "@/lib/utils";
import type { SubCashDetail, SubCashEntityType } from "@/types";

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

  async function unassign(assignmentId: string) {
    setBusyAssignId(assignmentId);
    try {
      await api.delete(`/bank-accounts/${subCashId}/assignments/${assignmentId}`);
      await refresh();
      onChange?.();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Kaldirilamadi";
      setError(msg);
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
      {/* Balance kartı */}
      <section>
        <h4 className="text-xs font-semibold text-surface-200 uppercase tracking-wider mb-2 flex items-center gap-1">
          <TrendingUp size={12} /> Aggregate (kasa değeri)
        </h4>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Sub-Cash" value={data.aggregate} accent="emerald" />
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
          {" "}vs ana kasa <strong>{formatCurrency(data.main_aggregate, "TRY")}</strong>
          {invariantOk ? " ✓" : " ✗ TUTMADI"}
        </p>
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

      {/* Tx kartı (COALESCE) */}
      <section>
        <h4 className="text-xs font-semibold text-surface-200 uppercase tracking-wider mb-2 flex items-center gap-1">
          <Receipt size={12} /> Bu Sub-Cash'e Route Edilen İşlemler ({data.transactions.length})
        </h4>
        {data.transactions.length === 0 ? (
          <p className="text-xs text-surface-500 italic">
            COALESCE(bank_account &gt; pos_device &gt; counterpart) ile bu sub-cash'e
            düşen işlem yok.
          </p>
        ) : (
          <div className="rounded-xl border border-surface-700 divide-y divide-surface-700 max-h-64 overflow-y-auto">
            {data.transactions.map((t) => (
              <div key={t.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="text-surface-200 truncate">{t.description || "—"}</p>
                  <p className="text-[10px] text-surface-500">{t.date} · {t.payment_method}</p>
                </div>
                <p className={cn(
                  "font-medium shrink-0",
                  t.direction === "INCOME" ? "text-emerald-300" : "text-red-300",
                )}>
                  {t.direction === "INCOME" ? "+" : "−"}{formatCurrency(t.amount, t.currency || "TRY")}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

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
}

function AssignmentPicker({
  subCashId, businessId, existingAssignments, onClose, onAssigned,
}: AssignmentPickerProps) {
  const [tab, setTab] = useState<SubCashEntityType>("BANK_ACCOUNT");
  const [options, setOptions] = useState<EntityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Mevcut atamaları ID setine çevir — disable için
  const assignedIds = new Set(existingAssignments.map((a) => `${a.entity_type}:${a.entity_id}`));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let result: EntityOption[] = [];
      if (tab === "BANK_ACCOUNT") {
        const accounts = await api.get<Array<{
          id: string; name: string; type: string; bank_name: string | null;
          business_id: string | null; current_balance: number;
        }>>("/bank-accounts");
        result = (accounts || [])
          .filter((a) => a.business_id === businessId)
          // MAIN_CASH ve SUB_CASH yasak (server reddediyor, UI da gösterme)
          .filter((a) => a.type !== "MAIN_CASH" && a.type !== "SUB_CASH")
          .map((a) => ({
            id: a.id,
            name: a.name,
            type: "BANK_ACCOUNT" as const,
            subtitle: a.bank_name || a.type,
            balance: a.current_balance,
          }));
      } else if (tab === "POS_DEVICE") {
        const devices = await api.get<Array<{
          id: string; name: string; bank_name: string | null; business_id: string | null;
        }>>("/pos-devices");
        result = (devices || [])
          .filter((d) => d.business_id === businessId)
          .map((d) => ({
            id: d.id, name: d.name,
            type: "POS_DEVICE" as const,
            subtitle: d.bank_name || "POS",
          }));
      } else {
        const cps = await api.get<Array<{
          id: string; name: string; business_id: string | null; role?: string;
        }>>("/counterparts");
        result = (cps || [])
          .filter((c) => c.business_id === businessId)
          .map((c) => ({
            id: c.id, name: c.name,
            type: "COUNTERPART" as const,
            subtitle: c.role || "—",
          }));
      }
      setOptions(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Liste yuklenemedi");
    } finally {
      setLoading(false);
    }
  }, [tab, businessId]);

  useEffect(() => { void load(); }, [load]);

  async function assignOne(opt: EntityOption) {
    setBusyId(opt.id);
    setError(null);
    try {
      await api.post(`/bank-accounts/${subCashId}/assignments`, {
        entity_type: opt.type,
        entity_id: opt.id,
      });
      onAssigned();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Atama basarisiz");
      logger.error("api", "sub-cash assign failed", { subCashId, opt }, err);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-800 rounded-2xl border border-surface-600 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-surface-700 shrink-0">
          <h3 className="text-sm font-semibold text-white">Atama Ekle</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-700">
            <X size={16} className="text-surface-400" />
          </button>
        </div>

        {/* Tip tab'leri */}
        <div className="px-4 py-2 border-b border-surface-700 flex gap-1.5">
          {(["BANK_ACCOUNT", "POS_DEVICE", "COUNTERPART"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
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

        <p className="text-[10px] text-amber-300/80 px-4 py-2 border-b border-surface-700">
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
          ) : options.length === 0 ? (
            <p className="text-xs text-surface-500 text-center py-6">
              Atanabilir entity yok.
            </p>
          ) : (
            <div className="space-y-1">
              {options.map((o) => {
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
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{o.name}</p>
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
      </div>
    </div>
  );
}

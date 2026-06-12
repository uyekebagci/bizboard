"use client";

/**
 * Raporlar v1.1 (R7): Bütçe-Eşik Ayarları + Kullanım.
 *
 * <p>Kategori başına AYLIK bütçe tanımla; mevcut ay gerçekleşeni karşılaştır.
 * <b>DEFAULT KAPALI</b> — bütçe set edilmedikçe alarm üretilmez (opt-in, spam-
 * kaçın). Bütçe set/clear yalnız ADMIN (PUT /admin/budget-thresholds); diğer
 * kullanıcılar yalnız okur. Glass tasarım + çift tema.</p>
 */

import { useCallback, useEffect, useState } from "react";
import {
  Wallet, Building2, Loader2, AlertTriangle, Check, X, Pencil,
} from "lucide-react";
import { useBusinesses } from "@/hooks/useBusinesses";
import { useProfile } from "@/hooks/useProfile";
import {
  getBudgets, setBudget, type BudgetThresholds, type BudgetRow,
} from "@/lib/api/reports";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export default function BudgetSettingsPage() {
  const { businesses } = useBusinesses();
  const { profile } = useProfile();
  const isAdmin = profile?.role === "admin";

  const [businessId, setBusinessId] = useState<string>("");
  const [data, setData] = useState<BudgetThresholds | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [savingId, setSavingId] = useState<string | null>(null);

  // İlk işletmeyi otomatik seç (bütçe businessId zorunlu).
  useEffect(() => {
    if (!businessId && businesses.length > 0) {
      setBusinessId(businesses[0].id);
    }
  }, [businesses, businessId]);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const result = await getBudgets(businessId);
      setData(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bütçeler alınamadı");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(row: BudgetRow) {
    setEditing(row.category_id);
    setEditValue(row.budget != null ? String(row.budget) : "");
  }

  function cancelEdit() {
    setEditing(null);
    setEditValue("");
  }

  async function save(categoryId: string) {
    if (!businessId) return;
    setSavingId(categoryId);
    try {
      const num = editValue.trim() === "" ? null : Math.max(0, Number(editValue) || 0);
      const result = await setBudget(businessId, categoryId, num);
      setData(result);
      toast.success(num ? "Bütçe kaydedildi" : "Bütçe kapatıldı");
      cancelEdit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setSavingId(null);
    }
  }

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-5">
      {/* Başlık */}
      <section className="rise">
        <p className="text-[13px] text-brand-300 font-semibold tracking-wide">Raporlar</p>
        <h1 className="text-2xl font-extrabold h-display text-surface-100 mt-1">
          Bütçe-Eşik Ayarları
        </h1>
        <p className="text-surface-400 mt-1 text-sm">
          Kategori başına aylık bütçe tanımlayın; aşıldığında uyarı alın.
          {!isAdmin && " (Bütçe değiştirme yetkisi yalnız yöneticidedir.)"}
        </p>
      </section>

      {/* İşletme seçici */}
      <section className="glass-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Building2 size={14} className="text-surface-400" />
          <select
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className="field-sm py-1.5 w-auto"
          >
            <option value="" disabled>İşletme seçin…</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        {data && (
          <span className="text-xs text-surface-400">
            Dönem: <b className="text-surface-200">{data.period_label}</b> (aylık)
          </span>
        )}
        {loading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-surface-400">
            <Loader2 size={13} className="animate-spin" /> Yükleniyor…
          </span>
        )}
      </section>

      {/* Kategori bütçe listesi */}
      <section className="glass-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-surface-400 border-b border-surface-700/40">
                <th className="px-4 py-2.5 font-medium">Kategori</th>
                <th className="px-4 py-2.5 font-medium text-right">Bu Ay Harcama</th>
                <th className="px-4 py-2.5 font-medium text-right">Aylık Bütçe</th>
                <th className="px-4 py-2.5 font-medium w-40">Kullanım</th>
                <th className="px-4 py-2.5 font-medium text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isEditing = editing === row.category_id;
                const pct = row.usage_pct ?? 0;
                return (
                  <tr key={row.category_id} className="border-b border-surface-800/40 row-hover">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        {row.color && (
                          <span className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: row.color }} />
                        )}
                        <span className="text-surface-200">{row.category_name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right num text-surface-300">
                      {formatCurrency(row.spent, "TRY")}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          autoFocus
                          placeholder="Kapalı"
                          className="field-sm w-28 text-right py-1"
                        />
                      ) : row.budget != null ? (
                        <span className="num text-surface-100 font-medium">
                          {formatCurrency(row.budget, "TRY")}
                        </span>
                      ) : (
                        <span className="text-xs text-surface-500">Kapalı</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.budget != null ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-surface-700/50 overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                row.exceeded ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"
                              )}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <span className={cn(
                            "num text-xs font-semibold w-10 text-right",
                            row.exceeded ? "text-rose-300" : pct >= 80 ? "text-amber-300" : "text-surface-300"
                          )}>
                            {pct}%
                          </span>
                          {row.exceeded && <AlertTriangle size={13} className="text-rose-400 shrink-0" />}
                        </div>
                      ) : (
                        <span className="text-xs text-surface-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!isAdmin ? (
                        <span className="text-xs text-surface-600">—</span>
                      ) : isEditing ? (
                        <div className="inline-flex gap-1">
                          <button
                            onClick={() => save(row.category_id)}
                            disabled={savingId === row.category_id}
                            className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 disabled:opacity-50"
                            title="Kaydet"
                          >
                            {savingId === row.category_id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Check size={14} />}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1.5 rounded-lg bg-surface-700/50 hover:bg-surface-700 text-surface-300"
                            title="İptal"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(row)}
                          className="p-1.5 rounded-lg bg-surface-700/40 hover:bg-surface-700 text-surface-300"
                          title="Bütçe düzenle"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-surface-400 text-sm">
                    {businessId
                      ? "Bu işletmede gider kategorisi bulunamadı."
                      : "Önce bir işletme seçin."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11px] text-surface-500 inline-flex items-start gap-1.5">
        <Wallet size={13} className="shrink-0 mt-px" />
        Bütçe alarmı varsayılan KAPALIDIR — yalnız değer girilen kategorilerde,
        ay içinde bütçe ilk kez aşıldığında bir kez uyarı gönderilir (spam yapmaz).
        Yeni ay başında durum sıfırlanır.
      </p>
    </div>
  );
}

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
        <p className="v2-eyebrow">Raporlar</p>
        <h1 className="v2-display text-2xl mt-1">
          Bütçe-Eşik Ayarları
        </h1>
        <p className="text-[rgb(var(--v2-muted))] mt-1 text-sm">
          Kategori başına aylık bütçe tanımlayın; aşıldığında uyarı alın.
          {!isAdmin && " (Bütçe değiştirme yetkisi yalnız yöneticidedir.)"}
        </p>
      </section>

      {/* İşletme seçici */}
      <section className="v2-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Building2 size={14} className="text-[rgb(var(--v2-muted))]" />
          <select
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className="py-1.5 px-3 w-auto text-sm rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
          >
            <option value="" disabled>İşletme seçin…</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        {data && (
          <span className="text-xs text-[rgb(var(--v2-muted))]">
            Dönem: <b className="text-[rgb(var(--v2-ink))]">{data.period_label}</b> (aylık)
          </span>
        )}
        {loading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[rgb(var(--v2-muted))]">
            <Loader2 size={13} className="animate-spin" /> Yükleniyor…
          </span>
        )}
      </section>

      {/* Kategori bütçe listesi */}
      <section className="v2-card p-0 overflow-hidden">
        <div className="v2-table-wrap">
          <table className="v2-table">
            <thead>
              <tr>
                <th>Kategori</th>
                <th className="v2-td-num">Bu Ay Harcama</th>
                <th className="v2-td-num">Aylık Bütçe</th>
                <th className="w-40">Kullanım</th>
                <th className="v2-td-num">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isEditing = editing === row.category_id;
                const pct = row.usage_pct ?? 0;
                return (
                  <tr key={row.category_id}>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        {row.color && (
                          <span className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: row.color }} />
                        )}
                        <span className="text-[rgb(var(--v2-ink))]">{row.category_name}</span>
                      </span>
                    </td>
                    <td className="v2-td-num num text-[rgb(var(--v2-muted))]">
                      {formatCurrency(row.spent, "TRY")}
                    </td>
                    <td className="v2-td-num">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          autoFocus
                          placeholder="Kapalı"
                          className="w-28 text-right py-1 px-2 text-sm rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] placeholder:text-[rgb(var(--v2-muted))] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                        />
                      ) : row.budget != null ? (
                        <span className="num text-[rgb(var(--v2-ink))] font-medium">
                          {formatCurrency(row.budget, "TRY")}
                        </span>
                      ) : (
                        <span className="text-xs text-[rgb(var(--v2-muted))]">Kapalı</span>
                      )}
                    </td>
                    <td>
                      {row.budget != null ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full v2-sunken overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                row.exceeded ? "bg-status-danger" : pct >= 80 ? "bg-status-warning" : "bg-accent"
                              )}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <span className={cn(
                            "num text-xs font-semibold w-10 text-right",
                            row.exceeded ? "text-status-danger" : pct >= 80 ? "text-status-warning" : "text-[rgb(var(--v2-muted))]"
                          )}>
                            {pct}%
                          </span>
                          {row.exceeded && <AlertTriangle size={13} className="text-status-danger shrink-0" />}
                        </div>
                      ) : (
                        <span className="text-xs text-[rgb(var(--v2-muted))]">—</span>
                      )}
                    </td>
                    <td className="v2-td-num">
                      {!isAdmin ? (
                        <span className="text-xs text-[rgb(var(--v2-muted))]">—</span>
                      ) : isEditing ? (
                        <div className="inline-flex gap-1">
                          <button
                            onClick={() => save(row.category_id)}
                            disabled={savingId === row.category_id}
                            className="p-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent-strong dark:text-accent disabled:opacity-50 v2-press"
                            title="Kaydet"
                            aria-label="Kaydet"
                          >
                            {savingId === row.category_id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Check size={14} />}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1.5 rounded-lg v2-sunken hover:border-accent/50 text-[rgb(var(--v2-muted))] v2-press"
                            title="İptal"
                            aria-label="İptal"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(row)}
                          className="p-1.5 rounded-lg v2-sunken hover:border-accent/50 text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))] v2-press"
                          title="Bütçe düzenle"
                          aria-label="Bütçe düzenle"
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
                  <td colSpan={5} className="px-4 py-8 text-center text-[rgb(var(--v2-muted))] text-sm">
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

      <p className="text-[11px] text-[rgb(var(--v2-muted))] inline-flex items-start gap-1.5">
        <Wallet size={13} className="shrink-0 mt-px" />
        Bütçe alarmı varsayılan KAPALIDIR — yalnız değer girilen kategorilerde,
        ay içinde bütçe ilk kez aşıldığında bir kez uyarı gönderilir (spam yapmaz).
        Yeni ay başında durum sıfırlanır.
      </p>
    </div>
  );
}

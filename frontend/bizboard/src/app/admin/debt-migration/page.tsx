"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GitMerge, Loader2, CheckCircle2, AlertCircle, Info,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/shared/PageHeader";

interface MigrationResult {
  dry_run: boolean;
  orphan_debts: number;
  matched_existing: number;
  created_new: number;
  skipped: number;
  recomputed_counterparts: number;
}

export default function DebtMigrationPage() {
  const router = useRouter();
  const { profile } = useAppStore();
  const [autoCreate, setAutoCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dryResult, setDryResult] = useState<MigrationResult | null>(null);
  const [applyResult, setApplyResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);

  useEffect(() => {
    if (profile && profile.role !== "admin") {
      router.push("/dashboard");
    }
  }, [profile, router]);

  async function runDry() {
    setLoading(true);
    setError(null);
    setApplyResult(null);
    try {
      const r = await api.post<MigrationResult>(
        `/admin/counterparts/migrate-debts?dry_run=true&auto_create=${autoCreate}`,
        {}
      );
      setDryResult(r);
      toast.info("Deneme çalıştırması tamamlandı");
    } catch (e) {
      setError(getErrorMessage(e));
      toast.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function runApply() {
    setConfirmApply(false);
    setLoading(true);
    setError(null);
    try {
      const r = await api.post<MigrationResult>(
        `/admin/counterparts/migrate-debts?dry_run=false&auto_create=${autoCreate}`,
        {}
      );
      setApplyResult(r);
      setDryResult(null);
      toast.success("Taşıma uygulandı");
    } catch (e) {
      setError(getErrorMessage(e));
      toast.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto">
      <PageHeader
        title="Borç Cari Taşıma"
        icon={GitMerge}
        fallbackHref="/admin"
        className="mb-8"
      />

      {/* Info card */}
      <div className="mb-6 p-4 bg-blue-900/20 border border-blue-800/40 rounded-xl text-sm text-blue-200">
        <div className="flex gap-3">
          <Info size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Ne yapar?</p>
            <p className="text-xs text-blue-300/80">
              v1.5.0 öncesi serbest metin isim ile oluşturulan eski borç kayıtlarını,
              normalize edilmiş <strong>cari</strong> kayıtlarına bağlar. Büyük/küçük harf
              duyarsız isim eşleşmesi yapar. Eşleşme yoksa ve <em>Otomatik oluştur</em> açıkken
              yeni cari kaydı oluşturur.
            </p>
            <p className="text-xs text-blue-300/80 mt-2">
              Idempotent — bir kez çalıştırdıktan sonra sahipsiz borç kalmazsa
              sonraki çağrılar sıfır etki döndürür. Etkilenen cariler için
              cari bakiye otomatik yeniden hesaplanır.
            </p>
          </div>
        </div>
      </div>

      {/* Options */}
      <div className="mb-6 v2-card p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoCreate}
            onChange={(e) => setAutoCreate(e.target.checked)}
            className="w-4 h-4 rounded accent-accent"
          />
          <div>
            <span className="text-sm text-[rgb(var(--v2-ink))] font-medium">Otomatik oluştur</span>
            <p className="text-xs text-[rgb(var(--v2-muted))]">
              Eşleşme bulunamayan isimleri yeni cari olarak yarat (rol=OTHER).
              Kapalıyken bu kayıtlar atlanır.
            </p>
          </div>
        </label>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={runDry}
          disabled={loading}
          className="v2-btn v2-press !py-2.5 !px-4 text-sm border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] hover:border-accent/50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Info size={16} />}
          Deneme çalıştırması
        </button>
        <button
          onClick={() => setConfirmApply(true)}
          disabled={loading}
          className="v2-btn v2-btn--accent v2-press !py-2.5 !px-4 text-sm"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          Uygula
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-status-danger/40 bg-status-danger/10 text-status-danger text-sm flex items-start gap-3">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Results */}
      {dryResult && <ResultPanel title="Deneme sonucu" result={dryResult} variant="info" />}
      {applyResult && <ResultPanel title="Uygulama sonucu" result={applyResult} variant="success" />}

      {confirmApply && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="modal-surface rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-[rgb(var(--v2-ink))] mb-2">
              Taşımayı Çalıştır
            </h3>
            <p className="text-sm text-[rgb(var(--v2-muted))] mb-2">
              Bu işlem sahipsiz borç kayıtlarını cari kayıtlarına kalıcı olarak bağlar.
            </p>
            <p className="text-sm text-[rgb(var(--v2-muted))] mb-6">
              Otomatik oluştur:{" "}
              <strong className={autoCreate ? "text-accent-strong dark:text-accent" : "text-[rgb(var(--v2-muted))]"}>
                {autoCreate ? "AÇIK" : "Kapalı"}
              </strong>
              . Devam edilsin mi?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmApply(false)}
                className="btn-secondary px-4 py-2 text-sm"
              >
                İptal
              </button>
              <button
                onClick={runApply}
                className="v2-btn v2-btn--accent v2-press !py-2 !px-4 text-sm"
              >
                Evet, Çalıştır
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultPanel({
  title, result, variant,
}: { title: string; result: MigrationResult; variant: "info" | "success" }) {
  const baseClass =
    variant === "success"
      ? "bg-status-success/10 border-status-success/30 text-[rgb(var(--v2-ink))]"
      : "v2-card";

  return (
    <div className={`p-5 ${variant === "success" ? "border rounded-xl" : ""} ${baseClass}`}>
      <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-[rgb(var(--v2-ink))]">
        {variant === "success" && <CheckCircle2 size={18} className="text-status-success" />}
        {title}
        {result.dry_run && (
          <span className="v2-chip-accent ml-2 text-[10px] font-medium">
            DENEME
          </span>
        )}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <Stat label="Sahipsiz borç" value={result.orphan_debts} />
        <Stat label="Eşleşen" value={result.matched_existing} positive />
        <Stat label="Yeni oluşturulan" value={result.created_new} positive />
        <Stat label="Atlanan" value={result.skipped} />
        <Stat label="Yeniden hesaplanan" value={result.recomputed_counterparts} />
      </div>
      {result.dry_run && (
        <p className="text-xs text-[rgb(var(--v2-muted))] mt-3">
          Bu sadece bir simülasyon. Hiçbir veri değişiklikten geçmedi.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-[rgb(var(--v2-muted))] uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${positive ? "text-status-success" : "text-[rgb(var(--v2-ink))]"}`}>
        {value}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, GitMerge, Loader2, CheckCircle2, AlertCircle, Info,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

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
      toast.info("Dry-run tamamlandı");
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
      toast.success("Migration uygulandı");
    } catch (e) {
      setError(getErrorMessage(e));
      toast.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push("/admin")}
          className="p-2 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors"
        >
          <ChevronLeft size={20} className="text-amber-400" />
        </button>
        <div className="flex items-center gap-2.5">
          <GitMerge size={24} className="text-amber-400" />
          <h1 className="text-2xl font-bold text-white">Borc Counterpart Migration</h1>
        </div>
      </div>

      {/* Info card */}
      <div className="mb-6 p-4 bg-blue-900/20 border border-blue-800/40 rounded-xl text-sm text-blue-200">
        <div className="flex gap-3">
          <Info size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Ne yapar?</p>
            <p className="text-xs text-blue-300/80">
              v1.5.0 oncesi free-text isim ile olusturulan eski borc kayitlarini,
              normalize <strong>Counterpart</strong> kayitlarina baglar. Case-insensitive
              isim eslesmesi yapar. Eslesme yoksa ve <em>Auto-create</em> acikken
              yeni counterpart kaydi olusturur.
            </p>
            <p className="text-xs text-blue-300/80 mt-2">
              Idempotent — bir kez calistirdiktan sonra orphan borc kalmazsa
              sonraki cagrilar sifir etki dondurur. Etkilenen counterpart'lar icin
              cari bakiye otomatik recompute olur.
            </p>
          </div>
        </div>
      </div>

      {/* Options */}
      <div className="mb-6 p-4 bg-surface-900 border border-surface-700 rounded-xl">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoCreate}
            onChange={(e) => setAutoCreate(e.target.checked)}
            className="w-4 h-4 rounded accent-amber-500"
          />
          <div>
            <span className="text-sm text-white font-medium">Auto-create</span>
            <p className="text-xs text-gray-400">
              Eslesme bulunamayan isimleri yeni Counterpart olarak yarat (rol=OTHER).
              Kapaliyken bu kayitlar atlanir (skipped).
            </p>
          </div>
        </label>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={runDry}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Info size={16} />}
          Dry-run (test)
        </button>
        <button
          onClick={() => setConfirmApply(true)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          Calistir (apply)
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm flex items-start gap-3">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Results */}
      {dryResult && <ResultPanel title="Dry-run sonucu" result={dryResult} variant="info" />}
      {applyResult && <ResultPanel title="Apply sonucu" result={applyResult} variant="success" />}

      {confirmApply && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="glass-card p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-2">
              Migration'i Calistir
            </h3>
            <p className="text-sm text-gray-400 mb-2">
              Bu islem orphan borc kayitlarini Counterpart kayitlarina kalici olarak baglar.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Auto-create:{" "}
              <strong className={autoCreate ? "text-amber-400" : "text-gray-500"}>
                {autoCreate ? "ACIK" : "Kapali"}
              </strong>
              . Devam edilsin mi?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmApply(false)}
                className="px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-gray-200 text-sm"
              >
                Iptal
              </button>
              <button
                onClick={runApply}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm"
              >
                Evet, Calistir
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
      ? "bg-green-900/20 border-green-800/40 text-green-200"
      : "bg-surface-900 border-surface-700 text-white";

  return (
    <div className={`p-5 border rounded-xl ${baseClass}`}>
      <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
        {variant === "success" && <CheckCircle2 size={18} />}
        {title}
        {result.dry_run && (
          <span className="ml-2 px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-medium">
            DRY-RUN
          </span>
        )}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <Stat label="Orphan borc" value={result.orphan_debts} />
        <Stat label="Eslesen" value={result.matched_existing} positive />
        <Stat label="Yeni olusturulan" value={result.created_new} positive />
        <Stat label="Atlanan" value={result.skipped} />
        <Stat label="Recompute edilen" value={result.recomputed_counterparts} />
      </div>
      {result.dry_run && (
        <p className="text-xs text-gray-400 mt-3">
          Bu sadece bir simulasyon. Hicbir veri degisiklikten gecmedi.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${positive ? "text-green-400" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

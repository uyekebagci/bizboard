"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, RefreshCw, Loader2, CheckCircle2, AlertCircle, Info, Clock,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

interface RunResult {
  processed: number;
  created: number;
  skipped: number;
}

export default function RecurringPage() {
  const router = useRouter();
  const { profile } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile && profile.role !== "admin") {
      router.push("/dashboard");
    }
  }, [profile, router]);

  async function runNow() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.post<RunResult>("/admin/recurring/run", {});
      setResult(r);
      toast.info(`Recurring tamamlandı: ${r.created} oluşturuldu, ${r.skipped} atlandı`);
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
          <RefreshCw size={24} className="text-amber-400" />
          <h1 className="text-2xl font-bold text-white">Recurring Tx Jeneratoru</h1>
        </div>
      </div>

      <div className="mb-6 p-4 bg-blue-900/20 border border-blue-800/40 rounded-xl text-sm text-blue-200">
        <div className="flex gap-3">
          <Info size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Ne yapar?</p>
            <p className="text-xs text-blue-300/80">
              Her ayin 1&apos;inde 02:30 Europe/Istanbul&apos;da otomatik calisir; aktif olan
              &quot;Aylik tx&quot; bayrakli sabit giderler icin bu ay bir Transaction yaratir.
              MONTHLY her ay, QUARTERLY Ocak/Nisan/Temmuz/Ekim, YEARLY sadece Ocak.
            </p>
            <p className="text-xs text-blue-300/80 mt-2">
              Idempotent — ayni ay icinde tekrar tetiklenirse o FixedCost atlanir
              (FixedCost.last_auto_run kontrol edilir). Audit&apos;e
              TRANSACTION_CREATE source=RECURRING ile dusurulur.
            </p>
            <p className="text-xs text-blue-300/80 mt-2">
              Asagidaki buton scheduled task&apos;in yaptigi isi <strong>simdi</strong> calistirir
              (test / acil senaryo).
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <button
          onClick={runNow}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-semibold"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />}
          Simdi Calistir
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm flex items-start gap-3">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {result && (
        <div className="p-5 border rounded-xl bg-green-900/20 border-green-800/40 text-green-200">
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <CheckCircle2 size={18} />
            Run sonucu
          </h3>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Stat label="Incelenen" value={result.processed} />
            <Stat label="Olusturulan" value={result.created} positive />
            <Stat label="Atlanan" value={result.skipped} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-surface-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${positive ? "text-green-400" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

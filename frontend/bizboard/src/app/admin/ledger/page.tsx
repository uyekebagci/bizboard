"use client";

/**
 * Ledger Bakım paneli — ADMIN-only ledger sağlık/bakım operasyonları.
 *
 * <p>Backend uçları MEVCUT; bu sayfa yalnız UI bağlar (Daxa v2 + çift tema).
 * Tüm destructive aksiyonlar onay modalıyla, sonuç toast + ResultPanel ile.</p>
 *
 * <ul>
 *   <li>Invariant rozeti (GET /admin/ledger/invariant)</li>
 *   <li>Backfill (POST /admin/ledger/backfill?dryRun=) — dry-run + gerçek</li>
 *   <li>Tek-işlem reverse (POST /admin/ledger/reverse/{txId}) — txId input</li>
 *   <li>Öneriler (GET /admin/ledger/suggestions/*) — salt-okunur listeler</li>
 *   <li>process-waitlist / reconciliation / close-month</li>
 *   <li>(düşük) gün-kapanışı bayrakları + dayopen-backfill / migrate</li>
 * </ul>
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Database,
  Loader2,
  PlayCircle,
  RotateCcw,
  ScrollText,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import type { Business } from "@/types";
import {
  closeMonth,
  dayCloseMigrate,
  dayOpenBackfill,
  getInvariant,
  processWaitList,
  reverseTransaction,
  runBackfill,
  runReconciliation,
  type InvariantReport,
} from "@/lib/api/admin-ledger";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { InvariantBadge } from "@/components/admin/ledger/InvariantBadge";
import { SuggestionsSection } from "@/components/admin/ledger/SuggestionsSection";
import { DayCloseFlags } from "@/components/admin/ledger/DayCloseFlags";
import { ResultPanel, type ActionResult } from "@/components/admin/ledger/ResultPanel";

/** Onay diyaloğu state'i — confirm tetiklendiğinde çalışacak iş. */
interface PendingAction {
  title: string;
  body: React.ReactNode;
  danger?: boolean;
  confirmLabel?: string;
  run: () => Promise<ActionResult>;
}

export default function AdminLedgerPage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const isAdmin = profile?.role === "admin";

  // Invariant
  const [invariant, setInvariant] = useState<InvariantReport | null>(null);
  const [invLoading, setInvLoading] = useState(true);
  const [invError, setInvError] = useState<string | null>(null);

  // İşletmeler (close-month / enforce / dayopen scope için)
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [flagBusinessId, setFlagBusinessId] = useState("");

  // Tek-işlem reverse
  const [txId, setTxId] = useState("");

  // close-month input
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));

  // Onay modalı + sonuç
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  useEffect(() => {
    if (profile && profile.role !== "admin") router.replace("/dashboard");
  }, [profile, router]);

  const loadInvariant = useCallback(async () => {
    setInvLoading(true);
    setInvError(null);
    try {
      setInvariant(await getInvariant());
    } catch (e) {
      setInvError(getErrorMessage(e));
    } finally {
      setInvLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInvariant();
    api
      .get<Business[]>("/businesses")
      .then((list) => setBusinesses(list || []))
      .catch((e) => toast.error(getErrorMessage(e)));
  }, [loadInvariant]);

  /** Onaylı aksiyonu çalıştır: run() → toast + ResultPanel + invariant refresh. */
  async function confirmRun() {
    if (!pending) return;
    setRunning(true);
    try {
      const res = await pending.run();
      setResult(res);
      toast.success(`${res.title} tamamlandı`);
      setPending(null);
      void loadInvariant();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setRunning(false);
    }
  }

  if (!isAdmin) return null;

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto">
      <PageHeader onBack={() => router.push("/admin")} />

      <div className="space-y-5">
        <InvariantBadge
          report={invariant}
          loading={invLoading}
          error={invError}
          onRefresh={loadInvariant}
        />

        {result && <ResultPanel result={result} onDismiss={() => setResult(null)} />}

        {/* ── Backfill ─────────────────────────────────────── */}
        <section className="v2-card p-5">
          <SectionTitle icon={Database} title="Posting Backfill" />
          <p className="text-[11px] text-[rgb(var(--v2-muted))] mb-4">
            Transaction → posting türetimi. Dry-run DB&apos;ye dokunmaz; gerçek
            backfill idempotent + audit&apos;li.
          </p>
          <div className="flex flex-wrap gap-2">
            <RunBtn
              label="Dry-run"
              onClick={() =>
                setPending({
                  title: "Backfill (dry-run)",
                  body: "Dry-run DB'ye dokunmaz; yalnız kaç işlemin türetileceğini raporlar.",
                  confirmLabel: "Çalıştır",
                  run: async () => {
                    const r = await runBackfill(true);
                    return backfillResult(r);
                  },
                })
              }
            />
            <RunBtn
              danger
              label="Gerçek backfill"
              onClick={() =>
                setPending({
                  title: "Backfill (gerçek)",
                  danger: true,
                  body: "DB'de posting'leri türetir. Idempotent + audit'li ama veriye yazar. Devam edilsin mi?",
                  confirmLabel: "Backfill çalıştır",
                  run: async () => {
                    const r = await runBackfill(false);
                    return backfillResult(r);
                  },
                })
              }
            />
          </div>
        </section>

        {/* ── Tek-işlem reverse ────────────────────────────── */}
        <section className="v2-card p-5">
          <SectionTitle icon={Undo2} title="Tek İşlem Reverse" />
          <p className="text-[11px] text-[rgb(var(--v2-muted))] mb-4">
            Bir işlemin türetilmiş entry + posting&apos;lerini geri alır
            (reversible, audit&apos;li). İşlem (transaction) ID&apos;si girin.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={txId}
              onChange={(e) => setTxId(e.target.value)}
              placeholder="Transaction ID (UUID)"
              className="input flex-1 font-mono text-xs"
            />
            <button
              type="button"
              disabled={!txId.trim()}
              onClick={() =>
                setPending({
                  title: "İşlem reverse",
                  danger: true,
                  confirmLabel: "Reverse et",
                  body: (
                    <>
                      <span className="font-mono text-xs break-all text-[rgb(var(--v2-ink))]">
                        {txId.trim()}
                      </span>{" "}
                      işleminin posting&apos;leri geri alınacak. Devam edilsin mi?
                    </>
                  ),
                  run: async () => {
                    const r = await reverseTransaction(txId.trim());
                    setTxId("");
                    return {
                      title: "İşlem reverse",
                      fields: { txId: r.txId, "silinen entry": r.removedEntries },
                    };
                  },
                })
              }
              className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 shrink-0"
            >
              <Undo2 size={15} /> Reverse
            </button>
          </div>
        </section>

        {/* ── Toplu bakım ───────────────────────────────────── */}
        <section className="v2-card p-5">
          <SectionTitle icon={RotateCcw} title="Toplu Bakım" />
          <div className="space-y-3">
            <RunBtn
              full
              icon={PlayCircle}
              label="Wait-list işle"
              onClick={() =>
                setPending({
                  title: "Wait-list işleme",
                  body: "Bekleyen kayıtları anında işler (normalde 03:30 otomatik).",
                  confirmLabel: "İşle",
                  run: async () => {
                    const r = await processWaitList();
                    return { title: "Wait-list", fields: { durum: r.status, mesaj: r.message } };
                  },
                })
              }
            />
            <RunBtn
              full
              danger
              icon={RotateCcw}
              label="Tam mutabakat (reconciliation)"
              onClick={() =>
                setPending({
                  title: "Tam mutabakat",
                  danger: true,
                  body: "TÜM işletmelerin TÜM geçmiş dönemlerini sıfırdan yeniden hesaplar. Ağır işlem — devam edilsin mi?",
                  confirmLabel: "Mutabakat çalıştır",
                  run: async () => {
                    const r = await runReconciliation();
                    return {
                      title: "Tam mutabakat",
                      fields: {
                        işletme: r.businessCount,
                        "dönem işlendi": r.periodsProcessed,
                        oluşturulan: r.periodsCreated,
                        güncellenen: r.periodsUpdated,
                        silinen: r.periodsDeleted,
                        "wait-list temizlendi": r.waitListCleared,
                      },
                    };
                  },
                })
              }
            />

            {/* Close-month */}
            <div className="v2-sunken rounded-xl p-3">
              <div className="text-sm font-medium text-[rgb(var(--v2-ink))] inline-flex items-center gap-1.5 mb-2">
                <ScrollText size={14} /> Ay kapat (tüm işletmeler)
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="Yıl"
                  className="input w-24"
                  min={2000}
                  max={2100}
                />
                <input
                  type="number"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  placeholder="Ay"
                  className="input w-20"
                  min={1}
                  max={12}
                />
                <button
                  type="button"
                  onClick={() => openCloseMonth()}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors flex-1"
                >
                  Ayı kapat
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Öneriler ──────────────────────────────────────── */}
        <SuggestionsSection />

        {/* ── (düşük) Gün-kapanışı bayrakları ───────────────── */}
        <DayCloseFlags
          businesses={businesses}
          selectedBusinessId={flagBusinessId}
          onSelectBusiness={setFlagBusinessId}
          onRunBackfill={(dryRun) => openDayOpenBackfill(dryRun)}
          onRunMigrate={(dryRun) => openMigrate(dryRun)}
        />
      </div>

      <ConfirmModal
        open={pending != null}
        title={pending?.title ?? ""}
        body={pending?.body}
        danger={pending?.danger}
        confirmLabel={pending?.confirmLabel}
        loading={running}
        onConfirm={confirmRun}
        onCancel={() => {
          if (!running) setPending(null);
        }}
      />
    </div>
  );

  // ── helper: close-month / dayopen / migrate confirm açıcıları ───────────────

  function openCloseMonth() {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      toast.error("Geçerli bir yıl girin.");
      return;
    }
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      toast.error("Ay 1-12 arasında olmalı.");
      return;
    }
    setPending({
      title: "Ay kapat",
      danger: true,
      confirmLabel: "Ayı kapat",
      body: `${y}/${m} dönemi TÜM işletmeler için kapatılacak/yeniden hesaplanacak. Devam edilsin mi?`,
      run: async () => {
        const r = await closeMonth(y, m);
        return { title: "Ay kapat", fields: { durum: r.status, mesaj: r.message } };
      },
    });
  }

  function openDayOpenBackfill(dryRun: boolean) {
    setPending({
      title: `Gün-açılışı backfill (${dryRun ? "dry-run" : "gerçek"})`,
      danger: !dryRun,
      confirmLabel: dryRun ? "Çalıştır" : "Gerçek çalıştır",
      body: dryRun
        ? "Dry-run DB'ye dokunmaz."
        : "CLOSE_SYNC kayıtlarını yazar (idempotent + reversible). Devam edilsin mi?",
      run: async () => {
        const r = await dayOpenBackfill(dryRun);
        return { title: "Gün-açılışı backfill", raw: r };
      },
    });
  }

  function openMigrate(dryRun: boolean) {
    setPending({
      title: `Migrate (${dryRun ? "dry-run" : "gerçek"})`,
      danger: !dryRun,
      confirmLabel: dryRun ? "Çalıştır" : "Gerçek çalıştır",
      body: dryRun
        ? "Dry-run DB'ye dokunmaz."
        : "CashClosing → DayClose migrate yazar (idempotent + reversible). Devam edilsin mi?",
      run: async () => {
        const r = await dayCloseMigrate(dryRun);
        return { title: "CashClosing → DayClose migrate", raw: r };
      },
    });
  }
}

// ── alt parçacıklar ────────────────────────────────────────────────────────

function PageHeader({ onBack }: { onBack: () => void }) {
  return (
    <>
      <div className="flex items-center gap-3 mb-2">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg v2-sunken text-[rgb(var(--v2-ink))] hover:opacity-80 transition-opacity"
          aria-label="Admin paneline dön"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex items-center gap-2.5">
          <Database size={24} className="text-accent-strong dark:text-accent" />
          <h1 className="text-2xl font-bold text-[rgb(var(--v2-ink))]">Ledger Bakım</h1>
        </div>
      </div>
      <p className="text-sm text-[rgb(var(--v2-muted))] mb-6 ml-12">
        Bakiye invariant&apos;ı, posting backfill, tek-işlem reverse, mutabakat ve
        öneri uçları. Tüm yazma işlemleri onaylı + audit&apos;li.
      </p>
    </>
  );
}

function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-1">
      <Icon size={18} className="text-accent-strong dark:text-accent" />
      <h2 className="text-sm font-bold text-[rgb(var(--v2-ink))]">{title}</h2>
    </div>
  );
}

function RunBtn({
  label,
  onClick,
  danger,
  full,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  full?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-sm px-4 py-2.5 rounded-xl font-semibold transition-colors inline-flex items-center justify-center gap-2 ${
        full ? "w-full" : ""
      } ${
        danger
          ? "bg-red-600 hover:bg-red-500 text-white"
          : "v2-card text-[rgb(var(--v2-ink))] hover:opacity-80"
      }`}
    >
      {Icon && <Icon size={15} />}
      {label}
    </button>
  );
}

/** BackfillResult → ResultPanel alanları (dry-run/gerçek aynı şekil). */
function backfillResult(r: {
  dryRun: boolean;
  total: number;
  derived: number;
  skipped: number;
  flagged: number;
}): ActionResult {
  return {
    title: r.dryRun ? "Backfill (dry-run)" : "Backfill (gerçek)",
    fields: {
      toplam: r.total,
      türetildi: r.derived,
      atlandı: r.skipped,
      FLAGGED: r.flagged,
    },
  };
}

"use client";

/**
 * OCR Modülü (WP 1bdb8116) — Belge Tarama (OCR) sayfası.
 *
 * <p>Yükle (drag-drop / dosya seç, tek veya bulk) → OCR (Mindee birincil /
 * Tesseract fallback) → çıkarılan alanları review/confirm modalında düzelt &
 * onayla → mevcut transaction/instrument oluşturulur. Çift tema.</p>
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2, ScanLine, UploadCloud, FileText, Receipt,
  CheckCircle2, AlertTriangle, XCircle, Trash2,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useBusinesses } from "@/hooks/useBusinesses";
import { useOcr } from "@/hooks/useOcr";
import { OcrReviewModal } from "@/components/ocr/OcrReviewModal";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type {
  BankAccountListItem, Category, Counterpart, OcrDocumentType, OcrScan,
} from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListSkeleton } from "@/components/shared/Skeleton";

const DOC_TYPES: { value: OcrDocumentType; label: string }[] = [
  { value: "RECEIPT", label: "Fiş / Dekont" },
  { value: "CHECK", label: "Çek" },
  { value: "PROMISSORY_NOTE", label: "Senet" },
  { value: "BANK_STATEMENT", label: "Banka Dekontu" },
];

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export default function BelgeTaramaPage() {
  const { businesses } = useBusinesses();
  const businessId = businesses?.[0]?.id ?? null;
  const { scans, loading, scanFile, scanBulk, confirm, discard } = useOcr(businessId);

  const [docType, setDocType] = useState<OcrDocumentType>("RECEIPT");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Confirm formu için lookup verileri
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<BankAccountListItem[]>([]);
  const [counterparts, setCounterparts] = useState<Counterpart[]>([]);
  const [reviewScan, setReviewScan] = useState<OcrScan | null>(null);

  useEffect(() => {
    if (!businessId) return;
    api.get<Category[]>(`/businesses/${businessId}/categories`).then(setCategories).catch(() => setCategories([]));
  }, [businessId]);
  useEffect(() => {
    api.get<BankAccountListItem[]>("/bank-accounts").then(setAccounts).catch(() => setAccounts([]));
    api.get<Counterpart[]>("/counterparts").then((r) => setCounterparts(r ?? [])).catch(() => setCounterparts([]));
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!businessId) { toast.info("İşletme bulunamadı"); return; }
      if (files.length === 0) return;
      setUploading(true);
      try {
        if (files.length === 1) {
          const scan = await scanFile(files[0], docType);
          if (scan.status === "FAILED") {
            toast.warning("OCR otomatik okuyamadı — alanları manuel girin");
          } else if (scan.has_low_confidence) {
            toast.warning("Bazı alanların güveni düşük — kontrol edin");
          } else {
            toast.success("Belge tarandı");
          }
          setReviewScan(scan);
        } else {
          const resp = await scanBulk(files, docType);
          if (resp.failed_files.length > 0) {
            toast.warning(`${resp.failed_files.length} dosya başarısız`);
          } else {
            toast.success(`${resp.scans.length} belge tarandı`);
          }
        }
      } catch (err) {
        toast.error(err);
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [businessId, docType, scanFile, scanBulk]
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    void handleFiles(files);
  }

  async function handleDiscard(scanId: string) {
    try {
      await discard(scanId);
      toast.info("Tarama atıldı");
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title="Belge Tarama (OCR)"
        subtitle="Fiş, çek/senet ve dekont fotoğrafı/PDF'i yükleyin — alanlar otomatik çıkarılır"
        icon={ScanLine}
      />

      {/* Belge tipi + yükleme */}
      <section className="card p-4 space-y-3">
        <div>
          <p className="label flex items-center gap-1.5 mb-2"><Receipt size={13} /> Belge tipi</p>
          <div className="flex flex-wrap gap-2">
            {DOC_TYPES.map((dt) => (
              <button key={dt.value} type="button" onClick={() => setDocType(dt.value)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors",
                  docType === dt.value
                    ? "bg-accent/25 text-accent border-accent/40"
                    : "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] border-[rgb(var(--v2-border))] hover:bg-[rgb(var(--v2-border))]"
                )}>
                {dt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Drag-drop alanı */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
            dragOver
              ? "border-accent bg-accent/10"
              : "border-[rgb(var(--v2-border))] hover:border-[rgb(var(--v2-muted))] bg-[rgb(var(--v2-sunken))]"
          )}
        >
          <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden"
            onChange={(e) => void handleFiles(Array.from(e.target.files ?? []))} />
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-[rgb(var(--v2-muted))]">
              <Loader2 size={28} className="animate-spin text-accent" />
              <p className="text-sm">Taranıyor...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-[rgb(var(--v2-muted))]">
              <UploadCloud size={32} className="text-accent" />
              <p className="text-sm text-[rgb(var(--v2-ink))] font-medium">
                Sürükle-bırak veya tıkla
              </p>
              <p className="text-xs">JPEG, PNG, WebP, PDF · tek veya çoklu</p>
            </div>
          )}
        </div>
      </section>

      {/* Tarama listesi */}
      <section className="space-y-2">
        <p className="text-sm font-semibold text-[rgb(var(--v2-ink))]">Taramalar</p>
        {loading && scans.length === 0 ? (
          <ListSkeleton rows={3} />
        ) : scans.length === 0 ? (
          <EmptyState icon={ScanLine} title="Henüz tarama yok" description="Yukarıdan belge yükleyin" size="sm" />
        ) : (
          <div className="v2-card divide-y divide-[rgb(var(--v2-border))]">
            {scans.map((s) => (
              <ScanRow key={s.id} scan={s}
                onReview={() => setReviewScan(s)}
                onDiscard={() => handleDiscard(s.id)} />
            ))}
          </div>
        )}
      </section>

      {reviewScan && (
        <OcrReviewModal
          scan={reviewScan}
          categories={categories}
          accounts={accounts}
          counterparts={counterparts}
          onClose={() => setReviewScan(null)}
          onConfirmed={() => setReviewScan(null)}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}

function ScanRow({ scan, onReview, onDiscard }: {
  scan: OcrScan; onReview: () => void; onDiscard: () => void;
}) {
  const docLabel = DOC_TYPES.find((d) => d.value === scan.document_type)?.label ?? scan.document_type;
  const pending = scan.status === "EXTRACTED" || scan.status === "LOW_CONFIDENCE" || scan.status === "FAILED";
  const amount = scan.fields.find((f) => f.key === "amount")?.value;

  return (
    <div className="p-3 flex items-center gap-3">
      <StatusIcon status={scan.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[rgb(var(--v2-ink))]">{docLabel}</span>
          {amount && <span className="text-xs text-[rgb(var(--v2-muted))] num">{amount}</span>}
          <StatusBadge status={scan.status} />
        </div>
        <p className="text-[11px] text-[rgb(var(--v2-muted))] truncate">
          {scan.ocr_provider ?? "—"}
          {scan.overall_confidence != null && ` · %${Math.round(scan.overall_confidence * 100)} güven`}
          {scan.result_entity_type && ` · ${scan.result_entity_type} oluşturuldu`}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {pending && (
          <button onClick={onReview}
            className="px-3 py-1.5 rounded-lg bg-accent/20 text-accent border border-accent/30 text-xs font-semibold hover:bg-accent/30">
            İncele & Onayla
          </button>
        )}
        {pending && (
          <button onClick={onDiscard} title="At"
            className="p-1.5 rounded-lg bg-[rgb(var(--v2-sunken))] hover:bg-[rgb(var(--v2-border))] text-[rgb(var(--v2-muted))]">
            <Trash2 size={13} />
          </button>
        )}
        {scan.status === "CONFIRMED" && scan.file_url && (
          <a href={scan.file_url} target="_blank" rel="noreferrer"
            className="p-1.5 rounded-lg bg-[rgb(var(--v2-sunken))] hover:bg-[rgb(var(--v2-border))] text-[rgb(var(--v2-muted))]" title="Belge">
            <FileText size={13} />
          </a>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "CONFIRMED") return <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />;
  if (status === "FAILED") return <XCircle size={18} className="text-red-400 shrink-0" />;
  if (status === "LOW_CONFIDENCE") return <AlertTriangle size={18} className="text-amber-400 shrink-0" />;
  if (status === "DISCARDED") return <Trash2 size={18} className="text-[rgb(var(--v2-muted))] shrink-0" />;
  return <ScanLine size={18} className="text-accent shrink-0" />;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    EXTRACTED: { label: "Hazır", cls: "bg-accent/15 text-accent border-accent/25" },
    LOW_CONFIDENCE: { label: "Düşük güven", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25" },
    FAILED: { label: "Okunamadı", cls: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/25" },
    CONFIRMED: { label: "Onaylandı", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25" },
    DISCARDED: { label: "Atıldı", cls: "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] border-[rgb(var(--v2-border))]" },
  };
  const m = map[status] ?? { label: status, cls: "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] border-[rgb(var(--v2-border))]" };
  return (
    <span className={cn("text-[9px] uppercase px-1.5 py-0.5 rounded-full border", m.cls)}>
      {m.label}
    </span>
  );
}

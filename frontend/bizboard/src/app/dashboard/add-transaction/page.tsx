"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Calendar, Tag, FileText, Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { cn, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { InlineFileUpload } from "@/components/shared/FileUploadButton";
import type { Business, Category, FileUploadInfo } from "@/types";

export default function AddTransactionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { triggerRefresh } = useAppStore();
  const preselectedType = searchParams.get("type") as "income" | "expense" | null;
  const preselectedBusinessId = searchParams.get("business") || "";

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingBiz, setIsLoadingBiz] = useState(true);
  const [isLoadingCat, setIsLoadingCat] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [businessId, setBusinessId] = useState(preselectedBusinessId);
  const [direction, setDirection] = useState<"income" | "expense">(preselectedType || "expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [categoryId, setCategoryId] = useState("");
  const [tags, setTags] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<FileUploadInfo[]>([]);

  // Fetch businesses
  useEffect(() => {
    async function fetchBusinesses() {
      try {
        const data = await api.get<Business[]>("/businesses");
        setBusinesses(data || []);
        if (data.length === 1 && !businessId) {
          setBusinessId(data[0].id);
        }
      } catch (err: any) {
        console.error(err);
      } finally {
        setIsLoadingBiz(false);
      }
    }
    fetchBusinesses();
  }, []);

  // Fetch categories when business changes
  useEffect(() => {
    if (!businessId) {
      setCategories([]);
      return;
    }
    async function fetchCategories() {
      setIsLoadingCat(true);
      try {
        const data = await api.get<Category[]>(`/businesses/${businessId}/categories`);
        setCategories(data || []);
      } catch {
        setCategories([]);
      } finally {
        setIsLoadingCat(false);
      }
    }
    fetchCategories();
  }, [businessId]);

  const filteredCategories = categories.filter((c) => c.direction === direction);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessId || !amount || !date) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const tx = await api.post<{ id: string }>(`/businesses/${businessId}/transactions`, {
        direction,
        amount: parseMoneyInput(amount),
        description: description || null,
        date,
        category_id: categoryId || null,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      });

      // Yüklenen dosyaları bu transaction ile ilişkilendir
      if (uploadedFiles.length > 0 && tx?.id) {
        for (const f of uploadedFiles) {
          try {
            // Dosya zaten yüklendi, entity ilişkisini güncelle
            await api.patch(`/files/${f.id}/link`, {
              entity_type: "transaction",
              entity_id: tx.id,
            });
          } catch {
            // Dosya linklemesi başarısız olsa bile devam et
          }
        }
      }

      setSuccess(true);
      triggerRefresh();
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch (err: any) {
      setError(err.message || "Islem eklenirken bir hata olustu");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl hover:bg-surface-600 transition-colors"
        >
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <h1 className="text-xl font-bold text-white">Yeni Islem</h1>
      </div>

      {/* Success Banner */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
          <p className="text-green-700 font-medium">Islem basariyla eklendi!</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Direction Toggle */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => { setDirection("income"); setCategoryId(""); }}
            className={cn(
              "flex items-center justify-center gap-2 py-3.5 rounded-2xl font-medium transition-all border-2",
              direction === "income"
                ? "bg-green-50 border-green-300 text-green-700"
                : "bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-300"
            )}
          >
            <ArrowDownLeft size={20} />
            Gelir
          </button>
          <button
            type="button"
            onClick={() => { setDirection("expense"); setCategoryId(""); }}
            className={cn(
              "flex items-center justify-center gap-2 py-3.5 rounded-2xl font-medium transition-all border-2",
              direction === "expense"
                ? "bg-red-50 border-red-300 text-red-700"
                : "bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-300"
            )}
          >
            <ArrowUpRight size={20} />
            Gider
          </button>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-surface-200 mb-1.5">
            Tutar *
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
              placeholder="0"
              required
              className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-2xl font-bold
                         text-white placeholder:text-surface-300 focus:outline-none focus:ring-2
                         focus:ring-brand-500 focus:border-transparent transition-all"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400 font-medium">
              TRY
            </span>
          </div>
        </div>

        {/* Business Selector */}
        <div>
          <label className="block text-sm font-medium text-surface-200 mb-1.5">
            Isletme *
          </label>
          {isLoadingBiz ? (
            <div className="h-12 bg-surface-700 rounded-xl animate-pulse" />
          ) : (
            <select
              value={businessId}
              onChange={(e) => { setBusinessId(e.target.value); setCategoryId(""); }}
              required
              className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                         focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
            >
              <option value="">Isletme secin</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-surface-200 mb-1.5">
            <Tag size={14} className="inline mr-1" />
            Kategori
          </label>
          {isLoadingCat ? (
            <div className="h-12 bg-surface-700 rounded-xl animate-pulse" />
          ) : filteredCategories.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {filteredCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(categoryId === cat.id ? "" : cat.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm font-medium transition-all border",
                    categoryId === cat.id
                      ? "bg-brand-100 border-brand-300 text-brand-700"
                      : "bg-surface-700 border-surface-600 text-surface-300 hover:border-surface-300"
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          ) : businessId ? (
            <p className="text-sm text-surface-400">Bu yonde kategori bulunamadi</p>
          ) : (
            <p className="text-sm text-surface-400">Once isletme secin</p>
          )}
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-surface-200 mb-1.5">
            <Calendar size={14} className="inline mr-1" />
            Tarih *
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                       focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-surface-200 mb-1.5">
            <FileText size={14} className="inline mr-1" />
            Aciklama
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Islem aciklamasi..."
            rows={2}
            className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                       placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500
                       focus:border-transparent transition-all resize-none"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-surface-200 mb-1.5">
            Etiketler
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Virgul ile ayirin: malzeme, ofis, fatura"
            className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                       placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500
                       focus:border-transparent transition-all"
          />
        </div>

        {/* File Upload */}
        <div>
          <label className="block text-sm font-medium text-surface-200 mb-1.5">
            Dosya / Fotograf
          </label>
          <InlineFileUpload
            category="receipt"
            entityType={businessId ? "business" : undefined}
            entityId={businessId || undefined}
            uploadedFiles={uploadedFiles}
            onUploaded={(f) => setUploadedFiles((prev) => [...prev, f])}
            onRemoveFile={(fid) => {
              setUploadedFiles((prev) => prev.filter((f) => f.id !== fid));
              api.delete(`/files/${fid}`).catch(() => {});
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || !businessId || !amount || success}
          className={cn(
            "w-full py-4 rounded-2xl font-semibold text-white transition-all flex items-center justify-center gap-2",
            direction === "income"
              ? "bg-green-600 hover:bg-green-700 disabled:bg-green-300"
              : "bg-red-600 hover:bg-red-700 disabled:bg-red-300"
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Ekleniyor...
            </>
          ) : (
            <>
              {direction === "income" ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
              {direction === "income" ? "Gelir Ekle" : "Gider Ekle"}
            </>
          )}
        </button>
      </form>
    </div>
  );
}

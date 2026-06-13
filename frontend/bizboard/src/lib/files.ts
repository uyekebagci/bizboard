/**
 * Backend file upload kategorisi — whitelist.
 *
 * Backend FileStorageService.ALLOWED_CATEGORIES ile aynı set olmalı.
 * Whitelist dışı bir değer gönderilirse backend 400 + VAL-400 döner.
 */
export const FILE_CATEGORIES = [
  "document",
  "image",
  "receipt",
  "invoice",
  "avatar",
  "logo",
  "debt_doc",
  "note_attachment",
  "other",
] as const;

export type FileCategory = (typeof FILE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<FileCategory, string> = {
  document: "Belge",
  image: "Görsel",
  receipt: "Fiş",
  invoice: "Fatura",
  avatar: "Profil Görseli",
  logo: "Logo",
  debt_doc: "Borç Belgesi",
  note_attachment: "Not Eki",
  other: "Diğer",
};

/** Belirli bir File'in MIME tipinden makul bir default kategori önerir. */
export function defaultCategoryFor(file: File): FileCategory {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "document";
  if (file.type.startsWith("application/vnd.")) return "document";
  if (file.type === "text/csv" || file.type === "text/plain") return "document";
  return "other";
}

/** Backend'in client-side de uyguladığı boyut limiti (defansif kontrol). */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Backend'in kabul ettiği MIME tipleri (defansif filtre — server da kontrol eder). */
export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

"use client";

/**
 * v1.7.x: Telefon modalı içinden minimal "Hızlı Personel Ekle".
 *
 * <p>Paylaşılan personel-create API'sini (POST /businesses/{id}/employees)
 * OLDUĞU GİBİ çağırır — imza değişmez. Sadece Ad Soyad zorunlu; pozisyon
 * opsiyonel. Başarıyla eklenince {@code onCreated(newId)} ile parent yeni
 * personeli listeye çekip otomatik seçer.</p>
 */

import { useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { Employee } from "@/types";

export function QuickPersonnelModal({
  businessId,
  onClose,
  onCreated,
}: {
  businessId: string;
  onClose: () => void;
  onCreated: (newEmployeeId: string) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const name = fullName.trim();
    if (!name) {
      setError("Ad Soyad zorunlu");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<Employee>(`/businesses/${businessId}/employees`, {
        full_name: name,
        position: position.trim() || null,
      });
      toast.success("Personel eklendi");
      onCreated(created.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Personel eklenemedi");
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="modal-surface rounded-2xl shadow-xl w-full max-w-sm">
        <div className="modal-header">
          <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))]">Hızlı Personel Ekle</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[rgb(var(--v2-sunken))]">
            <X size={16} className="text-[rgb(var(--v2-muted))]" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2 text-xs text-status-danger bg-status-danger/10 border border-status-danger/30 rounded-lg">
              {error}
            </div>
          )}
          <div>
            <label className="text-xs text-[rgb(var(--v2-muted))] mb-1 block">
              Ad Soyad <span className="text-status-danger">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())}
              placeholder="örn. Ahmet Yılmaz"
              className="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-surface-100 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[rgb(var(--v2-muted))] mb-1 block">Pozisyon (opsiyonel)</label>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())}
              placeholder="örn. Kasiyer"
              className="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-surface-100 text-sm"
            />
          </div>
        </div>
        <div className="p-4 border-t border-[rgb(var(--v2-border))] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-surface-700 text-surface-300 hover:bg-surface-600 disabled:opacity-60"
          >
            İptal
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="v2-btn v2-btn--accent px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Ekleniyor…" : "Ekle ve Seç"}
          </button>
        </div>
      </div>
    </div>
  );
}

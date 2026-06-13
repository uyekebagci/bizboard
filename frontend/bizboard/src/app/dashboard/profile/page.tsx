"use client";

import { useRouter } from "next/navigation";
import {
  User, Shield, Mail, Phone, Lock, LogOut, ChevronRight,
  Building2, Loader2, Globe, Coins,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { logout } from "@/lib/api/client";
import { useState } from "react";
import { getInitials } from "@/lib/utils";
import { BETA_LABEL } from "@/lib/version";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";

/**
 * Mobile bottom-nav "Profil" sayfası — kullanıcı bilgileri + parola değişikliği
 * + çıkış. Desktop'tan da erişilebilir (responsive).
 *
 * Çift tema (dark default + light) — Daxa v2 token'ları.
 */
export default function ProfilePage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setProfile(null);
      router.replace("/auth/login");
    }
  }

  if (!profile) {
    return (
      <div className="v2-card p-8 text-center">
        <Loader2 size={20} className="animate-spin mx-auto text-[rgb(var(--v2-muted))]" />
      </div>
    );
  }

  const isAdmin = profile.role === "admin";

  return (
    <div className="space-y-5">
      {/* Header card */}
      <section className="v2-card p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center text-white font-bold text-xl">
            {getInitials(profile.full_name)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-[rgb(var(--v2-ink))] truncate">
              {profile.full_name}
            </h1>
            <p className="text-xs text-[rgb(var(--v2-muted))] truncate">
              @{profile.username}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {isAdmin ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-[10px] font-medium">
                  <Shield size={10} />
                  Admin
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] text-[10px] font-medium">
                  Görüntüleyen
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Contact / preferences */}
      <section className="v2-card divide-y divide-[rgb(var(--v2-border))]">
        <InfoRow icon={Mail} label="E-posta" value={profile.email ?? "—"} />
        <InfoRow icon={Phone} label="Telefon" value={profile.phone ?? "—"} />
        <InfoRow
          icon={Coins}
          label="Tercih edilen para birimi"
          value={profile.preferred_currency}
        />
        <InfoRow icon={Globe} label="Dil" value={profile.preferred_language} />
      </section>

      {/* WP f1fa3cd5: Bildirim Ayarları — Telegram bağlama + per-event tercih matrisi. */}
      <NotificationPreferences />

      {/* Actions */}
      <section className="v2-card divide-y divide-[rgb(var(--v2-border))] overflow-hidden">
        <ActionRow
          icon={Lock}
          label="Parola Değiştir"
          onClick={() => router.push("/dashboard/change-password")}
        />
        {isAdmin && (
          <ActionRow
            icon={Shield}
            label="Admin Paneli"
            onClick={() => router.push("/admin")}
          />
        )}
        <ActionRow
          icon={Building2}
          label="İşletmelerim"
          onClick={() => router.push("/dashboard/businesses")}
        />
      </section>

      {/* Logout */}
      <section>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full v2-card p-4 flex items-center justify-center gap-2 text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
        >
          {loggingOut ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <LogOut size={16} />
          )}
          <span className="text-sm font-medium">
            {loggingOut ? "Çıkış yapılıyor..." : "Çıkış Yap"}
          </span>
        </button>
      </section>

      {/* v1.7.x BETA: sabit etiket; beta sonrası formatVersion'a geri dönülecek. */}
      <p className="text-center text-[10px] text-[rgb(var(--v2-muted))]">
        ÇATI <span className="italic text-yellow-600 dark:text-yellow-400 font-mono">{BETA_LABEL}</span>
      </p>
    </div>
  );
}

function InfoRow({
  icon: Icon, label, value,
}: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon size={16} className="text-[rgb(var(--v2-muted))] shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-[rgb(var(--v2-muted))] uppercase tracking-wide">{label}</p>
        <p className="text-sm text-[rgb(var(--v2-ink))] truncate">{value}</p>
      </div>
    </div>
  );
}

function ActionRow({
  icon: Icon, label, onClick,
}: { icon: typeof User; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="row-hover w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left"
    >
      <Icon size={16} className="text-[rgb(var(--v2-muted))] shrink-0" />
      <span className="flex-1 text-sm text-[rgb(var(--v2-ink))]">{label}</span>
      <ChevronRight size={16} className="text-[rgb(var(--v2-muted))]" />
    </button>
  );
}

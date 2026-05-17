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

/**
 * Mobile bottom-nav "Profil" sayfasi — kullanici bilgileri + parola degisikligi
 * + cikis. Desktop'tan da erisilebilir (responsive).
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
      <div className="card p-8 text-center">
        <Loader2 size={20} className="animate-spin mx-auto text-surface-400" />
      </div>
    );
  }

  const isAdmin = profile.role === "admin";

  return (
    <div className="space-y-5">
      {/* Header card */}
      <section className="card p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center text-white font-bold text-xl">
            {getInitials(profile.full_name)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-white truncate">
              {profile.full_name}
            </h1>
            <p className="text-xs text-surface-400 truncate">
              @{profile.username}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {isAdmin ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-500/20 text-yellow-400 text-[10px] font-medium">
                  <Shield size={10} />
                  Admin
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-700 text-surface-300 text-[10px] font-medium">
                  Goruntuleyen
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Contact / preferences */}
      <section className="card divide-y divide-surface-700">
        <InfoRow icon={Mail} label="E-posta" value={profile.email ?? "—"} />
        <InfoRow icon={Phone} label="Telefon" value={profile.phone ?? "—"} />
        <InfoRow
          icon={Coins}
          label="Tercih edilen para birimi"
          value={profile.preferred_currency}
        />
        <InfoRow icon={Globe} label="Dil" value={profile.preferred_language} />
      </section>

      {/* Actions */}
      <section className="card divide-y divide-surface-700 overflow-hidden">
        <ActionRow
          icon={Lock}
          label="Parola Degistir"
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
          label="Isletmelerim"
          onClick={() => router.push("/dashboard/businesses")}
        />
      </section>

      {/* Logout */}
      <section>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full card p-4 flex items-center justify-center gap-2 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
        >
          {loggingOut ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <LogOut size={16} />
          )}
          <span className="text-sm font-medium">
            {loggingOut ? "Cikis yapiliyor..." : "Cikis Yap"}
          </span>
        </button>
      </section>

      <p className="text-center text-[10px] text-surface-500">
        BizBoard v{process.env.NEXT_PUBLIC_APP_VERSION ?? "?"}
      </p>
    </div>
  );
}

function InfoRow({
  icon: Icon, label, value,
}: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon size={16} className="text-surface-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-surface-500 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-white truncate">{value}</p>
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
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-700/40 transition-colors text-left"
    >
      <Icon size={16} className="text-surface-400 shrink-0" />
      <span className="flex-1 text-sm text-white">{label}</span>
      <ChevronRight size={16} className="text-surface-500" />
    </button>
  );
}

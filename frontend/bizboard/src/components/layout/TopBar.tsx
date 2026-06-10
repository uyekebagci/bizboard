"use client";

import { useState, useRef, useEffect } from "react";
import { LogOut, Shield, Menu, Sun, Moon, UserCircle, KeyRound } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { getInitials } from "@/lib/utils";
import { logout } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NotificationDropdown } from "@/components/layout/NotificationDropdown";
import { useTheme } from "@/components/layout/ThemeProvider";
import { GlobalSearchBox } from "@/components/search/GlobalSearchBox";

interface TopBarProps {
  /** v1.6.13: mobile/tablet hamburger handler — sidebar açar/kapatır. */
  onMenuClick?: () => void;
}

/**
 * v1.6.17+: TopBar artık logo + marka adı taşımıyor — tek logo ve marka adı
 * sidebar header'ında. Burada yalnız (mobile-only) hamburger, search, notif
 * ve profile menüsü kalır. Version badge'i sidebar'a taşındı (admin-only filter
 * de kaldırıldı; herkes görebilir).
 */
export function TopBar({ onMenuClick }: TopBarProps = {}) {
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setProfile(null);
      router.replace("/auth/login");
    }
  }

  return (
    /* Redesign PR-1: glass topbar — yarı saydam + blur, surface-token tabanlı. */
    <header className="sticky top-0 z-40 bg-surface-900/70 backdrop-blur-xl border-b border-surface-700/60">
      <div className="flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
        {/* Sol: mobile hamburger + global arama kutusu (spec v2.2 §10.1). */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {onMenuClick && (
            <button
              type="button"
              onClick={onMenuClick}
              className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-surface-700 transition-colors shrink-0"
              aria-label="Menuyu ac"
            >
              <Menu size={20} className="text-surface-300" />
            </button>
          )}
          {/* v2.2 Advanced Search — global arama + autocomplete. */}
          <GlobalSearchBox />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Çift tema FAZ 1: tema geçişi (güneş/ay). localStorage persist, default dark. */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
            title={theme === "dark" ? "Açık tema" : "Koyu tema"}
            className="glass-card glass-hover !rounded-xl p-2.5"
          >
            {theme === "dark" ? (
              <Sun size={20} className="text-surface-300" />
            ) : (
              <Moon size={20} className="text-surface-300" />
            )}
          </button>

          <NotificationDropdown />

          <div className="relative ml-1" ref={menuRef}>
            {/* Redesign PR-1: gradient profil chip. */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-9 h-9 rounded-full text-white font-semibold text-sm flex items-center justify-center hover:opacity-90 transition-opacity ring-1 ring-surface-600/40"
              style={{ background: "linear-gradient(135deg,#4263eb,#6741d9)" }}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {profile ? getInitials(profile.full_name) : "?"}
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="popover-surface absolute right-0 mt-2 w-52 !rounded-xl py-2 animate-fade-in z-50"
              >
                <div className="px-4 py-2.5 border-b border-surface-700/60">
                  <p className="font-semibold text-surface-100 text-sm truncate">
                    {profile?.full_name || "Kullanici"}
                  </p>
                  {profile?.username && (
                    <p className="text-[11px] text-surface-400 truncate">
                      @{profile.username}
                    </p>
                  )}
                </div>

                {/* Profil + Şifre Değiştir Sidebar'dan buraya taşındı. */}
                <Link
                  href="/dashboard/profile"
                  onClick={() => setMenuOpen(false)}
                  className="row-hover w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-surface-300 transition-colors"
                >
                  <UserCircle size={16} />
                  <span>Profil</span>
                </Link>

                <Link
                  href="/dashboard/change-password"
                  onClick={() => setMenuOpen(false)}
                  className="row-hover w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-surface-300 transition-colors"
                >
                  <KeyRound size={16} />
                  <span>Sifre Degistir</span>
                </Link>

                {profile?.role === "admin" && (
                  <Link
                    href="/admin"
                    onClick={() => setMenuOpen(false)}
                    className="row-hover w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-surface-300 transition-colors"
                  >
                    <Shield size={16} />
                    <span>Admin Paneli</span>
                  </Link>
                )}

                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-50"
                >
                  <LogOut size={16} />
                  <span>{loggingOut ? "Cikis yapiliyor..." : "Cikis Yap"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

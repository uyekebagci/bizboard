"use client";

import { useState, useRef, useEffect } from "react";
import { Search, LogOut, Shield, Menu, Sun, Moon } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { getInitials } from "@/lib/utils";
import { logout } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NotificationDropdown } from "@/components/layout/NotificationDropdown";
import { useTheme } from "@/components/layout/ThemeProvider";

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
    <header className="sticky top-0 z-40 bg-surface-800/95 backdrop-blur-lg border-b border-surface-700">
      <div className="flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
        {/* Sol: yalnız mobile hamburger; desktop'ta sidebar zaten sabit görünür. */}
        <div className="flex items-center">
          {onMenuClick && (
            <button
              type="button"
              onClick={onMenuClick}
              className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-surface-700 transition-colors"
              aria-label="Menuyu ac"
            >
              <Menu size={20} className="text-surface-300" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Ara"
            className="p-2.5 rounded-xl hover:bg-surface-700 transition-colors"
          >
            <Search size={20} className="text-surface-300" />
          </button>

          {/* Çift tema FAZ 1: tema geçişi (güneş/ay). localStorage persist, default dark. */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
            title={theme === "dark" ? "Açık tema" : "Koyu tema"}
            className="p-2.5 rounded-xl hover:bg-surface-700 transition-colors"
          >
            {theme === "dark" ? (
              <Sun size={20} className="text-surface-300" />
            ) : (
              <Moon size={20} className="text-surface-300" />
            )}
          </button>

          <NotificationDropdown />

          <div className="relative ml-1" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 font-semibold text-sm flex items-center justify-center hover:bg-brand-200 transition-colors"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {profile ? getInitials(profile.full_name) : "?"}
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-52 bg-surface-800 rounded-xl shadow-card-hover border border-surface-700 py-2 animate-fade-in z-50"
              >
                <div className="px-4 py-2.5 border-b border-surface-700">
                  <p className="font-semibold text-white text-sm truncate">
                    {profile?.full_name || "Kullanici"}
                  </p>
                  {profile?.username && (
                    <p className="text-[11px] text-surface-400 truncate">
                      @{profile.username}
                    </p>
                  )}
                </div>

                <Link
                  href="/dashboard/change-password"
                  onClick={() => setMenuOpen(false)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-surface-300 hover:bg-surface-700 transition-colors"
                >
                  <Shield size={16} />
                  <span>Sifre Degistir</span>
                </Link>

                {profile?.role === "admin" && (
                  <Link
                    href="/admin"
                    onClick={() => setMenuOpen(false)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-surface-300 hover:bg-surface-700 transition-colors"
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

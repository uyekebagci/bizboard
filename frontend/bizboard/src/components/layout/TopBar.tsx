"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Search, LogOut, Shield } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { getInitials } from "@/lib/utils";
import { clearToken } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function TopBar() {
  const { profile, unreadCount } = useAppStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close menu on outside click
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

  function handleLogout() {
    clearToken();
    useAppStore.getState().setProfile(null);
    router.push("/auth/login");
  }

  return (
    <header className="sticky top-0 z-40 bg-surface-800/95 backdrop-blur-lg border-b border-surface-700">
      <div className="flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
        {/* Logo / Brand */}
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">BB</span>
          </div>
          <span className="font-bold text-lg text-white hidden sm:block">
            BizBoard
          </span>
        </Link>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <button className="p-2.5 rounded-xl hover:bg-surface-700 transition-colors">
            <Search size={20} className="text-surface-300" />
          </button>

          {/* Notifications */}
          <button className="p-2.5 rounded-xl hover:bg-surface-700 transition-colors relative">
            <Bell size={20} className="text-surface-300" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-status-danger text-white text-xs font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Avatar + Dropdown */}
          <div className="relative ml-1" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 font-semibold text-sm flex items-center justify-center hover:bg-brand-200 transition-colors"
            >
              {profile ? getInitials(profile.full_name) : "?"}
            </button>

            {/* Dropdown Menu */}
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-surface-800 rounded-xl shadow-card-hover border border-surface-700 py-2 animate-fade-in z-50">
                {/* User Info */}
                <div className="px-4 py-2.5 border-b border-surface-700">
                  <p className="font-semibold text-white text-sm truncate">
                    {profile?.full_name || "Kullanici"}
                  </p>
                </div>

                {/* Admin Panel — only for admin role */}
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

                {/* Logout */}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-red-900/30 transition-colors"
                >
                  <LogOut size={16} />
                  <span>Cikis Yap</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

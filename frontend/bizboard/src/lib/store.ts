import { create } from "zustand";
import type {
  Business,
  BusinessCard,
  Notification,
  PortfolioSummary,
  Profile,
} from "@/types";

interface AppState {
  // User
  profile: Profile | null;
  setProfile: (profile: Profile | null) => void;

  // Businesses
  businesses: Business[];
  setBusinesses: (businesses: Business[]) => void;
  activeBusiness: Business | null;
  setActiveBusiness: (business: Business | null) => void;

  // Dashboard
  portfolio: PortfolioSummary | null;
  setPortfolio: (portfolio: PortfolioSummary | null) => void;
  businessCards: BusinessCard[];
  setBusinessCards: (cards: BusinessCard[]) => void;

  // Notifications
  notifications: Notification[];
  setNotifications: (notifications: Notification[]) => void;
  unreadCount: number;

  // UI State
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  // Data refresh
  refreshKey: number;
  triggerRefresh: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // User
  profile: null,
  setProfile: (profile) => set({ profile }),

  // Businesses
  businesses: [],
  setBusinesses: (businesses) => set({ businesses }),
  activeBusiness: null,
  setActiveBusiness: (business) => set({ activeBusiness: business }),

  // Dashboard
  portfolio: null,
  setPortfolio: (portfolio) => set({ portfolio }),
  businessCards: [],
  setBusinessCards: (cards) => set({ businessCards: cards }),

  // Notifications
  notifications: [],
  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.is_read).length,
    }),
  unreadCount: 0,

  // UI State
  isLoading: true,
  setIsLoading: (isLoading) => set({ isLoading }),
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  // Data refresh
  refreshKey: 0,
  triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
}));

import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <div className="min-h-[100dvh] flex flex-col bg-surface-900">
        <TopBar />
        {/* v1.6.9: route-level Error Boundary — render-time crash kullanıcıya
            clean fallback gösterir + logger.error ile rapor eder. */}
        <ErrorBoundary level="route">
          <main className="flex-1 px-4 pt-4 pb-24 max-w-7xl mx-auto w-full">
            {children}
          </main>
        </ErrorBoundary>
        <BottomNav />
      </div>
    </AppShell>
  );
}

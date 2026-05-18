import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";

export default function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <div className="min-h-[100dvh] flex flex-col bg-surface-900 overflow-x-hidden">
        <TopBar />
        {/* v1.6.9: business detay sayfası boundary ile sarılı. */}
        <ErrorBoundary level="route-business">
          <main className="flex-1 px-4 pt-4 pb-24 max-w-7xl mx-auto w-full overflow-x-hidden">
            {children}
          </main>
        </ErrorBoundary>
        <BottomNav />
      </div>
    </AppShell>
  );
}

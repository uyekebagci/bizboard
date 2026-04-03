import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";
import { AppShell } from "@/components/layout/AppShell";

export default function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <div className="min-h-[100dvh] flex flex-col bg-surface-900 overflow-x-hidden">
        <TopBar />
        <main className="flex-1 px-4 pt-4 pb-24 max-w-7xl mx-auto w-full overflow-x-hidden">
          {children}
        </main>
        <BottomNav />
      </div>
    </AppShell>
  );
}

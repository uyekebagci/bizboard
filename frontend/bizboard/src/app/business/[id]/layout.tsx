import { AppShell } from "@/components/layout/AppShell";
import { DashboardShell } from "@/components/layout/DashboardShell";

/**
 * v1.6.13: business detay sayfası da dashboard ile aynı sidebar+topbar shell'ini
 * kullanır — kısayollardan herhangi birine direkt geçiş için.
 */
export default function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <DashboardShell>
        <div className="overflow-x-hidden">{children}</div>
      </DashboardShell>
    </AppShell>
  );
}

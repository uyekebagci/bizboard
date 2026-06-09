import { AppShell } from "@/components/layout/AppShell";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";

/**
 * W1: Admin artık DashboardShell kullanır (Sidebar + TopBar + mobil drawer +
 * bottom-nav) → admin sayfaları mobilde gezilebilir. Önceki AppShell-only
 * yapıda nav yoktu. Admin route'ları/erişim korunur (Sidebar adminOnly link'ler
 * + sayfa-içi guard'lar değişmedi).
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <DashboardShell>
        {/* v1.6.9: admin sayfaları da route-level boundary ile sarılı. */}
        <ErrorBoundary level="route-admin">{children}</ErrorBoundary>
      </DashboardShell>
    </AppShell>
  );
}

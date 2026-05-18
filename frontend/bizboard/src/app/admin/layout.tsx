import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <div className="min-h-[100dvh] bg-[#111] text-white">
        {/* v1.6.9: admin sayfaları da route-level boundary ile sarılı. */}
        <ErrorBoundary level="route-admin">{children}</ErrorBoundary>
      </div>
    </AppShell>
  );
}

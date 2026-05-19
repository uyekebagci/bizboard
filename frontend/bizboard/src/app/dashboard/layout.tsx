import { AppShell } from "@/components/layout/AppShell";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <DashboardShell>{children}</DashboardShell>
    </AppShell>
  );
}

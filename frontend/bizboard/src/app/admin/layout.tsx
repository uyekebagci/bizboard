import { AppShell } from "@/components/layout/AppShell";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <div className="min-h-[100dvh] bg-[#111] text-white">{children}</div>
    </AppShell>
  );
}

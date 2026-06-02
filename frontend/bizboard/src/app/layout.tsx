import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@/styles/globals.css";
import { ClientProviders } from "@/components/layout/ClientProviders";
import { EnvironmentBanner } from "@/components/layout/EnvironmentBanner";
import { PwaUpdatePrompt } from "@/components/layout/PwaUpdatePrompt";
import { Toaster } from "react-hot-toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

// v1.6.8: marka adı ÇATI (eskiden BizBoard).
export const metadata: Metadata = {
  title: "CATI - Tum Isletmeleriniz, Tek Ekran",
  description:
    "Birden fazla isletmenizi tek bir panelden yonetin. Finanslari takip edin, performansi izleyin, kontrolu elinizde tutun.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CATI",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#4c6ef5",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="tr"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      style={{ backgroundColor: "#212529", colorScheme: "dark" }}
    >
      <head>
        <style>{`html,body{background-color:#212529!important;color-scheme:dark}`}</style>
      </head>
      <body className="font-sans" style={{ backgroundColor: "#212529" }}>
        <ClientProviders>
          <EnvironmentBanner />
          {children}
          <PwaUpdatePrompt />
          {/* WP 4f6baaa3: global toast — sağ üst, dark theme, aria-live="polite" yerleşik */}
          <Toaster
            position="top-right"
            gutter={8}
            containerStyle={{ top: 16, right: 16 }}
            toastOptions={{
              duration: 4000,
              style: {
                background: "#1e293b",
                color: "#e2e8f0",
                fontSize: "13px",
                borderRadius: "10px",
              },
            }}
          />
        </ClientProviders>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@/styles/globals.css";
import { ClientProviders } from "@/components/layout/ClientProviders";
import { EnvironmentBanner } from "@/components/layout/EnvironmentBanner";
import { PwaUpdatePrompt } from "@/components/layout/PwaUpdatePrompt";

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

export const metadata: Metadata = {
  title: "BizBoard - Tum Isletmeleriniz, Tek Ekran",
  description:
    "Birden fazla isletmenizi tek bir panelden yonetin. Finanslari takip edin, performansi izleyin, kontrolu elinizde tutun.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BizBoard",
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
        </ClientProviders>
      </body>
    </html>
  );
}

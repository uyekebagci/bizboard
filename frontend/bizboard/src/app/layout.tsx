import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@/styles/globals.css";
import { ClientProviders } from "@/components/layout/ClientProviders";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { EnvironmentBanner } from "@/components/layout/EnvironmentBanner";
import { PwaUpdatePrompt } from "@/components/layout/PwaUpdatePrompt";
import { Toaster } from "react-hot-toast";

// Çift tema FAZ 1: FOUC önleyici — ilk boyama ÖNCESİ <html> class'ını
// localStorage'tan ayarla. Kayıt yoksa default "dark" (DGR mevcut görünüm).
const THEME_INIT_SCRIPT = `
(function(){try{var t=localStorage.getItem('cati-theme');if(t!=='light'&&t!=='dark')t='dark';var e=document.documentElement;if(t==='dark')e.classList.add('dark');else e.classList.remove('dark');e.style.colorScheme=t;}catch(e){document.documentElement.classList.add('dark');}})();
`;

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
      // Çift tema FAZ 1: default "dark" class — FOUC script ilk boyamadan önce
      // localStorage'a göre günceller. suppressHydrationWarning: class'ı script
      // değiştirebileceği için hydration uyarısını bastır.
      className={`dark ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* FOUC önleyici — render'dan önce çalışır. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans">
        <ThemeProvider>
          <ClientProviders>
            <EnvironmentBanner />
            {children}
            <PwaUpdatePrompt />
            {/* WP 4f6baaa3: global toast — sağ üst, aria-live="polite" yerleşik */}
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
        </ThemeProvider>
      </body>
    </html>
  );
}

/** @type {import('next').NextConfig} */
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  // Otomatik skipWaiting kapali — yeni SW yuklendiginde kullaniciya prompt
  // gosterip onun onayiyla aktive ediyoruz (PwaUpdatePrompt component).
  skipWaiting: false,
  disable: process.env.NODE_ENV === "development",
});

// Backend URL (CSP connect-src icin gereklidir).
// Build-time'da NEXT_PUBLIC_API_URL set edilmediyse default localhost (dev).
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// CSP: dev'de Next.js HMR icin daha gevsek, prod'da sertlestirilmis.
const isDev = process.env.NODE_ENV !== "production";
const cspDirectives = [
  "default-src 'self'",
  // 'unsafe-inline' ve 'unsafe-eval' Next.js'in inline script'leri icin gerekli.
  // 'nonce-' based CSP daha guvenli, ileride App Router ile uyumlu hale getirildiginde
  // ozel header'i kaldirip Next default'a birakilabilir.
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiUrl} ${isDev ? "ws:" : ""}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  // HSTS — sadece HTTPS'de etkili; HTTP'de tarayici ignore eder.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), camera=(), microphone=(), payment=(), usb=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Content-Security-Policy", value: cspDirectives },
];

const nextConfig = {
  reactStrictMode: false,
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  async headers() {
    return [
      {
        // Tum response'lara uygula. PWA service worker / manifest icin
        // Next.js zaten dogru Content-Type set ediyor; CSP image-src'imiz
        // data: ve blob: izin verdiginden ikon kaynaklari sorunsuz.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = withPWA(nextConfig);

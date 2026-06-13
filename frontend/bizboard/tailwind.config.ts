import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  // Çift tema FAZ 1: class-based dark mode. <html class="dark"> → dark palet,
  // class yoksa → light palet (globals.css :root / .dark CSS değişkenleri).
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4ff",
          100: "#dbe4ff",
          200: "#bac8ff",
          300: "#91a7ff",
          400: "#748ffc",
          500: "#5c7cfa",
          600: "#4c6ef5",
          700: "#4263eb",
          800: "#3b5bdb",
          900: "#364fc7",
          950: "#1e3a8a",
        },
        // Çift tema FAZ 1: surface paleti CSS değişkenine bağlandı. Triplet'ler
        // globals.css :root (light) / .dark (dark = mevcut değerlerle BİREBİR).
        // <alpha-value> korunur → opacity'li sınıflar (surface-700/50 vb.) çalışır.
        surface: {
          0: "rgb(var(--surface-0) / <alpha-value>)",
          50: "rgb(var(--surface-50) / <alpha-value>)",
          100: "rgb(var(--surface-100) / <alpha-value>)",
          200: "rgb(var(--surface-200) / <alpha-value>)",
          300: "rgb(var(--surface-300) / <alpha-value>)",
          400: "rgb(var(--surface-400) / <alpha-value>)",
          500: "rgb(var(--surface-500) / <alpha-value>)",
          600: "rgb(var(--surface-600) / <alpha-value>)",
          700: "rgb(var(--surface-700) / <alpha-value>)",
          800: "rgb(var(--surface-800) / <alpha-value>)",
          900: "rgb(var(--surface-900) / <alpha-value>)",
        },
        status: {
          success: "#40c057",
          warning: "#fab005",
          danger: "#fa5252",
          info: "#339af0",
        },
        // UI v2 (Daxa / Overview Panel): lime-yeşil accent — token-bazlı, CSS
        // değişkenine bağlı → kullanıcı tonu tek yerden (globals.css) değiştirir.
        // <alpha-value> korunur (accent/20 vb. tint'ler çalışır).
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          bright: "rgb(var(--accent-bright) / <alpha-value>)",
          strong: "rgb(var(--accent-strong) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
          ink: "rgb(var(--accent-ink) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        // UI v2: büyük yuvarlak kart radius'u (~20px Daxa estetiği).
        card: "var(--radius-card)",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)",
        "card-hover":
          "0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px rgba(0,0,0,0.04)",
        // Mockup-fidelity (styles.css/tw.config): ring + güçlü brand drop-shadow.
        glow: "0 0 0 1px rgba(92,124,250,.25), 0 18px 40px -12px rgba(76,110,245,.45)",
        // UI v2: çok-katmanlı yumuşak gölge (blur YOK; derinlik = gölge + border).
        v2: "var(--shadow-card)",
        "v2-hover": "var(--shadow-card-hover)",
        // UI v2: accent (lime) glow — aktif/highlight öğeler.
        "accent-glow":
          "0 0 0 1px rgb(var(--accent) / .35), 0 14px 30px -12px rgb(var(--accent) / .45)",
      },
      animation: {
        "fade-in": "fadeIn 0.15s ease-out",
        "slide-up": "slideUp 0.2s ease-out",
        "slide-in-right": "slideInRight 0.15s ease-out",
        // UI v2 motion sistemi.
        "v2-rise": "v2Rise 0.5s cubic-bezier(0.2,0.7,0.2,1) both",
        "v2-fade-up": "v2FadeUp 0.3s cubic-bezier(0.2,0.7,0.2,1) both",
        "v2-grow": "v2Grow 0.7s cubic-bezier(0.2,0.7,0.2,1) both",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(10px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        v2Rise: {
          "0%": { opacity: "0", transform: "translateY(16px) scale(0.985)" },
          "100%": { opacity: "1", transform: "none" },
        },
        v2FadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "none" },
        },
        v2Grow: {
          "0%": { transform: "scaleY(0)" },
          "100%": { transform: "scaleY(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

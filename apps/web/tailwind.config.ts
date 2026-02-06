import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        "ink-muted": "#6b7280",
        surface: "#ffffff",
        "surface-muted": "#f8fafc",
        accent: "#4f46e5",
        "accent-soft": "#eef2ff"
      },
      boxShadow: {
        soft: "0 18px 40px rgba(15, 23, 42, 0.12)",
        card: "0 10px 30px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

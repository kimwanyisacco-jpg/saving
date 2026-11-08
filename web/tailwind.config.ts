import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#eef6f3", 100: "#d3e9e2", 200: "#a7d3c6", 300: "#71b5a3", 400: "#3f9280", 500: "#1f7767", 600: "#125e51", 700: "#0f4a41", 800: "#0e3c35", 900: "#0b302b" },
        gold: { 50: "#fdf8ec", 100: "#f9edcd", 200: "#f2d998", 300: "#e9bf5f", 400: "#dfa634", 500: "#c98a1d", 600: "#a86a15", 700: "#854f14", 800: "#6d4017", 900: "#5c3616" },
        sand: { 50: "#faf9f6", 100: "#f3f1ea", 200: "#e7e3d7", 300: "#d5cebb" },
        ink: { DEFAULT: "#16211f", soft: "#485754", mute: "#75837f" },
        money: { in: "#1f7767", out: "#b4451f", credit: "#9a3412", save: "#125e51" },
      },
      fontFamily: { sans: ["var(--font-body)", "system-ui", "sans-serif"], display: ["var(--font-display)", "var(--font-body)", "sans-serif"] },
      borderRadius: { xl: "0.9rem", "2xl": "1.25rem" },
      boxShadow: { card: "0 1px 2px rgba(15,74,65,.06), 0 6px 20px -10px rgba(15,74,65,.18)" },
    },
  },
  plugins: [],
} satisfies Config;

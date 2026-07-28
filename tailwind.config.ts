import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class", // Enables manual or system dark mode switching
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        "on-background": "var(--on-background)",
        surface: "var(--surface)",
        "on-surface": "var(--on-surface)",
        "surface-variant": "var(--surface-variant)",
        "on-surface-variant": "var(--on-surface-variant)",
        "surface-container": "var(--surface-container)",
        "surface-container-high": "var(--surface-container-high)",
        "surface-container-highest": "var(--surface-container-highest)",
        primary: "var(--primary)",
        "on-primary": "var(--on-primary)",
        "primary-container": "var(--primary-container)",
        secondary: "var(--secondary)",
        "secondary-container": "var(--secondary-container)",
        "tertiary-container": "var(--tertiary-container)",
        "surface-tint": "var(--surface-tint)",
        
        // Custom Status Colors Mapping
        status: {
          success: "var(--status-success)",
          "success-bg": "var(--status-success-bg)",
          warning: "var(--status-warning)",
          "warning-bg": "var(--status-warning-bg)",
          error: "var(--status-error)",
          "error-bg": "var(--status-error-bg)",
          info: "var(--status-info)",
          "info-bg": "var(--status-info-bg)",
        },
      },
      fontFamily: {
        headline: ["var(--font-headline)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        caps: ["var(--font-caps)", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
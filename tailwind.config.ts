import type { Config } from "tailwindcss";

const config: Config = {
  // 🌓 CRITICAL: Enables class-driven light/dark toggle switching
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 🎨 Premium Semantic Tokens mapped directly to our CSS variables
        surface: "var(--bg-app)",
        "surface-variant": "var(--bg-card)",
        
        primary: "var(--accent)",
        secondary: "#10b981", /* Crisp, minimal emerald green for accents */
        
        "on-surface-variant": "var(--text-muted)",
        "on-primary": "#ffffff",
        "on-secondary": "#ffffff",
      },
      scale: {
        "103": "1.03",
      },
    },
  },
  plugins: [],
};

export default config;
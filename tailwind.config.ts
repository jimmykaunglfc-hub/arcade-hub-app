// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "background": "#061426",
        "surface": "#061426",
        "surface-container": "#132033",
        "surface-container-high": "#1d2a3e",
        "surface-container-low": "#0e1c2f",
        "surface-container-lowest": "#020e21",
        "surface-tint": "#abd600",
        "primary-container": "#c3f400",
        "tertiary-container": "#7df4ff",
        "on-background": "#d6e3fe",
        "on-surface": "#d6e3fe",
        "on-surface-variant": "#c4c9ac",
        "secondary": "#ffc07a",
      },
      fontFamily: {
        headline: ["Plus Jakarta Sans", "sans-serif"],
        body: ["Inter", "sans-serif"],
        caps: ["JetBrains Mono", "monospace"],
      },
      spacing: {
        "element-gap": "12px",
        "section-margin": "32px",
        "container-padding": "20px",
        "safe-area-top": "44px",
      }
    },
  },
  plugins: [],
};
export default config;
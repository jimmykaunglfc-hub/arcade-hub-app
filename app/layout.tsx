import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Joe Yoke | Social Gaming Hub",
  description: "Play HTML5 games and chat with friends.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Google Fonts for UI and Icons */}
        <link 
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" 
          rel="stylesheet" 
        />
        <link 
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&family=JetBrains+Mono:wght@600&display=swap" 
          rel="stylesheet" 
        />
        
        {/* THE SILVER BULLET: Bypass Node Modules and use the CDN Compiler */}
        <script src="https://cdn.tailwindcss.com"></script>
        <script dangerouslySetInnerHTML={{
          __html: `
            tailwind.config = {
              darkMode: 'class',
              theme: {
                extend: {
                  colors: {
                    background: "#061426",
                    surface: "#061426",
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
                    secondary: "#ffc07a",
                    primary: "#ffffff",
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
                }
              }
            }
          `
        }} />
      </head>
      <body className={`${inter.className} bg-background text-on-background min-h-screen font-body overflow-x-hidden`}>
        {children}
      </body>
    </html>
  );
}
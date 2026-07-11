import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ARCADE | Social Gaming Hub",
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
        <link 
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" 
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
                    surface: "#0b1326",
                    "surface-variant": "#2d3449",
                    "on-surface-variant": "#c7c4d7",
                    primary: "#c0c1ff",
                    "on-primary": "#1000a9",
                    secondary: "#4ae176",
                    "on-secondary": "#003915"
                  }
                }
              }
            }
          `
        }} />
      </head>
      <body className={`${inter.className} bg-black min-h-screen pb-24`}>
        {children}
      </body>
    </html>
  );
}
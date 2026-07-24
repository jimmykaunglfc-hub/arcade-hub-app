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
      </head>
      
      {/* The body will now properly listen to your global CSS variables */}
      <body className={`${inter.className} bg-background text-on-background min-h-screen font-body overflow-x-hidden transition-colors duration-300`}>
        {children}
      </body>
    </html>
  );
}
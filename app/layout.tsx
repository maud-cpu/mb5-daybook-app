import type { Metadata } from "next";
import { Lexend } from "next/font/google";
import "./globals.css";

// Lexend is a research-backed typeface shown to improve reading fluency --
// a small, free change that helps every user, not just the ones who'd
// think to ask for it. Loaded via next/font so it's self-hosted at build
// time, not a runtime fetch to fonts.google.com.
const lexend = Lexend({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-lexend" });

export const metadata: Metadata = {
  title: "MB5 Day Book",
  description: "Private fostering diary for MB5 carers",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full ${lexend.variable}`}>
      <body className="min-h-full flex flex-col" style={{ paddingBottom: 78 }}>
        {children}
      </body>
    </html>
  );
}

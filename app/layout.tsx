import type { Metadata, Viewport } from "next";
import { Lexend } from "next/font/google";
import "./globals.css";

// Lexend is a research-backed typeface shown to improve reading fluency --
// a small, free change that helps every user, not just the ones who'd
// think to ask for it. Loaded via next/font so it's self-hosted at build
// time, not a runtime fetch to fonts.google.com.
const lexend = Lexend({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-lexend" });

export const metadata: Metadata = {
  title: "Foster Carer Log",
  description: "Private fostering diary and record log",
};

// Without this, a phone browser has no idea the page is meant to fit its
// actual screen -- it falls back to assuming a ~980px desktop layout and
// shrinks that to fit, which is what made everything render tiny with a
// horizontal scrollbar even though every media query here already handles
// a real narrow viewport correctly.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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

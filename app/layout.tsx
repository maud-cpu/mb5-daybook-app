import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MB5 Day Book",
  description: "Private fostering diary for MB5 carers",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col" style={{ paddingBottom: 78 }}>
        {children}
      </body>
    </html>
  );
}

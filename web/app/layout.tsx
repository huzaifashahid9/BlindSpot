import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BlindSpot: the fire record that survives a satellite going dark",
  description:
    "Harmonized MODIS + VIIRS fire record for Pakistan, a burning-activity calendar with unusual days, and what the record lost when Suomi NPP stopped on 2 Nov 2026.",
};

export const viewport: Viewport = { themeColor: "#020617" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-950 font-sans text-slate-200">{children}</body>
    </html>
  );
}

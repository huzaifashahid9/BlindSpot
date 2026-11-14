import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--nf-sans" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--nf-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--nf-mono" });

export const metadata: Metadata = {
  title: "BlindSpot: the fire record that survives a satellite going dark",
  description:
    "Harmonized MODIS + VIIRS burning-activity calendar for every district of Pakistan, with unusual days, fire history, custom areas, CSV export, and what the record lost when Suomi NPP stopped on 2 Nov 2026.",
};

export const viewport: Viewport = { themeColor: "#05070d" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="min-h-full font-sans text-slate-200">{children}</body>
    </html>
  );
}

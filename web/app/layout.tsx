import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--nf-sans" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--nf-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--nf-mono" });

const SITE = "https://blindspot-web-nine.vercel.app";
const DESC = "One fair fire record from five NASA satellites for every district of Pakistan, and what we lose now that Suomi NPP has gone dark.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  applicationName: "BlindSpot",
  title: "BlindSpot: the fire record that survives a satellite going dark",
  openGraph: { type: "website", siteName: "BlindSpot", title: "BlindSpot: Pakistan's fire record, and its new blind spot", description: DESC, url: SITE },
  twitter: { card: "summary_large_image", title: "BlindSpot: Pakistan's fire record, and its new blind spot", description: DESC },
  appleWebApp: { title: "BlindSpot", statusBarStyle: "black-translucent" },
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

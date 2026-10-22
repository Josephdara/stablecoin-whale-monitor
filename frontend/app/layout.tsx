import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { AnnouncerProvider } from "../components/Announcer";
import { SiteHeader } from "../components/SiteHeader";
import { THEME_INIT_SCRIPT } from "../components/ThemeToggle";
import { MaintenanceBanner } from "../components/ui";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Stablecoin Whale Monitor", template: "%s · Stablecoin Whale Monitor" },
  description:
    "Large USDC and USDT transfers on Ethereum mainnet, recorded after six confirmations and linked to their on-chain evidence.",
};

export const viewport: Viewport = {
  themeColor: "#02122f",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href="#content">Skip to content</a>
        <AnnouncerProvider>
          <SiteHeader />
          <MaintenanceBanner />
          {children}
        </AnnouncerProvider>
      </body>
    </html>
  );
}

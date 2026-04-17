import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { PWARegister } from "./pwa-register";
import { InstallBanner } from "@/components/InstallBanner";

// ── Viewport ──────────────────────────────────────────────────────────────────
export const viewport: Viewport = {
  themeColor:   "#0F6E56",
  width:        "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit:  "cover",
};

// ── Metadata ──────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title:       "LumidahRentals — Rent smarter. Manage better.",
  description: "Modern property management and rental payment platform for Kenya.",
  manifest:    "/manifest.json",
  appleWebApp: {
    capable:        true,
    statusBarStyle: "default",
    title:          "LumidahRentals",
  },
  icons: {
    apple: "/icons/icon.svg",
    icon:  "/icons/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <PWARegister />
        <Providers>{children}</Providers>
        {/* InstallBanner lives here so it is NEVER unmounted by navigation */}
        <InstallBanner />
      </body>
    </html>
  );
}

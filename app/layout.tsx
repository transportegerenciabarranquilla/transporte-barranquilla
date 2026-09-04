import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SecurityLockdownGuard } from "./components/SecurityLockdownGuard";
import { PwaManager } from "./components/PwaManager";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Transport Barranquilla",
  description: "Centro operativo para seguimiento, modulacion y jornada laboral.",
  applicationName: "Torre Control",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Torre Control" },
  formatDetection: { telephone: false },
  icons: { apple: [{ url: "/favicon.jpeg", sizes: "438x438", type: "image/jpeg" }] },
};

export const viewport = {
  themeColor: "#10223d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="tech-grid min-h-full flex flex-col">
        {children}
        <PwaManager />
        <SecurityLockdownGuard />
      </body>
    </html>
  );
}

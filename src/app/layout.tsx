import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import AppGate from "./components/AppGate";
import RoleSwitcher from "./components/RoleSwitcher";
import { AuthProvider } from "./lib/auth-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "مُلم",
  description: "منصة إدارة فريق مُلم التطوعي",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen">
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="afterInteractive"
        />
        <AuthProvider>
          <AppGate>{children}</AppGate>
          {process.env.NODE_ENV === "development" &&
            process.env.NEXT_PUBLIC_DEMO === "1" && (
              <RoleSwitcher />
            )}
        </AuthProvider>
      </body>
    </html>
  );
}
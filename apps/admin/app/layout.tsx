import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { AuthProvider } from "@/lib/auth/AuthContext";
import GoogleMapsProvider from "@/lib/providers/GoogleMapsProvider";
import { Toaster } from "@repo/ui/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Blink Admin",
  description: "Blink Hub Admin Panel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClerkProvider>
          <ConvexClientProvider>
            <AuthProvider>
              <GoogleMapsProvider>{children}</GoogleMapsProvider>
            </AuthProvider>
          </ConvexClientProvider>
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  );
}

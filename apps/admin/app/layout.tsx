import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { AuthProvider } from "@/lib/auth/AuthContext";
import GoogleMapsProvider from "@/lib/providers/GoogleMapsProvider";
import { Toaster } from "@repo/ui/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

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
    // suppressHydrationWarning is required, not defensive: next-themes writes
    // the resolved theme onto <html> in a blocking script before React hydrates,
    // so the server-rendered class list and the client's differ by design. This
    // suppresses the warning for this element only, not its subtree.
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/*
          Outermost, above ClerkProvider: Clerk's own components read the
          prefers-colour-scheme context, and the sign-in screen has to be themed
          before anything authenticates. Nothing below here can set the theme.
        */}
        <ThemeProvider>
          <ClerkProvider>
            <ConvexClientProvider>
              <AuthProvider>
                <GoogleMapsProvider>{children}</GoogleMapsProvider>
              </AuthProvider>
            </ConvexClientProvider>
            <Toaster />
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

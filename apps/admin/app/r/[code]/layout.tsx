import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download Blink",
  description: "Your everyday delivery app – download Blink now.",
};

export default function ReferralLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

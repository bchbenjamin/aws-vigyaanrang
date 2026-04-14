import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Breach & Defend - A Game of Trial, Trust, and Treason",
  description: "A 30-player real-time social deduction game simulating corporate tech infrastructure. Defend the codebase or hack your way through.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

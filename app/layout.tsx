import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Κλήρωση 19ου Δημοτικού Θεσσαλονίκης",
  description: "Εφαρμογή κλήρωσης δώρων για σχολική γιορτή.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="el">
      <body>{children}</body>
    </html>
  );
}

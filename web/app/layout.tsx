import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Nunito_Sans } from "next/font/google";
import "./globals.css";

const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700", "800"] });
const body = Nunito_Sans({ subsets: ["latin"], variable: "--font-body", weight: ["400", "600", "700"] });

export const metadata: Metadata = {
  title: "Credit & Savings Records Management System",
  description: "Record customers, savings and credit, print statements of account, and report on the whole business. Three packages: Basic, Classic and Enhanced.",
};

export const viewport: Viewport = { themeColor: "#125e51", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}

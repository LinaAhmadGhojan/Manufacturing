import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = { title: "MFP — Manufacturing", description: "Raw material to finished goods" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen md:flex">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </body>
    </html>
  );
}

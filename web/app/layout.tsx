import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavTabs } from "@/components/nav-tabs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "グッズ販売管理ダッシュボード",
  description: "Notion連携によるグッズ販売実績の可視化ダッシュボード",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NavTabs />
        {children}
      </body>
    </html>
  );
}

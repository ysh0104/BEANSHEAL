import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BEANSHEAL StockTrace",
  description: "제조지시기록서 및 HACCP 서류 자동화 시스템",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body className={`${inter.className} bg-[#0b0b0b] text-zinc-100 flex flex-col min-h-screen antialiased selection:bg-zinc-800 selection:text-white`}>
        <AuthProvider>
          {/* 상단 가로 메뉴바 (GNB) */}
          <Sidebar />

          <main className="flex-1 overflow-y-auto p-4 md:p-6 max-w-7xl mx-auto w-full">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
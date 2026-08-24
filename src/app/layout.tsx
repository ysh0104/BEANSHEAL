import type { Metadata } from "next";
import { Noto_Sans_KR, Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import LayoutContent from "@/components/LayoutContent";

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-noto-sans-kr",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "BEANSHEAL (주)빈스힐 공식 홈페이지 & 통합 생산 ERP",
  description: "액상 핸드드립 커피 및 건강기능식품(GMP) 전문 제조기업 (주)빈스힐",
  metadataBase: new URL("https://www.beansheal.com"),
  alternates: {
    canonical: "/",
  },
  verification: {
    other: {
      "naver-site-verification": "aa4c194d277e8f850ce8ab161059c686ae99e509",
    },
  },
  openGraph: {
    type: "website",
    url: "https://www.beansheal.com/",
    siteName: "BEANSHEAL (주)빈스힐",
    locale: "ko_KR",
    title: "빈스힐 (BEANSHEAL) - 액상 건강기능식품 & 기능성 음료 전문 기업",
    description:
      "액상 건기식 소량생산부터 대량생산까지! 빈스힐 전담 연구진의 프리미엄 액상 전용 OEM/ODM 맞춤 제조 솔루션",
  },
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
    <html lang="ko" className={`${notoSansKR.variable} ${inter.variable}`}>
      <body className="m-0 p-0 antialiased text-slate-900 bg-slate-50 font-sans">
        <AuthProvider>
          <LayoutContent>{children}</LayoutContent>
        </AuthProvider>
      </body>
    </html>
  );
}

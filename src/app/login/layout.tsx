import type { Metadata } from "next";
import { pageTitle } from "@/lib/branding";

export const metadata: Metadata = {
  title: pageTitle("workspace", "로그인"),
  description: `${pageTitle("workspace")} 사내 계정 로그인`,
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

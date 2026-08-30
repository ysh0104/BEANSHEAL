import type { Metadata } from "next";
import { BRAND } from "@/lib/branding";

export const metadata: Metadata = {
  title: {
    default: BRAND.workspace,
    template: `%s | ${BRAND.workspace}`,
  },
  description: `${BRAND.workspace} — 빈스힐 사내 생산·재고·품질·발주 통합 업무 시스템`,
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}

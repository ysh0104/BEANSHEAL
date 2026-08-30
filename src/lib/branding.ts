/** BEANSHEAL 제품·플랫폼 공식 명칭 */
export const BRAND = {
  /** 전체 통합 플랫폼 */
  platform: "BEANSHEAL Platform",
  /** 고객용 홈페이지·견적·포트폴리오 */
  connect: "BEANSHEAL Connect",
  /** 사내 ERP·생산·재고·품질 */
  workspace: "BEANSHEAL Workspace",
  /** 회사명 (양식·법적 표기) */
  company: "BEANSHEAL",
  companyKo: "(주)빈스힐",
} as const;

export const BRAND_SHORT = {
  connect: "Connect",
  workspace: "Workspace",
  platform: "Platform",
} as const;

/** 브라우저 탭 제목 */
export function pageTitle(surface: "platform" | "connect" | "workspace", page?: string): string {
  const base =
    surface === "connect"
      ? BRAND.connect
      : surface === "workspace"
        ? BRAND.workspace
        : BRAND.platform;
  return page ? `${page} | ${base}` : base;
}

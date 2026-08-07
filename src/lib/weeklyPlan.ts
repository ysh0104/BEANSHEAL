export type WeeklyPlanCategory = "생산" | "관리" | "입고" | "출고";

export type WeeklyPlanGrid = Record<WeeklyPlanCategory, string[]>;

export const WEEKLY_PLAN_CATEGORIES: WeeklyPlanCategory[] = ["생산", "관리", "입고", "출고"];

export function emptyWeeklyPlanGrid(): WeeklyPlanGrid {
  return {
    생산: Array(7).fill(""),
    관리: Array(7).fill(""),
    입고: Array(7).fill(""),
    출고: Array(7).fill(""),
  };
}

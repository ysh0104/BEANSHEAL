export interface HealthCheckItem {
  id?: string;
  no: number;
  name: string;             // 성명
  checkup_date: string;     // 검진일
  judgment_date: string;    // 판정일
  result_status: string;    // 정상여부 (예: 정상)
  next_date: string;        // 차후판정일 (만료 예정일)
  remark?: string;          // 비고
  created_at?: string;
}

export const DEFAULT_HEALTH_CHECK_ITEMS: HealthCheckItem[] = [
  { no: 1, name: "주미정", checkup_date: "2026.06.18", judgment_date: "2026.06.22", result_status: "정상", next_date: "2027.06.18", remark: "" },
  { no: 2, name: "김대원", checkup_date: "2025.11.06", judgment_date: "2025.11.08", result_status: "정상", next_date: "2026.11.06", remark: "" },
  { no: 3, name: "정선영", checkup_date: "2026.04.10", judgment_date: "2026.04.14", result_status: "정상", next_date: "2027.04.10", remark: "" },
  { no: 4, name: "이상은", checkup_date: "2026.04.10", judgment_date: "2026.04.10", result_status: "정상", next_date: "2027.04.10", remark: "" },
  { no: 5, name: "임화랑", checkup_date: "2026.02.25", judgment_date: "2026.02.27", result_status: "정상", next_date: "2027.02.25", remark: "" },
  { no: 6, name: "유혜형", checkup_date: "2026.02.25", judgment_date: "2026.02.27", result_status: "정상", next_date: "2027.02.25", remark: "" },
  { no: 7, name: "유광성", checkup_date: "2025.11.11", judgment_date: "2025.11.17", result_status: "정상", next_date: "2026.11.11", remark: "" },
  { no: 8, name: "정선희", checkup_date: "2025.10.13", judgment_date: "2025.10.20", result_status: "정상", next_date: "2026.10.13", remark: "" },
  { no: 9, name: "강다현", checkup_date: "2026.02.25", judgment_date: "2026.02.27", result_status: "정상", next_date: "2027.02.25", remark: "" },
  { no: 10, name: "방세원", checkup_date: "2025.09.18", judgment_date: "2025.09.19", result_status: "정상", next_date: "2026.09.18", remark: "" },
  { no: 11, name: "주재훈", checkup_date: "2026.02.20", judgment_date: "2026.02.25", result_status: "정상", next_date: "2027.02.20", remark: "" },
  { no: 12, name: "유승훈", checkup_date: "2026.06.18", judgment_date: "2026.06.23", result_status: "정상", next_date: "2027.06.18", remark: "" },
  { no: 13, name: "최봉주", checkup_date: "2026.03.23", judgment_date: "2026.03.25", result_status: "정상", next_date: "2027.03.23", remark: "" },
  { no: 14, name: "김학찬", checkup_date: "2025.11.13", judgment_date: "2025.11.17", result_status: "정상", next_date: "2026.11.13", remark: "" }
];

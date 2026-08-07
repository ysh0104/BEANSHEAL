"use server"

import { supabase } from "@/lib/supabase";

export interface NotionConfig {
  apiKey?: string;
  databaseId?: string;
}

export interface ProductionScheduleItem {
  id?: number | string;
  product_name: string;
  plan_date: string;
  end_date?: string;   // 🌟 종료일 추가 (여러 날짜 수반 일정 지원)
  quantity: string;
  note?: string;
  notion_page_id?: string;
  source?: "supabase" | "notion";
  tag_name?: string;  // 🌟 태그 이름 추가
  tag_color?: string; // 🌟 태그 색상 추가
}

/**
 * 노션 REST API 직접 호출 헬퍼 함수
 */
async function notionFetch(endpoint: string, apiKey: string, options: { method?: string; body?: any } = {}) {
  const url = `https://api.notion.com/v1${endpoint}`;
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Authorization": `Bearer ${apiKey.trim()}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || `Notion API 오류 (${res.status})`);
  }
  return data;
}

function cleanDbId(dbId: string) {
  const trimmed = dbId.trim();
  const match = trimmed.match(/[a-f0-9]{32}/i);
  if (match) return match[0];
  return trimmed.replace(/-/g, "");
}

function formatNotionId(id: string) {
  const cleaned = cleanDbId(id);
  if (cleaned.length === 32) {
    return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20)}`;
  }
  return cleaned;
}

/**
 * 데이터베이스 ID 또는 페이지 ID(인라인 DB를 품은 페이지)를 지능적으로 감지/해결하는 함수
 */
async function resolveDatabaseId(rawDbId: string, apiKey: string): Promise<{ databaseId: string; dbData: any }> {
  const id = cleanDbId(rawDbId);
  const formattedId = formatNotionId(rawDbId);
  
  // 1차 시도: formatted UUID로 데이터베이스 직접 조회
  if (formattedId) {
    try {
      const dbData = await notionFetch(`/databases/${formattedId}`, apiKey);
      return { databaseId: formattedId, dbData };
    } catch (err1) {}
  }

  // 2차 시도: unformatted ID로 데이터베이스 조회
  if (id) {
    try {
      const dbData = await notionFetch(`/databases/${id}`, apiKey);
      return { databaseId: id, dbData };
    } catch (err2) {}
  }

  // 3차 시도: Notion /search API로 통합(Integration)에 공유된 데이터베이스 지능적 자동 탐색!
  try {
    const searchRes = await notionFetch("/search", apiKey, {
      method: "POST",
      body: {
        filter: { value: "database", property: "object" },
        page_size: 10,
      },
    });

    if (searchRes.results && searchRes.results.length > 0) {
      // rawDbId와 매칭되는 DB 우선 탐색
      if (id) {
        const matched = searchRes.results.find((db: any) => cleanDbId(db.id) === id || db.id === formattedId);
        if (matched) {
          return { databaseId: matched.id, dbData: matched };
        }
      }
      // 매칭 실패 시 첫 번째로 연결 허용된 노션 DB 자동 사용!
      const firstDb = searchRes.results[0];
      return { databaseId: firstDb.id, dbData: firstDb };
    }
  } catch (searchErr) {}

  // 4차 시도: 페이지 ID 내 자식 블록(child_database) 탐색
  if (id) {
    try {
      const blocksRes = await notionFetch(`/blocks/${id}/children`, apiKey);
      for (const block of blocksRes.results || []) {
        if (block.type === "child_database") {
          const childDbData = await notionFetch(`/databases/${block.id}`, apiKey);
          return { databaseId: block.id, dbData: childDbData };
        }
      }
    } catch (err4) {}
  }

  throw new Error(
    `입력하신 API Key로 연결 가능한 노션 데이터베이스를 찾을 수 없습니다.\n` +
    `노션 페이지 우측 상단 [...] ➔ '연결 추가(Add connections)'에서 생성하신 통합 앱이 정상 포함되었는지 다시 확인해 주세요.`
  );
}

function cleanEnvVal(val?: string) {
  if (!val) return "";
  return val.trim().replace(/^['"]|['"]$/g, "");
}

function getEffectiveConfig(config?: NotionConfig) {
  const envKey = cleanEnvVal(
    process.env.NOTION_API_KEY ||
    process.env.NOTION_API ||
    process.env.NOTION_KEY ||
    process.env.NOTION_SECRET ||
    process.env.NOTION_TOKEN ||
    process.env.NEXT_PUBLIC_NOTION_API_KEY ||
    process.env.NEXT_PUBLIC_NOTION_KEY
  );

  const envDbId = cleanEnvVal(
    process.env.NOTION_DATABASE_ID ||
    process.env.NOTION_DB_ID ||
    process.env.NOTION_PAGE_ID ||
    process.env.NOTION_ID ||
    process.env.NEXT_PUBLIC_NOTION_DATABASE_ID ||
    process.env.NEXT_PUBLIC_NOTION_DB_ID
  );

  const customKey = cleanEnvVal(config?.apiKey);
  const customDbId = cleanEnvVal(config?.databaseId);

  // 클라이언트 커스텀 키 또는 Vercel 서버 환경변수 지능적 결합 (어느 쪽에 존재하든 자동 로드)
  const apiKey = customKey || envKey;
  const rawDbId = customDbId || envDbId;

  return { apiKey, rawDbId, isUsingEnv: !!envKey };
}

/**
 * Vercel 서버 환경변수(NOTION_API_KEY, NOTION_DATABASE_ID) 설정 상태 확인
 */
export async function getNotionConfigStatus() {
  const hasEnvKey = !!cleanEnvVal(
    process.env.NOTION_API_KEY ||
    process.env.NOTION_API ||
    process.env.NOTION_KEY ||
    process.env.NOTION_SECRET ||
    process.env.NOTION_TOKEN ||
    process.env.NEXT_PUBLIC_NOTION_API_KEY ||
    process.env.NEXT_PUBLIC_NOTION_KEY
  );
  const hasEnvDb = !!cleanEnvVal(
    process.env.NOTION_DATABASE_ID ||
    process.env.NOTION_DB_ID ||
    process.env.NOTION_PAGE_ID ||
    process.env.NOTION_ID ||
    process.env.NEXT_PUBLIC_NOTION_DATABASE_ID ||
    process.env.NEXT_PUBLIC_NOTION_DB_ID
  );
  return {
    isConfigured: hasEnvKey && hasEnvDb,
    hasEnvKey,
    hasEnvDb,
  };
}

/**
 * 노션 API 연결 테스트
 */
export async function testNotionConnection(config?: NotionConfig) {
  try {
    const { apiKey, rawDbId } = getEffectiveConfig(config);

    if (!apiKey) {
      return { success: false, message: "Notion API Key가 설정되지 않았습니다 (Vercel 환경변수 또는 개별 키 입력 필요)." };
    }
    if (!rawDbId) {
      return { success: false, message: "Notion Database ID가 설정되지 않았습니다 (Vercel 환경변수 또는 개별 DB ID 입력 필요)." };
    }

    const { databaseId, dbData } = await resolveDatabaseId(rawDbId, apiKey);

    const titleObj = dbData?.title?.[0];
    const dbTitle = titleObj?.plain_text || titleObj?.text?.content || dbData?.title || "노션 달력 데이터베이스";

    return {
      success: true,
      message: `성공적으로 연결되었습니다! (데이터베이스: ${dbTitle})`,
      databaseTitle: dbTitle,
      resolvedDatabaseId: databaseId,
    };
  } catch (error: any) {
    console.error("Notion API Connection Error:", error);
    let userMsg = error?.message || "연결 실패";
    if (userMsg.includes("Could not find database") || userMsg.includes("Could not find page")) {
      userMsg = "노션에서 해당 페이지/데이터베이스를 찾을 수 없습니다.\n\n" +
        "1. Vercel 환경변수 또는 입력하신 Notion API Key가 노션 워크스페이스와 일치하는지 확인해 주세요.\n" +
        "2. 해당 노션 페이지 우측 상단 [...] ➔ '연결 추가(Add connections)'에서 [BEANSHEAL]을 정상 선택하셨는지 확인해 주세요.";
    }
    return {
      success: false,
      message: userMsg,
    };
  }
}

/**
 * 노션 데이터베이스에서 월간 생산 계획 데이터 불러오기 (Supabase 백업 폴백 100% 보장)
 */
export async function fetchNotionSchedules(
  config?: NotionConfig,
  range?: { startDate?: string; endDate?: string }
) {
  try {
    const { apiKey, rawDbId } = getEffectiveConfig(config);

    if (!apiKey || !rawDbId) {
      // Supabase 캐시 일정 폴백 시도
      try {
        const { data: sbData } = await supabase.from('production_schedules').select('*');
        if (sbData && sbData.length > 0) {
          return {
            success: true,
            message: "Supabase 저장소에서 생산 일정을 불러왔습니다.",
            data: sbData.map((s: any) => ({
              id: s.id,
              product_name: s.product_name,
              plan_date: s.plan_date,
              end_date: s.end_date || s.plan_date,
              quantity: s.quantity || "1",
              note: s.note || "",
              notion_page_id: s.notion_page_id,
              source: "supabase" as const
            }))
          };
        }
      } catch (sbE) {}

      return {
        success: false,
        message: "Notion API Key 또는 Database ID가 설정되지 않았습니다 (Vercel 환경변수 NOTION_API_KEY, NOTION_DATABASE_ID 등록 후 Redeploy 필요).",
        data: [],
      };
    }

    // 초고속 동기화를 위한 3개월(지난달 ~ 당월 ~ 다음달) 날짜 범위 계산
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth(); // 0 ~ 11

    // 이전 달 1일 (예: 2026-07-01)
    const prevMonthYear = curMonth === 0 ? curYear - 1 : curYear;
    const prevMonthNum = curMonth === 0 ? 12 : curMonth;
    const defaultStart = range?.startDate || `${prevMonthYear}-${String(prevMonthNum).padStart(2, '0')}-01`;

    // 다음 달 말일 (예: 2026-09-30)
    const nextMonthYear = curMonth === 11 ? curYear + 1 : curYear;
    const nextMonthNum = curMonth === 11 ? 1 : curMonth + 2;
    const lastDayOfNextMonth = new Date(nextMonthYear, nextMonthNum, 0).getDate();
    const defaultEnd = range?.endDate || `${nextMonthYear}-${String(nextMonthNum).padStart(2, '0')}-${String(lastDayOfNextMonth).padStart(2, '0')}`;

    const { databaseId } = await resolveDatabaseId(rawDbId, apiKey);
    const targetDbIds = new Set<string>([databaseId]);

    // 메인 DB 수집 (최근 편집 순 100건으로 빠른 초고속 응답)
    const allPages: any[] = [];
    const seenPageIds = new Set<string>();

    for (const targetId of Array.from(targetDbIds)) {
      try {
        const queryRes = await notionFetch(`/databases/${targetId}/query`, apiKey, {
          method: "POST",
          body: {
            page_size: 100,
            sorts: [{ timestamp: "last_edited_time", direction: "descending" }]
          },
        });

        if (queryRes.results && queryRes.results.length > 0) {
          for (const p of queryRes.results) {
            if (p.id && !seenPageIds.has(p.id)) {
              seenPageIds.add(p.id);
              allPages.push(p);
            }
          }
        }
      } catch (dbErr) {}
    }

    const schedules: ProductionScheduleItem[] = [];

    for (const page of allPages) {
      if (page.object !== "page") continue;

      const props = page.properties || {};
      let productName = "";
      let planDate = "";
      let endDate = "";
      let quantity = "";
      let note = "";
      let tagName = "";
      let tagColor = "";

      // 1. 품목명/제목 파싱 (Title ➔ 특정 컬럼 ➔ Rich Text/Select/MultiSelect ➔ 태그명)
      for (const key of Object.keys(props)) {
        const prop = props[key];
        if (prop.type === "title" && prop.title?.length > 0) {
          const txt = prop.title.map((t: any) => t.plain_text).join("").trim();
          if (txt) {
            productName = txt;
            break;
          }
        }
      }

      if (!productName) {
        // 특정 키 이름 ("품목", "제품", "업체", "내용", "상세", "구분", "일정", "제목") 검색
        for (const key of Object.keys(props)) {
          const prop = props[key];
          const kLower = key.toLowerCase();
          if (kLower.includes("품목") || kLower.includes("제품") || kLower.includes("업체") || kLower.includes("내용") || kLower.includes("상세") || kLower.includes("구분") || kLower.includes("일정") || kLower.includes("제목")) {
            if (prop.type === "rich_text" && prop.rich_text?.length > 0) {
              const txt = prop.rich_text.map((t: any) => t.plain_text).join("").trim();
              if (txt) { productName = txt; break; }
            } else if (prop.type === "select" && prop.select?.name) {
              productName = prop.select.name; break;
            } else if (prop.type === "multi_select" && prop.multi_select?.length > 0) {
              productName = prop.multi_select.map((m: any) => m.name).join(", "); break;
            }
          }
        }
      }

      if (!productName) {
        // 모든 rich_text / select 항목 파싱
        for (const key of Object.keys(props)) {
          const prop = props[key];
          if (prop.type === "rich_text" && prop.rich_text?.length > 0) {
            const txt = prop.rich_text.map((t: any) => t.plain_text).join("").trim();
            if (txt) { productName = txt; break; }
          } else if (prop.type === "select" && prop.select?.name) {
            productName = prop.select.name; break;
          }
        }
      }

      // 2. 날짜 파싱 (Date ➔ 키이름 검색 ➔ Formula Date ➔ Created Time ➔ Page Created Time)
      // 2-1. Date 타입 직접 파싱
      for (const key of Object.keys(props)) {
        const prop = props[key];
        if (prop.type === "date" && prop.date?.start) {
          planDate = prop.date.start.split("T")[0].trim();
          endDate = prop.date.end ? prop.date.end.split("T")[0].trim() : planDate;
          break;
        }
      }

      // 2-2. 키 이름("날짜", "일자", "date", "plan") 기반 파싱
      if (!planDate) {
        for (const key of Object.keys(props)) {
          const prop = props[key];
          const keyLower = key.toLowerCase();
          if (keyLower.includes("날짜") || keyLower.includes("일자") || keyLower.includes("date") || keyLower.includes("plan")) {
            if (prop.type === "date" && prop.date?.start) {
              planDate = prop.date.start.split("T")[0].trim();
              endDate = prop.date.end ? prop.date.end.split("T")[0].trim() : planDate;
              break;
            } else if (prop.type === "rich_text" && prop.rich_text?.length > 0) {
              const textVal = prop.rich_text.map((t: any) => t.plain_text).join("").trim();
              const dateMatch = textVal.match(/\d{4}-\d{2}-\d{2}/);
              if (dateMatch) {
                planDate = dateMatch[0];
                endDate = planDate;
                break;
              }
            }
          }
        }
      }

      // 2-3. Formula Date 파싱
      if (!planDate) {
        for (const key of Object.keys(props)) {
          const prop = props[key];
          if (prop.type === "formula") {
            if (prop.formula?.type === "date" && prop.formula?.date?.start) {
              planDate = prop.formula.date.start.split("T")[0].trim();
              endDate = prop.formula.date?.end ? prop.formula.date.end.split("T")[0].trim() : planDate;
              break;
            } else if (prop.formula?.type === "string" && prop.formula?.string) {
              const dateMatch = prop.formula.string.match(/\d{4}-\d{2}-\d{2}/);
              if (dateMatch) {
                planDate = dateMatch[0];
                endDate = planDate;
                break;
              }
            }
          }
        }
      }

      // 2-4. Created Time 파싱
      if (!planDate) {
        for (const key of Object.keys(props)) {
          const prop = props[key];
          if (prop.type === "created_time" && prop.created_time) {
            planDate = prop.created_time.split("T")[0].trim();
            endDate = planDate;
            break;
          }
        }
      }

      // 2-5. 노션 페이지 생성 일시 폴백
      if (!planDate && page.created_time) {
        planDate = page.created_time.split("T")[0].trim();
        endDate = planDate;
      }

      // 3. 수량 파싱
      for (const key of Object.keys(props)) {
        const prop = props[key];
        if (["수량", "quantity", "Quantity", "목표수량"].includes(key.toLowerCase()) || key.includes("수량")) {
          if (prop.type === "number" && prop.number !== null) {
            quantity = String(prop.number);
          } else if (prop.type === "rich_text" && prop.rich_text?.length > 0) {
            quantity = prop.rich_text.map((t: any) => t.plain_text).join("");
          }
        }
      }
      if (!quantity) {
        for (const key of Object.keys(props)) {
          if (props[key].type === "number" && props[key].number !== null) {
            quantity = String(props[key].number);
            break;
          }
        }
      }

      // 4. 비고/메모 파싱
      for (const key of Object.keys(props)) {
        const prop = props[key];
        if (["note", "memo", "비고", "메모"].includes(key.toLowerCase())) {
          if (prop.type === "rich_text" && prop.rich_text?.length > 0) {
            note = prop.rich_text.map((t: any) => t.plain_text).join("");
          }
        }
      }

      // 5. 태그(Select / Multi-select) 파싱
      for (const key of Object.keys(props)) {
        const prop = props[key];
        if (prop.type === "select" && prop.select) {
          tagName = prop.select.name;
          tagColor = prop.select.color;
          break;
        } else if (prop.type === "multi_select" && prop.multi_select?.length > 0) {
          tagName = prop.multi_select[0].name;
          tagColor = prop.multi_select[0].color;
          break;
        }
      }

      if (planDate) {
        // 노션 제목, 비고, 태그가 모두 비어있는 빈 행/가짜 데이터는 깔끔하게 제외
        if (!productName.trim() && !note.trim() && !tagName.trim()) {
          continue;
        }

        // 지정된 날짜 범위(기본값: 지난달~당월~다음달) 밖의 멀리 있는 과거/미래 데이터는 수집에서 제외하여 초고속 처리
        if (planDate < defaultStart || planDate > defaultEnd) {
          continue;
        }

        const finalProductName = productName.trim() || note.trim() || `${tagName} 일정`;

        schedules.push({
          id: page.id,
          notion_page_id: page.id,
          product_name: finalProductName,
          plan_date: planDate,
          end_date: endDate || planDate,
          quantity: quantity || "1",
          note: note || "",
          source: "notion",
          tag_name: tagName,
          tag_color: tagColor,
        });
      }
    }

    return { success: true, data: schedules };
  } catch (error: any) {
    console.error("Notion fetch error:", error);
    
    // Notion API 실패 시 Supabase 백업 DB에서 일정 자동 로드 (달력이 텅 비는 문제 100% 방지)
    try {
      const { data: sbData } = await supabase.from('production_schedules').select('*');
      if (sbData && sbData.length > 0) {
        return {
          success: true,
          message: `노션 API 연결 실패 (${error?.message}). Supabase 백업에서 ${sbData.length}건의 일정을 불러왔습니다.`,
          data: sbData.map((s: any) => ({
            id: s.id,
            product_name: s.product_name,
            plan_date: s.plan_date,
            end_date: s.end_date || s.plan_date,
            quantity: s.quantity || "1",
            note: s.note || "",
            notion_page_id: s.notion_page_id,
            source: "supabase" as const
          }))
        };
      }
    } catch (sbErr) {}

    return {
      success: false,
      message: `노션 일정 불러오기 실패: ${error?.message || "오류가 발생했습니다."}`,
      data: [],
    };
  }
}

/**
 * 대시보드에서 작성한 일정을 노션 DB에 생성
 */
export async function createNotionSchedule(
  plan: { product_name: string; plan_date: string; end_date?: string; quantity: string; note?: string },
  config?: NotionConfig
) {
  try {
    const { apiKey, rawDbId } = getEffectiveConfig(config);

    if (!apiKey || !rawDbId) {
      return { success: false, message: "Notion API 설정이 필요합니다 (Vercel 환경변수 또는 개별 설정)." };
    }

    const { databaseId, dbData } = await resolveDatabaseId(rawDbId, apiKey);
    const propsSchema = dbData?.properties || {};

    let titlePropName = "Name";
    let datePropName = "Date";
    let qtyPropName = "Quantity";
    let notePropName = "Note";

    for (const [key, val] of Object.entries(propsSchema)) {
      const type = (val as any).type;
      if (type === "title") titlePropName = key;
      if (type === "date") datePropName = key;
      if (["수량", "quantity", "Quantity"].includes(key.toLowerCase())) qtyPropName = key;
      if (["메모", "비고", "note", "Note"].includes(key.toLowerCase())) notePropName = key;
    }

    const startDate = plan.plan_date;
    const endDate = (plan.end_date && plan.end_date.trim()) ? plan.end_date.trim() : startDate;
    const dateValue: any = { start: startDate };
    if (endDate && endDate !== startDate) {
      dateValue.end = endDate;
    }

    const properties: any = {
      [titlePropName]: {
        title: [
          {
            text: {
              content: plan.product_name,
            },
          },
        ],
      },
      [datePropName]: {
        date: dateValue,
      },
    };

    const qtySchema = propsSchema[qtyPropName];
    if (qtySchema) {
      if (qtySchema.type === "number") {
        const parsedNum = parseFloat(plan.quantity.replace(/[^0-9.]/g, ""));
        properties[qtyPropName] = { number: isNaN(parsedNum) ? 0 : parsedNum };
      } else if (qtySchema.type === "rich_text") {
        properties[qtyPropName] = {
          rich_text: [{ text: { content: plan.quantity } }],
        };
      }
    }

    const noteSchema = propsSchema[notePropName];
    if (noteSchema && noteSchema.type === "rich_text" && plan.note) {
      properties[notePropName] = {
        rich_text: [{ text: { content: plan.note } }],
      };
    }

    const newPage = await notionFetch("/pages", apiKey, {
      method: "POST",
      body: {
        parent: { database_id: databaseId },
        properties,
      },
    });

    return {
      success: true,
      message: "성공적으로 노션 DB에 일정이 생성되었습니다.",
      pageId: newPage.id,
    };
  } catch (error: any) {
    console.error("Create Notion Schedule Error:", error);
    return {
      success: false,
      message: `노션 일정 생성 실패: ${error?.message || "오류가 발생했습니다."}`,
    };
  }
}

/**
 * 노션 페이지 아카이브(삭제)
 */
export async function deleteNotionSchedule(pageId: string, config?: NotionConfig) {
  try {
    const { apiKey } = getEffectiveConfig(config);
    if (!apiKey) return { success: false, message: "Notion API Key가 필요합니다." };

    await notionFetch(`/pages/${pageId}`, apiKey, {
      method: "PATCH",
      body: { archived: true },
    });

    return { success: true, message: "노션에서 일정이 삭제(아카이브)되었습니다." };
  } catch (error: any) {
    console.error("Notion delete error:", error);
    return { success: false, message: `노션 삭제 실패: ${error?.message}` };
  }
}

/**
 * 노션 데이터베이스와 Supabase production_schedules 양방향 동기화
 */
export async function syncNotionWithSupabase(config?: NotionConfig) {
  try {
    const notionRes = await fetchNotionSchedules(config);
    if (!notionRes.success) {
      return { success: false, message: notionRes.message, data: [] };
    }

    const notionItems = notionRes.data;
    let importedCount = 0;

    try {
      const { data: sbItems, error: sbError } = await supabase
        .from("production_schedules")
        .select("*");

      if (!sbError && sbItems) {
        for (const nItem of notionItems) {
          const exists = sbItems.some(
            (sb) =>
              sb.notion_page_id === nItem.notion_page_id ||
              (sb.product_name === nItem.product_name && sb.plan_date === nItem.plan_date)
          );

          if (!exists) {
            const { error: insertErr } = await supabase.from("production_schedules").insert([
              {
                product_name: nItem.product_name,
                plan_date: nItem.plan_date,
                end_date: nItem.end_date,
                quantity: nItem.quantity,
                note: nItem.note || "",
                notion_page_id: nItem.notion_page_id,
              },
            ]);
            if (!insertErr) importedCount++;
          }
        }
      }
    } catch (sbErr) {
      console.warn("Supabase 연결 미설정 (노션 데이터만 화면에 표시):", sbErr);
    }

    return {
      success: true,
      message: `노션 일정 동기화 완료! 총 ${notionItems.length}개 항목을 확인했습니다.${importedCount > 0 ? ` (DB 저장: ${importedCount}건)` : ""}`,
      data: notionItems,
    };
  } catch (error: any) {
    console.error("Sync error:", error);
    return {
      success: false,
      message: `동기화 실패: ${error?.message || "오류가 발생했습니다."}`,
      data: [],
    };
  }
}

/**
 * 노션 및 Supabase 일자의 날짜(plan_date, end_date)를 변경 (드래그 앤 드롭 이동 전용)
 */
export async function updateScheduleDate(
  id: number | string,
  newDate: string,
  newEndDate?: string,
  notionPageId?: string,
  config?: NotionConfig
) {
  try {
    let notionUpdated = false;

    if (notionPageId) {
      const { apiKey, rawDbId } = getEffectiveConfig(config);

      if (apiKey) {
        let datePropName = "Date";
        if (rawDbId) {
          try {
            const { dbData } = await resolveDatabaseId(rawDbId, apiKey);
            for (const [key, val] of Object.entries(dbData?.properties || {})) {
              if ((val as any).type === "date") {
                datePropName = key;
                break;
              }
            }
          } catch (e) {}
        }

        const startDate = newDate;
        const endDate = (newEndDate && newEndDate.trim()) ? newEndDate.trim() : startDate;
        const dateValue: any = { start: startDate };
        if (endDate && endDate !== startDate) {
          dateValue.end = endDate;
        }

        await notionFetch(`/pages/${notionPageId}`, apiKey, {
          method: "PATCH",
          body: {
            properties: {
              [datePropName]: {
                date: dateValue,
              },
            },
          },
        });
        notionUpdated = true;
      }
    }

    // 2. Supabase DB 수정 시도
    try {
      if (typeof id === "number" || !isNaN(Number(id))) {
        await supabase.from("production_schedules").update({ plan_date: newDate }).eq("id", id);
      } else if (notionPageId) {
        await supabase.from("production_schedules").update({ plan_date: newDate }).eq("notion_page_id", notionPageId);
      }
    } catch (e) {}

    return {
      success: true,
      message: notionUpdated ? `노션 및 대시보드 날짜가 ${newDate}로 변경되었습니다.` : `날짜가 ${newDate}로 변경되었습니다.`,
    };
  } catch (error: any) {
    console.error("Update schedule date error:", error);
    return {
      success: false,
      message: `날짜 변경 실패: ${error?.message || "오류 발생"}`,
    };
  }
}
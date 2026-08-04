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
  quantity: string;
  note?: string;
  notion_page_id?: string;
  source?: "supabase" | "notion";
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

/**
 * 데이터베이스 ID 또는 페이지 ID(인라인 DB를 품은 페이지)를 지능적으로 감지/해결하는 함수
 */
async function resolveDatabaseId(rawDbId: string, apiKey: string): Promise<{ databaseId: string; dbData: any }> {
  const id = cleanDbId(rawDbId);
  
  // 1차 시도: 데이터베이스 엔드포인트 직접 조회
  try {
    const dbData = await notionFetch(`/databases/${id}`, apiKey);
    return { databaseId: id, dbData };
  } catch (dbErr: any) {
    // 2차 시도: 만약 페이지 ID인 경우, 페이지 조회 후 자식 데이터베이스 블록(child_database) 탐색
    try {
      const pageData = await notionFetch(`/pages/${id}`, apiKey);
      const blocksRes = await notionFetch(`/blocks/${id}/children`, apiKey);
      for (const block of blocksRes.results || []) {
        if (block.type === "child_database") {
          const childDbData = await notionFetch(`/databases/${block.id}`, apiKey);
          return { databaseId: block.id, dbData: childDbData };
        }
      }
      throw new Error(`입력하신 페이지에서 '달력/표(데이터베이스)'를 발견하지 못했습니다. 달력 블록 자체의 링크를 복사해 주세요.`);
    } catch (pageErr: any) {
      // 페이지 조차 없는 경우 원본 오류 전달
      throw dbErr;
    }
  }
}

/**
 * 노션 API 연결 테스트
 */
export async function testNotionConnection(config?: NotionConfig) {
  try {
    const apiKey = config?.apiKey || process.env.NOTION_API_KEY;
    const rawDbId = config?.databaseId || process.env.NOTION_DATABASE_ID;

    if (!apiKey) {
      return { success: false, message: "Notion API Key가 설정되지 않았습니다." };
    }
    if (!rawDbId) {
      return { success: false, message: "Notion Database ID가 설정되지 않았습니다." };
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
        "1. 입력하신 Notion API Key가 노션 워크스페이스와 일치하는지 확인해 주세요.\n" +
        "2. 해당 노션 페이지 우측 상단 [...] ➔ '연결 추가(Add connections)'에서 [BEANSHEAL]을 정상 선택하셨는지 확인해 주세요.";
    }
    return {
      success: false,
      message: userMsg,
    };
  }
}

/**
 * 노션 데이터베이스에서 월간 생산 계획 데이터 불러오기
 */
export async function fetchNotionSchedules(config?: NotionConfig) {
  try {
    const apiKey = config?.apiKey || process.env.NOTION_API_KEY;
    const rawDbId = config?.databaseId || process.env.NOTION_DATABASE_ID;

    if (!apiKey || !rawDbId) {
      return {
        success: false,
        message: "Notion API Key 또는 Database ID가 설정되지 않았습니다.",
        data: [],
      };
    }

    const { databaseId } = await resolveDatabaseId(rawDbId, apiKey);
    const queryRes = await notionFetch(`/databases/${databaseId}/query`, apiKey, { method: "POST" });

    const schedules: ProductionScheduleItem[] = [];

    for (const page of queryRes.results || []) {
      if (page.object !== "page") continue;

      const props = page.properties || {};
      let productName = "";
      let planDate = "";
      let quantity = "";
      let note = "";

      // 1. 품목명/제목 파싱
      for (const key of Object.keys(props)) {
        const prop = props[key];
        if (prop.type === "title" && prop.title?.length > 0) {
          productName = prop.title.map((t: any) => t.plain_text).join("");
          break;
        }
      }

      // 2. 날짜 파싱 (YYYY-MM-DD 규격 정규화)
      for (const key of Object.keys(props)) {
        const prop = props[key];
        if (prop.type === "date" && prop.date?.start) {
          planDate = prop.date.start.split("T")[0].trim();
          break;
        }
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

      if (productName && planDate) {
        schedules.push({
          id: page.id,
          notion_page_id: page.id,
          product_name: productName,
          plan_date: planDate,
          quantity: quantity || "1",
          note: note || "",
          source: "notion",
        });
      }
    }

    return { success: true, data: schedules };
  } catch (error: any) {
    console.error("Notion fetch error:", error);
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
  plan: { product_name: string; plan_date: string; quantity: string; note?: string },
  config?: NotionConfig
) {
  try {
    const apiKey = config?.apiKey || process.env.NOTION_API_KEY;
    const rawDbId = config?.databaseId || process.env.NOTION_DATABASE_ID;

    if (!apiKey || !rawDbId) {
      return { success: false, message: "Notion API 설정이 필요합니다." };
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
        date: {
          start: plan.plan_date,
        },
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
      message: "노션에 성공적으로 등록되었습니다.",
      pageId: newPage.id,
    };
  } catch (error: any) {
    console.error("Notion create error:", error);
    return {
      success: false,
      message: `노션 등록 실패: ${error?.message || "알 수 없는 오류가 발생했습니다."}`,
    };
  }
}

/**
 * 노션 페이지 아카이브(삭제)
 */
export async function deleteNotionSchedule(pageId: string, config?: NotionConfig) {
  try {
    const apiKey = config?.apiKey || process.env.NOTION_API_KEY;
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

    // Supabase DB 동기화 시도 (Supabase 연동 안된 경우 예외 안전 처리)
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
 * 노션 및 Supabase 일자의 날짜(plan_date)를 변경 (드래그 앤 드롭 이동 전용)
 */
export async function updateScheduleDate(
  id: number | string,
  newDate: string,
  notionPageId?: string,
  config?: NotionConfig
) {
  try {
    let notionUpdated = false;

    // 1. 노션 연동된 항목인 경우 노션 날짜 수정
    if (notionPageId) {
      const apiKey = config?.apiKey || process.env.NOTION_API_KEY;
      const rawDbId = config?.databaseId || process.env.NOTION_DATABASE_ID;

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

        await notionFetch(`/pages/${notionPageId}`, apiKey, {
          method: "PATCH",
          body: {
            properties: {
              [datePropName]: {
                date: { start: newDate },
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

/** 노션 일정 항목 → 업체명 / 타입 / 제품 / 상세 구조화 */

export type ScheduleTag = { name: string; color?: string };

export type ScheduleLike = {
  product_name?: string;
  tag_name?: string;
  tag_color?: string;
  quantity?: string;
  note?: string;
  company_name?: string;
  product_tags?: ScheduleTag[];
  detail_tags?: ScheduleTag[];
};

export type ParsedScheduleEntry = {
  /** 메인 한 줄 (업체명 + 행위, 또는 제목) */
  title: string;
  company?: string;
  type?: string;
  typeColor?: string;
  products: ScheduleTag[];
  details: ScheduleTag[];
  quantity?: string;
  lot?: string;
};

const TYPE_KEYWORDS = ["생산", "입고", "출고", "휴가", "점검", "관리", "제조", "배송", "납품"];

/** 노션 select/multi_select color → Tailwind pill */
export function notionPillClass(color?: string, fallback = "gray"): string {
  const c = color || fallback;
  const map: Record<string, string> = {
    blue: "bg-[#cce5ff] text-[#1a4971] border border-[#a8cce8]",
    green: "bg-[#d3e5d3] text-[#1e4620] border border-[#b8d4b8]",
    red: "bg-[#ffd4d4] text-[#7a1f1f] border border-[#f0b8b8]",
    yellow: "bg-[#fdecc8] text-[#6b4f00] border border-[#f5d998]",
    orange: "bg-[#fadec9] text-[#8a3b12] border border-[#f0c4a8]",
    purple: "bg-[#e8deee] text-[#492e5c] border border-[#d4c4de]",
    pink: "bg-[#f5e0e9] text-[#7a2945] border border-[#e8c8d8]",
    brown: "bg-[#eee0da] text-[#442c22] border border-[#dcc8be]",
    gray: "bg-[#e3e2e0] text-[#37352f] border border-[#d3d1cb]",
    default: "bg-[#e3e2e0] text-[#37352f] border border-[#d3d1cb]",
  };
  const key = c.replace("_background", "");
  return map[key] || map.default;
}

/** 타입(입고/생산 등) 전용 pill 색 */
export function typePillClass(typeName?: string): string {
  const t = (typeName || "").toLowerCase();
  if (t.includes("생산") || t.includes("제조")) return notionPillClass("green");
  if (t.includes("입고") || t.includes("자재")) return notionPillClass("blue");
  if (t.includes("출고") || t.includes("배송") || t.includes("납품")) return notionPillClass("purple");
  if (t.includes("휴가") || t.includes("연차") || t.includes("휴무")) return notionPillClass("yellow");
  if (t.includes("점검")) return notionPillClass("red");
  return notionPillClass("gray");
}

function splitCsvLike(text: string): string[] {
  return text
    .split(/[,，、/|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function inferTypeFromText(text: string): string | undefined {
  for (const kw of TYPE_KEYWORDS) {
    if (text.includes(kw)) return kw;
  }
  return undefined;
}

function parseTitleLine(raw: string): {
  company?: string;
  type?: string;
  rest?: string;
} {
  const text = raw.trim();
  if (!text) return {};

  // "입고 : 슈퍼모로톡스 단상자, 카톤"
  const colonMatch = text.match(/^(.+?)\s*[:：]\s*(.+)$/);
  if (colonMatch) {
    const left = colonMatch[1].trim();
    const right = colonMatch[2].trim();
    const typeFromLeft = TYPE_KEYWORDS.find((k) => left === k || left.endsWith(k));
    if (typeFromLeft) {
      return { type: typeFromLeft, rest: right };
    }
    return { company: left, rest: right };
  }

  // "대웅상사 휴가" / "이피 휴가"
  for (const kw of ["휴가", "연차", "휴무", "반차", "점검"]) {
    if (text.endsWith(kw)) {
      const company = text.slice(0, -kw.length).trim();
      return { company: company || undefined, type: kw };
    }
  }

  // "생산 세리컷V2" 
  for (const kw of TYPE_KEYWORDS) {
    if (text.startsWith(kw)) {
      return { type: kw, rest: text.slice(kw.length).trim() || undefined };
    }
  }

  return { rest: text };
}

export function parseScheduleEntry(sch: ScheduleLike): ParsedScheduleEntry {
  const rawName = (sch.product_name || "").trim();
  const tagName = (sch.tag_name || "").trim();
  const qty = (sch.quantity || "").trim();
  const note = (sch.note || "").trim();

  const products: ScheduleTag[] = [...(sch.product_tags || [])];
  const details: ScheduleTag[] = [...(sch.detail_tags || [])];

  let company = (sch.company_name || "").trim() || undefined;
  let type = tagName || undefined;
  let typeColor = sch.tag_color;

  const parsed = parseTitleLine(rawName);

  if (!company && parsed.company) company = parsed.company;
  if (!type && parsed.type) type = parsed.type;
  if (!type && tagName) type = tagName;

  // rest 텍스트 → 제품/상세 분리
  const rest = parsed.rest || "";
  if (rest && products.length === 0 && details.length === 0) {
    const parts = splitCsvLike(rest);
    if (parts.length >= 2) {
      products.push({ name: parts[0] });
      parts.slice(1).forEach((p) => details.push({ name: p }));
    } else if (parts.length === 1) {
      // 단일 토큰이 제품명인지 상세인지
      const detailKw = ["단상자", "카톤", "파우치", "라벨", "스티커", "박스", "용기"];
      if (detailKw.some((k) => parts[0].includes(k))) {
        details.push({ name: parts[0] });
      } else {
        products.push({ name: parts[0] });
      }
    }
  } else if (rest && products.length === 0) {
    products.push({ name: rest });
  }

  if (!type) {
    type = inferTypeFromText(`${rawName} ${tagName}`);
  }

  // 타이틀: 업체명 + 타입 또는 원본 제목
  let title = rawName;
  if (company && type && !rawName.includes(company)) {
    title = `${company} ${type}`;
  } else if (company && !rawName.startsWith(company)) {
    title = company + (type ? ` ${type}` : "");
  }

  let lot: string | undefined;
  if (note) {
    lot = note.startsWith("LOT") || note.startsWith("lot") ? note : `LOT : ${note}`;
  }

  return {
    title,
    company,
    type,
    typeColor,
    products,
    details,
    quantity: qty && qty !== "1" ? qty : undefined,
    lot,
  };
}

/** 캘린더 레인 배치용 카드 높이 추정 (pill UI 기준) */
export function estimateScheduleCardHeight(sch: ScheduleLike, colSpan = 1): number {
  const entry = parseScheduleEntry(sch);
  const padY = 12; // py-1.5 × 2
  const titleH = 20;
  let h = padY + titleH;

  const pillCount =
    (entry.type ? 1 : 0) + entry.products.length + entry.details.length;
  if (pillCount > 0) {
    // colSpan 넓을수록 한 줄에 더 많은 pill
    const pillsPerRow = Math.max(2, Math.min(5, colSpan * 2));
    const rows = Math.ceil(pillCount / pillsPerRow);
    h += rows * 24 + 4;
  }
  if (entry.quantity) h += 18;
  if (entry.lot) h += 16;

  return Math.max(52, Math.min(h, 130));
}

export type MemoTemplate = {
  id: string;
  label: string;
  html: string;
};

export type MemoPresets = {
  templates: MemoTemplate[];
  tags: string[];
  mentions: string[];
};

export const DEFAULT_MEMO_PRESETS: MemoPresets = {
  templates: [
    {
      id: "tpl-inspect",
      label: "점검 완료",
      html: '<span class="memo-tag">#점검</span> <b>설비 점검 완료</b> — 이상 없음',
    },
    {
      id: "tpl-delay",
      label: "입고 지연",
      html: '<span class="memo-tag">#입고</span> <span class="memo-tag">#지연</span> <span style="color:#dc2626"><b>원료 입고 지연</b></span> — 사유: ',
    },
    {
      id: "tpl-urgent",
      label: "긴급",
      html: '<span class="memo-tag">#긴급</span> <span class="memo-highlight" style="background-color:#fef08a"><b>긴급 공유</b></span> — ',
    },
    {
      id: "tpl-qa",
      label: "품질 이슈",
      html: '<span class="memo-tag">#품질</span> 품질 이슈 발생 — LOT: , 조치: ',
    },
    {
      id: "tpl-todo",
      label: "할 일",
      html: '<span class="memo-check" contenteditable="false">☐</span> 할 일 1<br/><span class="memo-check" contenteditable="false">☐</span> 할 일 2',
    },
  ],
  tags: ["#긴급", "#입고", "#점검", "#지연", "#완료", "#품질"],
  mentions: ["@생산팀", "@품질관리팀", "@경영지원팀", "@경영진"],
};

export const MEMO_PRESETS_STORAGE_KEY = "beansheal_memo_presets_v1";

export function normalizeTag(raw: string): string {
  const t = raw.trim().replace(/\s+/g, "");
  if (!t) return "";
  return t.startsWith("#") ? t : `#${t}`;
}

export function normalizeMention(raw: string): string {
  const t = raw.trim().replace(/\s+/g, "");
  if (!t) return "";
  return t.startsWith("@") ? t : `@${t}`;
}

export function loadMemoPresetsFromStorage(): MemoPresets {
  if (typeof window === "undefined") return structuredClone(DEFAULT_MEMO_PRESETS);
  try {
    const raw = localStorage.getItem(MEMO_PRESETS_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_MEMO_PRESETS);
    const parsed = JSON.parse(raw);
    return sanitizePresets(parsed);
  } catch {
    return structuredClone(DEFAULT_MEMO_PRESETS);
  }
}

export function saveMemoPresetsToStorage(presets: MemoPresets) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MEMO_PRESETS_STORAGE_KEY, JSON.stringify(sanitizePresets(presets)));
}

export function sanitizePresets(input: any): MemoPresets {
  const templates: MemoTemplate[] = Array.isArray(input?.templates)
    ? input.templates
        .map((t: any, i: number) => ({
          id: String(t?.id || `tpl-${Date.now()}-${i}`),
          label: String(t?.label || "").trim() || "이름없음",
          html: String(t?.html ?? ""),
        }))
        .filter((t: MemoTemplate) => t.label)
    : structuredClone(DEFAULT_MEMO_PRESETS.templates);

  const tags = [
    ...new Set(
      (Array.isArray(input?.tags) ? input.tags : DEFAULT_MEMO_PRESETS.tags)
        .map((t: any) => normalizeTag(String(t || "")))
        .filter(Boolean)
    ),
  ];

  const mentions = [
    ...new Set(
      (Array.isArray(input?.mentions) ? input.mentions : DEFAULT_MEMO_PRESETS.mentions)
        .map((t: any) => normalizeMention(String(t || "")))
        .filter(Boolean)
    ),
  ];

  return { templates, tags, mentions };
}

export function newTemplateId() {
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 메모 HTML에서 표시용 평문 추출 (빈 값 판별용) */
export function memoPlainText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<span[^>]*class="memo-meta"[^>]*>.*?<\/span>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\u2610|\u2611/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/'/g, "&#39;");
}

export type MemoMeta = {
  pinned?: boolean;
  reminder_at?: string | null;
};

/** 본문 앞 meta 스팬에서 핀/리마인더 읽기 */
export function parseMemoMeta(html: string): MemoMeta {
  if (!html) return {};
  const m = html.match(/<span[^>]*class="memo-meta"[^>]*>/i);
  if (!m) return {};
  const tag = m[0];
  const pinned = /data-pinned="1"/i.test(tag);
  const rem = tag.match(/data-reminder="([^"]*)"/i);
  return {
    pinned,
    reminder_at: rem?.[1] ? rem[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"') : null,
  };
}

export function stripMemoMeta(html: string): string {
  return (html || "").replace(/<span[^>]*class="memo-meta"[^>]*>\s*<\/span>/gi, "");
}

/** 핀·리마인더를 HTML 앞에 심어 DB 컬럼 없이도 보존 */
export function wrapMemoMeta(html: string, meta: MemoMeta): string {
  const body = stripMemoMeta(html);
  const pinned = !!meta.pinned;
  const reminder = meta.reminder_at || "";
  if (!pinned && !reminder) return body;
  const attrs = [`class="memo-meta"`];
  if (pinned) attrs.push(`data-pinned="1"`);
  if (reminder) attrs.push(`data-reminder="${escapeAttr(reminder)}"`);
  return `<span ${attrs.join(" ")} style="display:none"></span>${body}`;
}

export function extractMemoTags(html: string): string[] {
  const plain = memoPlainText(html);
  const tags = plain.match(/#[\w가-힣]+/g) || [];
  return [...new Set(tags.map((t) => t.toLowerCase()))];
}

export function extractMemoMentions(html: string): string[] {
  const plain = memoPlainText(html);
  const mentions = plain.match(/@[\w가-힣.]+/g) || [];
  return [...new Set(mentions)];
}

const ALLOWED_TAGS = new Set([
  "B", "STRONG", "U", "I", "EM", "S", "STRIKE", "DEL",
  "BR", "DIV", "P", "SPAN", "UL", "OL", "LI", "FONT", "IMG",
]);

const ALLOWED_CLASSES = new Set([
  "memo-check",
  "memo-meta",
  "memo-mention",
  "memo-tag",
  "memo-highlight",
]);

const ALLOWED_STYLES =
  /^(color|font-weight|font-style|font-size|text-decoration|text-align|background-color)\s*:/i;

function isSafeImgSrc(src: string): boolean {
  return (
    /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(src) ||
    /^https:\/\//i.test(src)
  );
}

/** 표시용 메모 HTML 정리 (스크립트/이벤트 제거, 기존 평문 호환) */
export function sanitizeMemoHtml(raw: string): string {
  if (!raw) return "";

  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(raw);
  if (!looksLikeHtml) {
    return escapeHtml(raw).replace(/\n/g, "<br/>");
  }

  if (typeof document === "undefined") {
    return escapeHtml(raw.replace(/<[^>]*>/g, ""));
  }

  const template = document.createElement("template");
  template.innerHTML = raw;

  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toUpperCase();

        if (!ALLOWED_TAGS.has(tag)) {
          el.replaceWith(...Array.from(el.childNodes));
          continue;
        }

        const keepAttrs: { name: string; value: string }[] = [];

        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase();
          if (name.startsWith("on")) continue;

          if (name === "style") {
            const safe = attr.value
              .split(";")
              .map((s) => s.trim())
              .filter((s) => s && ALLOWED_STYLES.test(s))
              .join("; ");
            if (safe) keepAttrs.push({ name: "style", value: safe });
            continue;
          }

          if (name === "class") {
            const classes = attr.value
              .split(/\s+/)
              .filter((c) => ALLOWED_CLASSES.has(c));
            if (classes.length) keepAttrs.push({ name: "class", value: classes.join(" ") });
            continue;
          }

          if (name === "color" && tag === "FONT") {
            keepAttrs.push({ name: "color", value: attr.value });
            continue;
          }

          if (tag === "IMG") {
            if (name === "src" && isSafeImgSrc(attr.value) && attr.value.length < 400_000) {
              keepAttrs.push({ name: "src", value: attr.value });
            }
            if (name === "alt") keepAttrs.push({ name: "alt", value: attr.value.slice(0, 80) });
            if (name === "width") keepAttrs.push({ name: "width", value: attr.value.replace(/[^\d]/g, "").slice(0, 4) || "240" });
            continue;
          }

          if (el.classList.contains("memo-meta")) {
            if (name === "data-pinned" || name === "data-reminder") {
              keepAttrs.push({ name, value: attr.value });
            }
          }

          if (name === "contenteditable" && el.classList.contains("memo-check")) {
            keepAttrs.push({ name: "contenteditable", value: "false" });
          }
        }

        while (el.attributes.length) el.removeAttribute(el.attributes[0].name);
        for (const a of keepAttrs) el.setAttribute(a.name, a.value);

        if (el.classList.contains("memo-check")) {
          el.setAttribute("contenteditable", "false");
        }

        if (tag === "IMG") {
          el.style.maxWidth = "100%";
          el.style.height = "auto";
          el.style.borderRadius = "4px";
          el.style.marginTop = "4px";
          el.style.display = "block";
        }

        walk(el);
      } else if (child.nodeType === Node.COMMENT_NODE) {
        child.parentNode?.removeChild(child);
      }
    }
  };

  walk(template.content);
  return template.innerHTML;
}

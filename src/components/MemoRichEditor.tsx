"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { memoPlainText } from "@/lib/memoHtml";
import type { MemoTemplate } from "@/lib/memoPresets";

const COLORS = [
  { label: "검정", value: "#1e293b" },
  { label: "빨강", value: "#dc2626" },
  { label: "주황", value: "#ea580c" },
  { label: "초록", value: "#16a34a" },
  { label: "파랑", value: "#2563eb" },
  { label: "보라", value: "#7c3aed" },
];

const HIGHLIGHTS = [
  { label: "노랑", value: "#fef08a" },
  { label: "연두", value: "#bbf7d0" },
  { label: "하늘", value: "#bae6fd" },
  { label: "분홍", value: "#fecdd3" },
];

const FONT_SIZES = [
  { label: "S", value: "11px", title: "작게" },
  { label: "M", value: "13px", title: "보통" },
  { label: "L", value: "16px", title: "크게" },
];

type MemoRichEditorProps = {
  value: string;
  onChange: (html: string) => void;
  onSubmit?: () => void;
  onManagePresets?: () => void;
  placeholder?: string;
  minHeight?: number;
  autoFocus?: boolean;
  className?: string;
  templates?: MemoTemplate[];
  tags?: string[];
  mentions?: string[];
};

export default function MemoRichEditor({
  value,
  onChange,
  onSubmit,
  onManagePresets,
  placeholder = "메모를 입력하세요",
  minHeight = 64,
  autoFocus = false,
  className = "",
  templates = [],
  tags = [],
  mentions = [],
}: MemoRichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastEmitted = useRef(value);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // 외부 value 변경 시 동기화 + 마운트 직후 빈 에디터에 초기값 주입
    const needsSync =
      value !== lastEmitted.current ||
      (!!value && !el.innerHTML) ||
      (!value && !!el.innerHTML && lastEmitted.current !== "");
    if (needsSync) {
      el.innerHTML = value || "";
      lastEmitted.current = value;
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus) editorRef.current?.focus();
  }, [autoFocus]);

  const emitChange = () => {
    const html = editorRef.current?.innerHTML ?? "";
    lastEmitted.current = html;
    onChange(html);
  };

  const run = (command: string, commandValue?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    emitChange();
  };

  const insertHtml = (html: string) => {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    emitChange();
  };

  const applyFontSize = (size: string) => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      insertHtml(`<span style="font-size:${size}">&#8203;</span>`);
      return;
    }
    document.execCommand("fontSize", false, "3");
    const el = editorRef.current;
    if (!el) return;
    el.querySelectorAll('font[size="3"]').forEach((font) => {
      const span = document.createElement("span");
      span.style.fontSize = size;
      span.innerHTML = font.innerHTML;
      font.replaceWith(span);
    });
    emitChange();
  };

  const applyHighlight = (color: string) => {
    editorRef.current?.focus();
    try {
      document.execCommand("hiliteColor", false, color);
    } catch {
      /* ignore */
    }
    if (!document.queryCommandSupported?.("hiliteColor")) {
      document.execCommand("backColor", false, color);
    }
    emitChange();
  };

  const insertCheck = () => {
    insertHtml('<span class="memo-check" contenteditable="false">☐</span>&nbsp;');
  };

  const toggleChecksInSelection = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      let node: Node | null = sel.getRangeAt(0).startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      if (node instanceof HTMLElement && node.classList.contains("memo-check")) {
        node.textContent = node.textContent === "☑" ? "☐" : "☑";
        emitChange();
        return;
      }
    }
    insertCheck();
  };

  const insertTag = (tag: string) => {
    insertHtml(`<span class="memo-tag">${tag}</span>&nbsp;`);
  };

  const insertMention = (mention: string) => {
    insertHtml(
      `<span class="memo-mention" style="color:#2563eb;font-weight:700">${mention}</span>&nbsp;`
    );
  };

  const applyTemplate = (html: string) => {
    const el = editorRef.current;
    if (!el) return;
    const current = memoPlainText(el.innerHTML);
    if (current) {
      insertHtml(`<br/>${html}`);
    } else {
      el.innerHTML = html;
      emitChange();
    }
  };

  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      if (file.size > 2_000_000) {
        reject(new Error("이미지는 2MB 이하만 첨부할 수 있습니다."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxW = 480;
          const scale = Math.min(1, maxW / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("이미지 처리 실패"));
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        };
        img.onerror = () => reject(new Error("이미지 로드 실패"));
        img.src = String(reader.result);
      };
      reader.onerror = () => reject(new Error("파일 읽기 실패"));
      reader.readAsDataURL(file);
    });

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      insertHtml(`<img src="${dataUrl}" alt="첨부" width="240" />`);
    } catch (err: any) {
      alert(err?.message || "이미지 첨부 실패");
    }
  };

  const onEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList?.contains("memo-check")) {
      e.preventDefault();
      target.textContent = target.textContent === "☑" ? "☐" : "☑";
      emitChange();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit?.();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      run("bold");
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "u") {
      e.preventDefault();
      run("underline");
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
      e.preventDefault();
      run("italic");
    }
  };

  const empty = !memoPlainText(value);

  return (
    <div
      className={`border border-gray-300 rounded bg-white overflow-hidden focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-400 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 border-b border-gray-200 bg-gray-50">
        <ToolbarBtn title="굵게 (Ctrl+B)" onClick={() => run("bold")} className="font-extrabold">
          B
        </ToolbarBtn>
        <ToolbarBtn title="기울임 (Ctrl+I)" onClick={() => run("italic")} className="italic font-bold">
          I
        </ToolbarBtn>
        <ToolbarBtn title="밑줄 (Ctrl+U)" onClick={() => run("underline")} className="underline font-bold">
          U
        </ToolbarBtn>
        <ToolbarBtn title="취소선" onClick={() => run("strikeThrough")} className="line-through font-bold">
          S
        </ToolbarBtn>
        <span className="w-px h-4 bg-gray-300 mx-0.5" />
        {FONT_SIZES.map((s) => (
          <ToolbarBtn key={s.label} title={s.title} onClick={() => applyFontSize(s.value)}>
            {s.label}
          </ToolbarBtn>
        ))}
        <span className="w-px h-4 bg-gray-300 mx-0.5" />
        {COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={`글자 ${c.label}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run("foreColor", c.value)}
            className="w-4 h-4 rounded-sm border border-gray-300 hover:scale-110 transition-transform cursor-pointer"
            style={{ backgroundColor: c.value }}
          />
        ))}
        <span className="w-px h-4 bg-gray-300 mx-0.5" />
        {HIGHLIGHTS.map((h) => (
          <button
            key={h.value}
            type="button"
            title={`형광펜 ${h.label}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyHighlight(h.value)}
            className="w-4 h-4 rounded-sm border border-gray-300 hover:scale-110 transition-transform cursor-pointer"
            style={{ backgroundColor: h.value }}
          />
        ))}
        <span className="w-px h-4 bg-gray-300 mx-0.5" />
        <ToolbarBtn title="왼쪽 정렬" onClick={() => run("justifyLeft")}>
          왼
        </ToolbarBtn>
        <ToolbarBtn title="가운데 정렬" onClick={() => run("justifyCenter")}>
          중
        </ToolbarBtn>
        <ToolbarBtn title="글머리 기호" onClick={() => run("insertUnorderedList")}>
          •
        </ToolbarBtn>
        <ToolbarBtn title="번호 목록" onClick={() => run("insertOrderedList")}>
          1.
        </ToolbarBtn>
        <ToolbarBtn title="체크 삽입/토글" onClick={toggleChecksInSelection}>
          ☐
        </ToolbarBtn>
        <span className="w-px h-4 bg-gray-300 mx-0.5" />
        <ToolbarBtn title="이미지 첨부" onClick={() => fileRef.current?.click()}>
          🖼
        </ToolbarBtn>
        <ToolbarBtn title="서식 지우기" onClick={() => run("removeFormat")}>
          Tx
        </ToolbarBtn>
        {onManagePresets && (
          <ToolbarBtn title="템플릿/태그/멘션 관리" onClick={onManagePresets}>
            ⚙
          </ToolbarBtn>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickImage}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1 px-1.5 py-1 border-b border-gray-100 bg-white">
        <span className="text-[10px] text-gray-400 font-bold mr-0.5">템플릿</span>
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyTemplate(t.html)}
            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer font-medium"
          >
            {t.label}
          </button>
        ))}
        {templates.length === 0 && (
          <span className="text-[10px] text-gray-400">없음 — ⚙에서 등록</span>
        )}
        {onManagePresets && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onManagePresets}
            className="text-[10px] px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 cursor-pointer"
          >
            관리
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 px-1.5 py-1 border-b border-gray-100 bg-white">
        <span className="text-[10px] text-gray-400 font-bold mr-0.5">태그</span>
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertTag(tag)}
            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 hover:bg-amber-100 cursor-pointer font-bold"
          >
            {tag}
          </button>
        ))}
        <span className="text-[10px] text-gray-400 font-bold ml-1 mr-0.5">멘션</span>
        {mentions.map((m) => (
          <button
            key={m}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertMention(m)}
            className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer font-bold"
          >
            {m}
          </button>
        ))}
      </div>

      <div className="relative">
        {empty && (
          <div className="pointer-events-none absolute left-2.5 top-1.5 text-xs text-gray-400 pr-2">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          onClick={onEditorClick}
          onBlur={emitChange}
          onKeyDown={onKeyDown}
          className="px-2.5 py-1.5 text-xs text-gray-800 outline-none break-keep [&_.memo-check]:cursor-pointer [&_.memo-check]:select-none [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_img]:max-w-full"
          style={{ minHeight }}
        />
      </div>
      {onSubmit && (
        <div className="px-2 pb-1 text-[10px] text-gray-400">Ctrl/⌘ + Enter 로 등록</div>
      )}
    </div>
  );
}

function ToolbarBtn({
  title,
  onClick,
  className = "",
  children,
}: {
  title: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`min-w-[22px] h-6 px-1 rounded text-[11px] text-gray-700 hover:bg-white hover:shadow-xs border border-transparent hover:border-gray-200 cursor-pointer ${className}`}
    >
      {children}
    </button>
  );
}

"use client";

import { useMemo } from "react";
import { sanitizeMemoHtml } from "@/lib/memoHtml";

type MemoRichContentProps = {
  html: string;
  className?: string;
};

export default function MemoRichContent({ html, className = "" }: MemoRichContentProps) {
  const safe = useMemo(() => sanitizeMemoHtml(html || ""), [html]);

  return (
    <div
      className={`text-xs text-gray-800 break-keep leading-relaxed
        [&_b]:font-bold [&_strong]:font-bold [&_u]:underline [&_i]:italic [&_em]:italic
        [&_s]:line-through [&_strike]:line-through [&_del]:line-through
        [&_.memo-check]:inline [&_.memo-mention]:text-blue-600 [&_.memo-mention]:font-bold
        [&_.memo-tag]:inline-block [&_.memo-tag]:bg-amber-50 [&_.memo-tag]:text-amber-800
        [&_.memo-tag]:px-1 [&_.memo-tag]:rounded [&_.memo-tag]:font-bold [&_.memo-tag]:mr-0.5
        [&_.memo-highlight]:rounded-sm [&_.memo-meta]:hidden
        [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4
        [&_img]:max-w-full [&_img]:rounded [&_img]:my-1
        [&_p]:m-0 [&_div]:m-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

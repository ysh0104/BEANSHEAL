"use client";

import { useEffect, useState } from "react";
import type { MemoPresets, MemoTemplate } from "@/lib/memoPresets";
import {
  DEFAULT_MEMO_PRESETS,
  normalizeMention,
  normalizeTag,
  newTemplateId,
  sanitizePresets,
} from "@/lib/memoPresets";

type Tab = "templates" | "tags" | "mentions";

type MemoPresetsManagerProps = {
  open: boolean;
  presets: MemoPresets;
  onClose: () => void;
  onSave: (next: MemoPresets) => Promise<void> | void;
};

export default function MemoPresetsManager({
  open,
  presets,
  onClose,
  onSave,
}: MemoPresetsManagerProps) {
  const [tab, setTab] = useState<Tab>("templates");
  const [draft, setDraft] = useState<MemoPresets>(presets);
  const [saving, setSaving] = useState(false);
  const [editingTplId, setEditingTplId] = useState<string | null>(null);
  const [tplLabel, setTplLabel] = useState("");
  const [tplHtml, setTplHtml] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newMention, setNewMention] = useState("");
  const [editTagIdx, setEditTagIdx] = useState<number | null>(null);
  const [editTagValue, setEditTagValue] = useState("");
  const [editMentionIdx, setEditMentionIdx] = useState<number | null>(null);
  const [editMentionValue, setEditMentionValue] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(sanitizePresets(presets));
      setEditingTplId(null);
      setTab("templates");
    }
  }, [open, presets]);

  if (!open) return null;

  const startNewTemplate = () => {
    setEditingTplId("new");
    setTplLabel("");
    setTplHtml("");
  };

  const startEditTemplate = (t: MemoTemplate) => {
    setEditingTplId(t.id);
    setTplLabel(t.label);
    setTplHtml(t.html);
  };

  const saveTemplateForm = () => {
    const label = tplLabel.trim();
    if (!label) {
      alert("템플릿 이름을 입력하세요.");
      return;
    }
    if (editingTplId === "new") {
      setDraft((prev) => ({
        ...prev,
        templates: [...prev.templates, { id: newTemplateId(), label, html: tplHtml }],
      }));
    } else if (editingTplId) {
      setDraft((prev) => ({
        ...prev,
        templates: prev.templates.map((t) =>
          t.id === editingTplId ? { ...t, label, html: tplHtml } : t
        ),
      }));
    }
    setEditingTplId(null);
    setTplLabel("");
    setTplHtml("");
  };

  const deleteTemplate = (id: string) => {
    if (!confirm("이 템플릿을 삭제할까요?")) return;
    setDraft((prev) => ({
      ...prev,
      templates: prev.templates.filter((t) => t.id !== id),
    }));
    if (editingTplId === id) setEditingTplId(null);
  };

  const addTag = () => {
    const tag = normalizeTag(newTag);
    if (!tag) return;
    if (draft.tags.includes(tag)) {
      alert("이미 있는 태그입니다.");
      return;
    }
    setDraft((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    setNewTag("");
  };

  const saveEditTag = () => {
    if (editTagIdx === null) return;
    const tag = normalizeTag(editTagValue);
    if (!tag) return;
    setDraft((prev) => {
      const tags = [...prev.tags];
      tags[editTagIdx] = tag;
      return { ...prev, tags: [...new Set(tags)] };
    });
    setEditTagIdx(null);
    setEditTagValue("");
  };

  const addMention = () => {
    const mention = normalizeMention(newMention);
    if (!mention) return;
    if (draft.mentions.includes(mention)) {
      alert("이미 있는 멘션입니다.");
      return;
    }
    setDraft((prev) => ({ ...prev, mentions: [...prev.mentions, mention] }));
    setNewMention("");
  };

  const saveEditMention = () => {
    if (editMentionIdx === null) return;
    const mention = normalizeMention(editMentionValue);
    if (!mention) return;
    setDraft((prev) => {
      const mentions = [...prev.mentions];
      mentions[editMentionIdx] = mention;
      return { ...prev, mentions: [...new Set(mentions)] };
    });
    setEditMentionIdx(null);
    setEditMentionValue("");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(sanitizePresets(draft));
      onClose();
    } catch (e: any) {
      alert(e?.message || "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    if (!confirm("기본 템플릿/태그/멘션으로 되돌릴까요?")) return;
    setDraft(structuredClone(DEFAULT_MEMO_PRESETS));
    setEditingTplId(null);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">메모 빠른입력 관리</div>
            <div className="text-[10px] text-slate-300 mt-0.5">템플릿 · 태그 · 멘션 등록/수정</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white cursor-pointer"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b border-gray-200">
          {(
            [
              ["templates", "템플릿"],
              ["tags", "태그"],
              ["mentions", "멘션"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 py-2 text-xs font-bold cursor-pointer ${
                tab === key
                  ? "text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50/50"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tab === "templates" && (
            <>
              <div className="flex justify-between items-center">
                <p className="text-[11px] text-gray-500">자주 쓰는 문구를 저장해 한 번에 넣습니다.</p>
                <button
                  type="button"
                  onClick={startNewTemplate}
                  className="text-[11px] font-bold px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
                >
                  + 새 템플릿
                </button>
              </div>

              {editingTplId && (
                <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50/40 space-y-2">
                  <input
                    value={tplLabel}
                    onChange={(e) => setTplLabel(e.target.value)}
                    placeholder="템플릿 이름 (예: 점검 완료)"
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white"
                  />
                  <textarea
                    value={tplHtml}
                    onChange={(e) => setTplHtml(e.target.value)}
                    placeholder="내용 (HTML 가능: <b>굵게</b>, #태그 등)"
                    rows={4}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white font-mono"
                  />
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingTplId(null)}
                      className="text-[11px] px-2 py-1 rounded bg-gray-200 cursor-pointer"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={saveTemplateForm}
                      className="text-[11px] px-2 py-1 rounded bg-indigo-600 text-white font-bold cursor-pointer"
                    >
                      {editingTplId === "new" ? "추가" : "수정 반영"}
                    </button>
                  </div>
                </div>
              )}

              <ul className="space-y-2">
                {draft.templates.map((t) => (
                  <li
                    key={t.id}
                    className="border border-gray-200 rounded-lg p-2.5 bg-gray-50 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-gray-800">{t.label}</div>
                      <div className="text-[10px] text-gray-500 mt-1 line-clamp-2 break-all">
                        {t.html.replace(/<[^>]+>/g, " ").trim() || "(빈 내용)"}
                      </div>
                    </div>
                    <div className="shrink-0 flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEditTemplate(t)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-gray-300 cursor-pointer"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTemplate(t.id)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-rose-200 text-rose-600 cursor-pointer"
                      >
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
                {draft.templates.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-6">등록된 템플릿이 없습니다.</p>
                )}
              </ul>
            </>
          )}

          {tab === "tags" && (
            <>
              <div className="flex gap-1">
                <input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  placeholder="#긴급 또는 긴급"
                  className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5"
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="text-[11px] font-bold px-2.5 rounded bg-amber-500 text-white cursor-pointer"
                >
                  추가
                </button>
              </div>
              <ul className="space-y-1.5">
                {draft.tags.map((tag, idx) => (
                  <li
                    key={`${tag}-${idx}`}
                    className="flex items-center gap-2 border border-gray-200 rounded px-2 py-1.5 bg-gray-50"
                  >
                    {editTagIdx === idx ? (
                      <>
                        <input
                          value={editTagValue}
                          onChange={(e) => setEditTagValue(e.target.value)}
                          className="flex-1 text-xs border border-gray-300 rounded px-1.5 py-1"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={saveEditTag}
                          className="text-[10px] px-1.5 py-0.5 bg-indigo-600 text-white rounded cursor-pointer"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditTagIdx(null)}
                          className="text-[10px] px-1.5 py-0.5 bg-gray-200 rounded cursor-pointer"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-xs font-bold text-amber-800">{tag}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditTagIdx(idx);
                            setEditTagValue(tag);
                          }}
                          className="text-[10px] px-1.5 py-0.5 border border-gray-300 rounded bg-white cursor-pointer"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              tags: prev.tags.filter((_, i) => i !== idx),
                            }))
                          }
                          className="text-[10px] px-1.5 py-0.5 border border-rose-200 text-rose-600 rounded bg-white cursor-pointer"
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === "mentions" && (
            <>
              <div className="flex gap-1">
                <input
                  value={newMention}
                  onChange={(e) => setNewMention(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMention())}
                  placeholder="@생산팀 또는 생산팀"
                  className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5"
                />
                <button
                  type="button"
                  onClick={addMention}
                  className="text-[11px] font-bold px-2.5 rounded bg-blue-600 text-white cursor-pointer"
                >
                  추가
                </button>
              </div>
              <ul className="space-y-1.5">
                {draft.mentions.map((mention, idx) => (
                  <li
                    key={`${mention}-${idx}`}
                    className="flex items-center gap-2 border border-gray-200 rounded px-2 py-1.5 bg-gray-50"
                  >
                    {editMentionIdx === idx ? (
                      <>
                        <input
                          value={editMentionValue}
                          onChange={(e) => setEditMentionValue(e.target.value)}
                          className="flex-1 text-xs border border-gray-300 rounded px-1.5 py-1"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={saveEditMention}
                          className="text-[10px] px-1.5 py-0.5 bg-indigo-600 text-white rounded cursor-pointer"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditMentionIdx(null)}
                          className="text-[10px] px-1.5 py-0.5 bg-gray-200 rounded cursor-pointer"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-xs font-bold text-blue-700">{mention}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditMentionIdx(idx);
                            setEditMentionValue(mention);
                          }}
                          className="text-[10px] px-1.5 py-0.5 border border-gray-300 rounded bg-white cursor-pointer"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              mentions: prev.mentions.filter((_, i) => i !== idx),
                            }))
                          }
                          className="text-[10px] px-1.5 py-0.5 border border-rose-200 text-rose-600 rounded bg-white cursor-pointer"
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between gap-2 bg-gray-50">
          <button
            type="button"
            onClick={resetDefaults}
            className="text-[11px] text-gray-500 hover:text-gray-800 cursor-pointer"
          >
            기본값 복원
          </button>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] px-3 py-1.5 rounded bg-white border border-gray-300 cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="text-[11px] px-3 py-1.5 rounded bg-slate-800 text-white font-bold cursor-pointer disabled:opacity-60"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

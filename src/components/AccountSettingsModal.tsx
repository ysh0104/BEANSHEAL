"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { updateMyProfile } from "@/app/actions/userActions";
import { ADMIN_DEPARTMENT_OPTIONS, normalizeAdminDepartment } from "@/lib/departmentNormalize";
import { supabase } from "@/lib/supabase";

const POSITION_OPTIONS = ["사원", "주임", "과장", "팀장", "이사", "대표", "대표이사"] as const;

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function AccountSettingsModal({ open, onClose }: Props) {
  const { user, refreshUser } = useAuth();
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("생산팀");
  const [position, setPosition] = useState("사원");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setFullName(user.name || "");
    setDepartment(normalizeAdminDepartment(user.department || "생산팀"));
    setPosition(user.position === "관리자" ? "이사" : user.position || "사원");
    setMessage(null);
  }, [open, user]);

  if (!open || !user) return null;

  const handleSave = async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setMessage({ type: "error", text: "이름을 입력해 주세요." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const userId = authUser?.id || user.id;
      if (!userId) {
        setMessage({ type: "error", text: "로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요." });
        return;
      }

      const res = await updateMyProfile(userId, trimmedName, department, position);
      if (!res.success) {
        setMessage({ type: "error", text: res.message || "저장에 실패했습니다." });
        return;
      }

      if (authUser) {
        await supabase.auth.updateUser({
          data: {
            full_name: res.updated?.full_name || trimmedName,
            department: res.updated?.department || department,
            position: res.updated?.position || position,
          },
        });
      }

      await refreshUser();
      setMessage({ type: "success", text: res.message || "저장되었습니다." });
      setTimeout(() => onClose(), 600);
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">계정 정보 수정</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">이름 · 부서 · 직급을 변경할 수 있습니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">이름</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-semibold bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="홍길동"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">이메일</label>
            <input
              type="email"
              value={user.email}
              readOnly
              className="w-full border border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm font-medium bg-slate-50 dark:bg-slate-950 text-slate-500 cursor-not-allowed"
            />
            <p className="text-[10px] text-slate-400 mt-1">이메일은 관리자에게 문의해 변경할 수 있습니다.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">소속 부서</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2.5 text-sm font-semibold bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ADMIN_DEPARTMENT_OPTIONS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">직급</label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2.5 text-sm font-semibold bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {POSITION_OPTIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {message && (
            <div
              className={`px-3 py-2 rounded-xl text-xs font-bold ${
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 p-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { getAllUserProfiles, updateUserProfile, ProfileItem } from "@/app/actions/userActions";
import { formatJobTitle } from "@/context/AuthContext";

function computeRoleLocal(department: string, position: string): "ADMIN" | "QA" | "WORKER" {
  if (position === "관리자" || department.includes("경영")) return "ADMIN";
  if (department.includes("품질")) return "QA";
  return "WORKER";
}

const DEPARTMENT_OPTIONS = [
  "-",
  "생산관리",
  "생산",
  "품질관리",
  "품질",
  "자재물류",
  "자재/물류",
  "경영관리",
  "경영",
];

const POSITION_OPTIONS = [
  "관리자",
  "대표이사",
  "대표",
  "이사",
  "부장",
  "차장",
  "과장",
  "팀장",
  "주임",
  "사원",
];

const ROLE_OPTIONS: { value: "ADMIN" | "QA" | "WORKER"; label: string }[] = [
  { value: "ADMIN", label: "🛡️ ADMIN (모든 관리자 권한)" },
  { value: "QA", label: "🔬 QA (품질/생산 권한)" },
  { value: "WORKER", label: "👷 WORKER (사원/작업자 권한)" },
];

export default function UserManagementPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ id: string; type: "success" | "error"; text: string } | null>(null);

  // 수정 중인 인메모리 유저별 상태
  const [editStates, setEditStates] = useState<{ [id: string]: { department: string; position: string; role: "ADMIN" | "QA" | "WORKER" } }>({});

  const isAdmin =
    user?.role === "ADMIN" ||
    user?.department.includes("경영") ||
    user?.position === "관리자" ||
    user?.position === "대표" ||
    user?.position === "대표이사";

  const [dbStatusInfo, setDbStatusInfo] = useState<string>("Supabase DB 연결 확인 중...");

  useEffect(() => {
    loadProfiles();
  }, [user]);

  const loadProfiles = async () => {
    setLoading(true);
    let loadedData: ProfileItem[] = [];
    let dbMsg = "";

    // 1. Supabase Client DB 세션 쿼리 (가장 정확하고 직관적)
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*");

      if (error) {
        dbMsg = `Supabase DB 조회 오류: ${error.message}`;
        console.error("Supabase profiles query error:", error);
      } else if (data && data.length > 0) {
        dbMsg = `Supabase DB 'profiles' 테이블 연동 성공 (${data.length}건 수신됨)`;
        loadedData = data.map((p: any) => {
          const isTopPos = p.position === "관리자" || p.position === "대표이사" || p.position === "대표" || p.position === "이사";
          const dept = isTopPos ? "-" : (p.department || "생산");
          const r = isTopPos ? "ADMIN" : (p.role || computeRoleLocal(dept, p.position || "사원"));

          return {
            id: p.id,
            email: p.email || p.user_email || "",
            full_name: p.full_name || p.name || p.username || "사원",
            department: dept,
            position: p.position || "사원",
            role: r,
            job_title: formatJobTitle(dept, p.position || "사원"),
            updated_at: p.updated_at || p.created_at || new Date().toISOString(),
          };
        });
      } else {
        dbMsg = "Supabase DB 'profiles' 테이블이 현재 비어있음 (0건)";
      }
    } catch (e: any) {
      console.warn("Supabase profiles client fetch error:", e);
      dbMsg = `DB 연동 예외: ${e?.message || "네트워크 에러"}`;
    }

    // 2. 만약 Client DB 조회가 빈 경우 Server Action 호출
    if (loadedData.length === 0) {
      const res = await getAllUserProfiles();
      if (res.success && res.data && res.data.length > 0) {
        loadedData = res.data;
        dbMsg = `Server Action 통해 ${res.data.length}건 수신됨`;
      }
    }

    // 3. 현재 접속 유저가 DB 목록에 누락되어 있는 경우 자동으로 Supabase profiles DB에 보정 Upsert
    if (user && user.email) {
      const userExistsInDb = loadedData.some((p) => p.email.toLowerCase() === user.email.toLowerCase());
      if (!userExistsInDb) {
        const isTopPos = user.position === "관리자" || user.position === "대표이사" || user.position === "대표" || user.position === "이사";
        const selfDept = isTopPos ? "-" : (user.department || "생산관리");
        const selfRole = isTopPos ? "ADMIN" : (user.role || "ADMIN");

        const selfProfile: ProfileItem = {
          id: user.email,
          email: user.email,
          full_name: user.name,
          department: selfDept,
          position: user.position || "팀장",
          role: selfRole,
          job_title: user.jobTitle || formatJobTitle(selfDept, user.position),
          updated_at: new Date().toISOString(),
        };
        loadedData.unshift(selfProfile);

        // Supabase DB에도 자동으로 유저 데이터 세이프티 등록
        try {
          const { data: authUserData } = await supabase.auth.getUser();
          if (authUserData?.user) {
            await supabase.from("profiles").upsert({
              id: authUserData.user.id,
              email: user.email,
              full_name: user.name,
              department: selfDept,
              position: user.position || "팀장",
              role: selfRole,
              updated_at: new Date().toISOString(),
            }, { onConflict: "id" });
          }
        } catch (e) {}
      }
    }

    setProfiles(loadedData);
    setDbStatusInfo(dbMsg);

    const initialEdits: { [id: string]: { department: string; position: string; role: "ADMIN" | "QA" | "WORKER" } } = {};
    loadedData.forEach((p) => {
      initialEdits[p.id] = { department: p.department, position: p.position, role: p.role };
    });
    setEditStates(initialEdits);

    setLoading(false);
  };

  const handleSelectChange = (id: string, field: "department" | "position" | "role", value: string) => {
    setEditStates((prev) => {
      const current = prev[id] || { department: "생산", position: "사원", role: "WORKER" };
      let newDept = current.department;
      let newPos = current.position;
      let newRole = current.role;

      if (field === "position") {
        newPos = value;
        // 관리자, 대표이사, 대표, 이사는 소속 부서를 '-'로 자동 설정하고 모든 권한(ADMIN) 부여
        if (value === "관리자" || value === "대표이사" || value === "대표" || value === "이사") {
          newDept = "-";
          newRole = "ADMIN";
        } else if (newDept === "-") {
          newDept = "생산관리";
        }
      } else if (field === "department") {
        newDept = value;
      } else if (field === "role") {
        newRole = value as "ADMIN" | "QA" | "WORKER";
      }

      return {
        ...prev,
        [id]: {
          department: newDept,
          position: newPos,
          role: newRole,
        },
      };
    });
  };

  const handleSaveProfile = async (targetUser: ProfileItem) => {
    const edit = editStates[targetUser.id];
    if (!edit) return;

    setSavingId(targetUser.id);
    setStatusMsg(null);

    // 관리자/대표/이사 직급이면 부서 '-' & ADMIN 권한 고정
    let saveDept = edit.department;
    let saveRole = edit.role;
    if (edit.position === "관리자" || edit.position === "대표이사" || edit.position === "대표" || edit.position === "이사") {
      saveDept = "-";
      saveRole = "ADMIN";
    }

    const newJobTitle = formatJobTitle(saveDept, edit.position);

    // 1. Supabase DB 직접 Upsert
    let dbSuccess = false;
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: targetUser.id,
          email: targetUser.email,
          full_name: targetUser.full_name,
          department: saveDept,
          position: edit.position,
          role: saveRole,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });

      if (!error) dbSuccess = true;
    } catch (e) {}

    // 2. Server Action도 동시 실행하여 이중 보장
    const res = await updateUserProfile(targetUser.id, saveDept, edit.position, saveRole);

    if (dbSuccess || res.success) {
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === targetUser.id
            ? {
                ...p,
                department: saveDept,
                position: edit.position,
                role: saveRole,
                job_title: newJobTitle,
                updated_at: new Date().toISOString(),
              }
            : p
        )
      );

      setStatusMsg({
        id: targetUser.id,
        type: "success",
        text: `'${targetUser.full_name}' 님의 부서(${saveDept}), 직급(${edit.position}) 및 권한(${saveRole})이 성공적으로 저장되었습니다.`,
      });

      // 본인 프로필 수정 시 로컬 세션도 동기화
      if (user && targetUser.email.toLowerCase() === user.email.toLowerCase()) {
        const updatedSelf = {
          ...user,
          department: saveDept,
          position: edit.position,
          role: saveRole,
          jobTitle: newJobTitle,
        };
        localStorage.setItem("beansheal_active_user", JSON.stringify(updatedSelf));
      }

      setTimeout(() => setStatusMsg(null), 3500);
    } else {
      setStatusMsg({
        id: targetUser.id,
        type: "error",
        text: res.message || "수정 처리 중 오류가 발생했습니다.",
      });
    }

    setSavingId(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="flex items-center gap-3 text-slate-600 font-bold text-sm bg-white px-5 py-3 rounded-xl shadow-md border border-slate-200">
          <span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
          <span>사용자 프로필을 확인하는 중입니다...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-md text-center max-w-md w-full">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-lg font-extrabold text-slate-900 mb-2">로그인이 필요합니다</h2>
          <p className="text-xs text-slate-500 mb-5">
            사용자 및 권한 관리를 이용하시려면 먼저 사원 계정으로 로그인해 주세요.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer w-full"
          >
            로그인 하러 가기
          </button>
        </div>
      </div>
    );
  }

  const adminCount = profiles.filter((p) => p.role === "ADMIN").length;
  const qaCount = profiles.filter((p) => p.role === "QA").length;
  const workerCount = profiles.filter((p) => p.role === "WORKER").length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-16">
      {/* 🌟 상단 뷰포트 헤더 */}
      <div className="bg-white border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-indigo-100 text-indigo-800 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-indigo-200">
                  SYSTEM ADMINISTRATION
                </span>
                {dbStatusInfo && (
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    ⚡ {dbStatusInfo}
                  </span>
                )}
              </div>
              <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <span>👥 사용자 관리 및 부서/직책 권한 설정</span>
              </h1>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                가입된 사원의 부서와 직급을 부여하면 시스템 접근 권한(ADMIN / QA / WORKER)과 직책 타이틀이 자동 부여됩니다.
              </p>
            </div>

            <button
              onClick={loadProfiles}
              disabled={loading}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 self-start md:self-auto"
            >
              <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>목록 새로고침</span>
            </button>
          </div>

          {/* 요약 카운트 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100">
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-500">전체 사용자</span>
              <span className="text-lg font-black text-slate-900 font-mono mt-1">{profiles.length} 명</span>
            </div>
            <div className="bg-purple-50/70 border border-purple-200/70 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-purple-700">관리자 (ADMIN)</span>
              <span className="text-lg font-black text-purple-900 font-mono mt-1">{adminCount} 명</span>
            </div>
            <div className="bg-blue-50/70 border border-blue-200/70 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-blue-700">품질관리 (QA)</span>
              <span className="text-lg font-black text-blue-900 font-mono mt-1">{qaCount} 명</span>
            </div>
            <div className="bg-emerald-50/70 border border-emerald-200/70 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-emerald-700">일반실무 (WORKER)</span>
              <span className="text-lg font-black text-emerald-900 font-mono mt-1">{workerCount} 명</span>
            </div>
          </div>
        </div>
      </div>

      {/* 🌟 메인 컨텐츠 테이불 */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 mt-6">
        {/* 알림 메시지 토스트 */}
        {statusMsg && (
          <div
            className={`mb-4 p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between shadow-xs animate-fadeIn ${
              statusMsg.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-red-50 border-red-200 text-red-900"
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{statusMsg.type === "success" ? "✅" : "⚠️"}</span>
              <span>{statusMsg.text}</span>
            </div>
            <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
              ✕
            </button>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="px-5 py-4 bg-slate-50/70 border-b border-slate-200 flex justify-between items-center">
            <h2 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
              <span>가입 사원 목록 및 직책 부여</span>
            </h2>
            <span className="text-xs text-slate-500 font-medium">총 {profiles.length} 건</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">사용자 (이름 / 이메일)</th>
                  <th className="py-3 px-4">현재 화면 표시 직책</th>
                  <th className="py-3 px-4 min-w-[130px]">소속 부서 (Department)</th>
                  <th className="py-3 px-4 min-w-[120px]">직급 (Position)</th>
                  <th className="py-3 px-4 min-w-[210px]">시스템 접근 권한 (Role 지정)</th>
                  <th className="py-3 px-4">최근 수정일</th>
                  <th className="py-3 px-4 text-right">권한 부여 저장</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                      <div className="flex justify-center items-center gap-2">
                        <span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
                        <span>사용자 프로필을 로딩하는 중입니다...</span>
                      </div>
                    </td>
                  </tr>
                ) : profiles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                      가입된 사용자 프로필이 없습니다.
                    </td>
                  </tr>
                ) : (
                  profiles.map((p) => {
                    const currentEdit = editStates[p.id] || { department: p.department, position: p.position, role: p.role };
                    const isTopPos = currentEdit.position === "관리자" || currentEdit.position === "대표이사" || currentEdit.position === "대표" || currentEdit.position === "이사";
                    const displayDept = isTopPos ? "-" : currentEdit.department;
                    const displayRole = isTopPos ? "ADMIN" : currentEdit.role;
                    const isChanged =
                      currentEdit.department !== p.department || currentEdit.position !== p.position || currentEdit.role !== p.role;
                    const previewJobTitle = formatJobTitle(displayDept, currentEdit.position);
                    const isSelf = user?.email === p.email;

                    return (
                      <tr key={p.id} className={`hover:bg-slate-50/80 transition-colors ${isSelf ? "bg-amber-50/30" : ""}`}>
                        {/* 이름 / 이메일 */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-slate-900 text-xs">{p.full_name}</span>
                              {isSelf && (
                                <span className="text-[10px] font-extrabold bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded">
                                  나(본인)
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono">{p.email}</span>
                          </div>
                        </td>

                        {/* 현재 직책 */}
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                            {previewJobTitle}
                          </span>
                        </td>

                        {/* 부서 선택 */}
                        <td className="py-3.5 px-4">
                          <select
                            value={displayDept}
                            onChange={(e) => handleSelectChange(p.id, "department", e.target.value)}
                            disabled={isTopPos}
                            className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-500"
                          >
                            {DEPARTMENT_OPTIONS.map((dept) => (
                              <option key={dept} value={dept}>
                                {dept}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* 직급 선택 */}
                        <td className="py-3.5 px-4">
                          <select
                            value={currentEdit.position}
                            onChange={(e) => handleSelectChange(p.id, "position", e.target.value)}
                            className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none cursor-pointer"
                          >
                            {POSITION_OPTIONS.map((pos) => (
                              <option key={pos} value={pos}>
                                {pos}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* 수동 권한 부여 (Role 선택 Dropdown) */}
                        <td className="py-3.5 px-4">
                          <select
                            value={displayRole}
                            onChange={(e) => handleSelectChange(p.id, "role", e.target.value)}
                            disabled={isTopPos}
                            className={`w-full text-xs font-extrabold border rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none cursor-pointer disabled:bg-purple-50 disabled:text-purple-900 ${
                              displayRole === "ADMIN"
                                ? "text-purple-900 border-purple-300 bg-purple-50/50"
                                : displayRole === "QA"
                                ? "text-blue-900 border-blue-300 bg-blue-50/50"
                                : "text-emerald-900 border-emerald-300 bg-emerald-50/50"
                            }`}
                          >
                            {ROLE_OPTIONS.map((rOpt) => (
                              <option key={rOpt.value} value={rOpt.value}>
                                {rOpt.label}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* 최근 수정일 */}
                        <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                          {p.updated_at ? p.updated_at.split("T")[0] : "-"}
                        </td>

                        {/* 저장 버튼 */}
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleSaveProfile(p)}
                            disabled={savingId === p.id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer shadow-2xs ${
                              isChanged
                                ? "bg-indigo-600 hover:bg-indigo-700 text-white animate-pulse"
                                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                            } disabled:opacity-50`}
                          >
                            {savingId === p.id ? "저장 중..." : isChanged ? "권한 변경 저장" : "저장됨"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

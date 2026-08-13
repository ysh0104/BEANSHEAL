"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { getAllUserProfiles, updateUserProfile, deleteUserProfile, ProfileItem } from "@/app/actions/userActions";
import { formatJobTitle } from "@/context/AuthContext";
import PermissionGroupsPanel from "@/components/PermissionGroupsPanel";
import {
  listPermissionGroups,
  assignUserPermissionGroup,
} from "@/app/actions/permissionActions";
import type { PermissionGroupRecord } from "@/lib/permissions";
import { canUserEdit } from "@/hooks/useCanEdit";
import {
  listEcountUsers,
  syncEcountUsersFromApi,
  upsertEcountUserManual,
  bulkUpsertEcountUsersManual,
  bulkUpsertEcountUserRows,
  updateEcountMapping,
  type EcountUserRecord,
} from "@/app/actions/ecountUserMapping";
import { createProfileForSchedule } from "@/app/actions/scheduleRosterActions";
import { profileDeptToScheduleGroup } from "@/lib/departmentNormalize";
import { parseEcountUsersExcel } from "@/utils/ecountUsersExcel";

const DEPARTMENT_OPTIONS = [
  "생산팀",
  "품질관리팀",
  "영업팀",
  "경영지원팀",
  "경영진",
] as const;

function computeRoleLocal(department: string, _position: string): "ADMIN" | "QA" | "WORKER" {
  if (department.includes("경영")) return "ADMIN";
  if (department.includes("품질")) return "QA";
  return "WORKER";
}

/** 기존 부서명을 새 4개 체계로 맞춤 */
function normalizeDepartment(dept: string): string {
  const d = (dept || "").trim();
  if (!d || d === "-") return "경영진";
  if ((DEPARTMENT_OPTIONS as readonly string[]).includes(d)) return d;
  if (d.includes("경영진")) return "경영진";
  if (d.includes("경영지원") || d.includes("경영관리") || d === "경영") return "경영지원팀";
  if (d.includes("품질")) return "품질관리팀";
  if (d.includes("영업")) return "영업팀";
  if (d.includes("자재") || d.includes("물류") || d.includes("생산")) return "생산팀";
  return "생산팀";
}

/** 레거시 '관리자' 직급 → 이사 로 치환 */
function normalizePosition(position: string): string {
  const p = (position || "사원").trim();
  if (p === "관리자") return "이사";
  return p || "사원";
}

const POSITION_OPTIONS = [
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

export default function UserManagementPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const isAdmin =
    user?.role === "ADMIN" ||
    user?.department?.includes("경영") ||
    user?.position === "관리자" ||
    user?.position === "대표" ||
    user?.position === "대표이사";

  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ id: string; type: "success" | "error"; text: string } | null>(null);

  // 수정 중인 인메모리 유저별 상태
  const [editStates, setEditStates] = useState<{
    [id: string]: {
      department: string;
      position: string;
      role: "ADMIN" | "QA" | "WORKER";
      permission_group_id: string | null;
      ecount_user_id: string;
    };
  }>({});
  const [permGroups, setPermGroups] = useState<PermissionGroupRecord[]>([]);
  const [ecountUsers, setEcountUsers] = useState<EcountUserRecord[]>([]);
  const [ecountSyncMsg, setEcountSyncMsg] = useState<string | null>(null);
  const [ecountSyncing, setEcountSyncing] = useState(false);
  const [ecountBulkOpen, setEcountBulkOpen] = useState(false);
  const [ecountBulkText, setEcountBulkText] = useState("");
  const [ecountBulkSaving, setEcountBulkSaving] = useState(false);
  const [ecountExcelImporting, setEcountExcelImporting] = useState(false);
  const ecountExcelInputRef = useRef<HTMLInputElement>(null);
  const [permPanelOpen, setPermPanelOpen] = useState(false);

  const canManagePerms =
    canUserEdit(user, "admin_users") ||
    user?.role === "ADMIN" ||
    !!user?.department?.includes("경영");

  const [dbStatusInfo, setDbStatusInfo] = useState<string>("Supabase DB 연결 확인 중...");

  const loadEcountUsers = async () => {
    const res = await listEcountUsers();
    if (res.success) setEcountUsers(res.data);
  };

  useEffect(() => {
    loadProfiles();
    loadEcountUsers();
    (async () => {
      const res = await listPermissionGroups();
      if (res.success) setPermGroups(res.data);
    })();
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
          const pos = normalizePosition(p.position || "사원");
          const dept = normalizeDepartment(p.department || "생산팀");
          const r = (p.role as "ADMIN" | "QA" | "WORKER") || computeRoleLocal(dept, pos);

          return {
            id: p.id,
            email: p.email || p.user_email || "",
            full_name: p.full_name || p.name || p.username || "사원",
            department: dept,
            position: pos,
            role: r,
            job_title: formatJobTitle(dept, pos),
            updated_at: p.updated_at || p.created_at || new Date().toISOString(),
            permission_group_id: p.permission_group_id || null,
            ecount_user_id: p.ecount_user_id || null,
            ecount_emp_cd: p.ecount_emp_cd || null,
            ecount_user_name: p.ecount_user_name || null,
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
        const selfPos = normalizePosition(user.position || "팀장");
        const selfDept = normalizeDepartment(user.department || "생산팀");
        const selfRole = (user.role as "ADMIN" | "QA" | "WORKER") || computeRoleLocal(selfDept, selfPos);

        const selfProfile: ProfileItem = {
          id: user.email,
          email: user.email,
          full_name: user.name,
          department: selfDept,
          position: selfPos,
          role: selfRole,
          job_title: user.jobTitle || formatJobTitle(selfDept, selfPos),
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
              position: selfPos,
              role: selfRole,
              updated_at: new Date().toISOString(),
            }, { onConflict: "id" });
          }
        } catch (e) {}
      }
    }

    setProfiles(loadedData);
    setDbStatusInfo(dbMsg);

    const initialEdits: {
      [id: string]: {
        department: string;
        position: string;
        role: "ADMIN" | "QA" | "WORKER";
        permission_group_id: string | null;
        ecount_user_id: string;
      };
    } = {};
    loadedData.forEach((p) => {
      initialEdits[p.id] = {
        department: p.department,
        position: p.position,
        role: p.role,
        permission_group_id: p.permission_group_id || null,
        ecount_user_id: p.ecount_user_id || "",
      };
    });
    setEditStates(initialEdits);

    setLoading(false);
  };

  const handleSelectChange = (
    id: string,
    field: "department" | "position" | "role" | "permission_group_id" | "ecount_user_id",
    value: string
  ) => {
    setEditStates((prev) => {
      const current = prev[id] || {
        department: "생산팀",
        position: "사원",
        role: "WORKER" as const,
        permission_group_id: null,
        ecount_user_id: "",
      };
      let newDept = current.department;
      let newPos = current.position;
      let newRole = current.role;
      let newGroupId = current.permission_group_id;
      let newEcountId = current.ecount_user_id;

      if (field === "position") {
        newPos = normalizePosition(value);
      } else if (field === "department") {
        newDept = normalizeDepartment(value);
      } else if (field === "role") {
        newRole = value as "ADMIN" | "QA" | "WORKER";
      } else if (field === "permission_group_id") {
        newGroupId = value || null;
      } else if (field === "ecount_user_id") {
        newEcountId = value;
      }

      return {
        ...prev,
        [id]: {
          department: newDept,
          position: newPos,
          role: newRole,
          permission_group_id: newGroupId,
          ecount_user_id: newEcountId,
        },
      };
    });
  };

  const handleSyncEcountUsers = async () => {
    setEcountSyncing(true);
    setEcountSyncMsg(null);
    const res = await syncEcountUsersFromApi();
    setEcountSyncMsg(res.message || (res.success ? "동기화 완료" : "동기화 실패"));
    await loadEcountUsers();
    setEcountSyncing(false);
  };

  const handleAddEcountUserManual = async () => {
    const userId = prompt("이카운트 로그인 ID (예: BEANSHEAL 또는 사원ID)");
    if (!userId?.trim()) return;
    const userName = prompt("표시 이름 (선택)", "") || userId.trim();
    const res = await upsertEcountUserManual({
      user_id: userId.trim(),
      emp_cd: userId.trim(),
      user_name: userName.trim(),
    });
    if (!res.success) {
      alert(res.message || "등록 실패");
      return;
    }
    await loadEcountUsers();
    setEcountSyncMsg(`이카운트 사용자 '${userId.trim()}' 등록됨`);
  };

  const handleBulkEcountUsers = async () => {
    if (!ecountBulkText.trim()) {
      alert("등록할 ID 목록을 입력하세요.");
      return;
    }
    setEcountBulkSaving(true);
    const res = await bulkUpsertEcountUsersManual(ecountBulkText);
    setEcountBulkSaving(false);
    if (!res.success) {
      alert(res.message || "일괄 등록 실패");
      return;
    }
    await loadEcountUsers();
    setEcountSyncMsg(res.message || "일괄 등록 완료");
    setEcountBulkText("");
    setEcountBulkOpen(false);
  };

  const handleEcountExcelUpload = async (file: File | null) => {
    if (!file) return;
    setEcountExcelImporting(true);
    setEcountSyncMsg(null);
    try {
      const { rows, sheetName } = await parseEcountUsersExcel(file);
      const res = await bulkUpsertEcountUserRows(rows);
      if (!res.success) {
        alert(res.message || "엑셀 등록 실패");
        setEcountSyncMsg(res.message || "엑셀 등록 실패");
        return;
      }
      await loadEcountUsers();
      setEcountSyncMsg(
        res.message ||
          `「${sheetName}」시트에서 이카운트 사용자 ${res.count}명을 등록했습니다.`
      );
      setEcountBulkOpen(false);
    } catch (e: any) {
      const msg = e?.message || "엑셀을 읽지 못했습니다.";
      alert(msg);
      setEcountSyncMsg(msg);
    } finally {
      setEcountExcelImporting(false);
      if (ecountExcelInputRef.current) ecountExcelInputRef.current.value = "";
    }
  };

  // 사원 신규 추가 모달 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDept, setAddDept] = useState("생산팀");
  const [addPos, setAddPos] = useState("사원");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAddEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) {
      alert("사원 이름을 입력해 주세요.");
      return;
    }

    setIsAdding(true);
    const name = addName.trim();
    const dept = addDept;
    const pos = addPos;
    const scheduleGroup = profileDeptToScheduleGroup(dept);

    // ⚡ 0초 초고속 낙관적 UI 즉시 등록
    const tempId = `temp_${Date.now()}`;
    const newJobTitle = formatJobTitle(dept, pos);
    const tempProfile: ProfileItem = {
      id: tempId,
      email: `staff.${Date.now()}@beansheal.com`,
      full_name: name,
      department: dept,
      position: pos,
      role: computeRoleLocal(dept, pos),
      job_title: newJobTitle,
      updated_at: new Date().toISOString(),
    };

    setProfiles((prev) => [tempProfile, ...prev]);
    setEditStates((prev) => ({
      ...prev,
      [tempId]: {
        department: dept,
        position: pos,
        role: computeRoleLocal(dept, pos),
        permission_group_id: null,
        ecount_user_id: "",
      },
    }));

    setIsAddModalOpen(false);
    setAddName("");

    setStatusMsg({
      id: tempId,
      type: "success",
      text: `'${name}' 사원이 추가되었습니다.`,
    });

    // 백그라운드 DB 등록
    const res = await createProfileForSchedule(name, scheduleGroup, pos);
    if (res.success && res.profile) {
      const realId = res.profile.id;
      setProfiles((prev) =>
        prev.map((p) => (p.id === tempId ? { ...p, id: realId } : p))
      );
      setEditStates((prev) => {
        const copy = { ...prev };
        if (copy[tempId]) {
          copy[realId] = copy[tempId];
          delete copy[tempId];
        }
        return copy;
      });
    }
    setIsAdding(false);
  };

  const handleDeleteEmployee = async (targetUser: ProfileItem) => {
    if (!confirm(`'${targetUser.full_name}' (${targetUser.email || targetUser.job_title}) 사원을 삭제하시겠습니까?`)) {
      return;
    }

    setDeletingId(targetUser.id);

    // ⚡ 0초 초고속 낙관적 UI 즉시 삭제
    setProfiles((prev) => prev.filter((p) => p.id !== targetUser.id));
    setEditStates((prev) => {
      const copy = { ...prev };
      delete copy[targetUser.id];
      return copy;
    });

    setStatusMsg({
      id: targetUser.id,
      type: "success",
      text: `'${targetUser.full_name}' 사원이 삭제되었습니다.`,
    });

    // 백그라운드 DB 및 Auth 삭제
    await deleteUserProfile(targetUser.id);
    setDeletingId(null);
  };

  const handleSaveProfile = async (targetUser: ProfileItem) => {
    const edit = editStates[targetUser.id];
    if (!edit) return;

    setSavingId(targetUser.id);
    setStatusMsg(null);

    const savePos = normalizePosition(edit.position);
    const saveDept = normalizeDepartment(edit.department);
    const saveRole = edit.role;

    const newJobTitle = formatJobTitle(saveDept, savePos);

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
          position: savePos,
          role: saveRole,
          permission_group_id: edit.permission_group_id || null,
          ecount_user_id: edit.ecount_user_id || null,
          include_in_work_schedule: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });

      if (!error) dbSuccess = true;
      else {
        // permission_group_id 컬럼 없을 수 있음 → 컬럼 없이 재시도
        const { error: e2 } = await supabase
          .from("profiles")
          .upsert({
            id: targetUser.id,
            email: targetUser.email,
            full_name: targetUser.full_name,
            department: saveDept,
            position: savePos,
            role: saveRole,
            updated_at: new Date().toISOString(),
          }, { onConflict: "id" });
        if (!e2) dbSuccess = true;
      }
    } catch (e) {}

    // 2. Server Action도 동시 실행하여 이중 보장
    const res = await updateUserProfile(targetUser.id, saveDept, savePos, saveRole);
    await assignUserPermissionGroup(targetUser.id, edit.permission_group_id || null);

    const matchedEcount = ecountUsers.find((e) => e.user_id === edit.ecount_user_id);
    const mapRes = await updateEcountMapping(targetUser.id, {
      ecount_user_id: edit.ecount_user_id || null,
      ecount_emp_cd: matchedEcount?.emp_cd || edit.ecount_user_id || null,
      ecount_user_name: matchedEcount?.user_name || null,
    });

    const groupName = permGroups.find((g) => g.id === edit.permission_group_id)?.name || "미배정";
    const ecountLabel = edit.ecount_user_id
      ? matchedEcount
        ? `${matchedEcount.user_name} (${matchedEcount.user_id})`
        : edit.ecount_user_id
      : "미연결";

    if (dbSuccess || res.success) {
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === targetUser.id
            ? {
                ...p,
                department: saveDept,
                position: savePos,
                role: saveRole,
                job_title: newJobTitle,
                permission_group_id: edit.permission_group_id || null,
                ecount_user_id: edit.ecount_user_id || null,
                ecount_emp_cd: matchedEcount?.emp_cd || edit.ecount_user_id || null,
                ecount_user_name: matchedEcount?.user_name || null,
                updated_at: new Date().toISOString(),
              }
            : p
        )
      );

      setStatusMsg({
        id: targetUser.id,
        type: mapRes.success === false ? "error" : "success",
        text: mapRes.success === false
          ? mapRes.message || "이카운트 매칭 저장 실패 (마이그레이션 확인)"
          : `'${targetUser.full_name}' 저장 — 권한그룹(${groupName}) / 이카운트(${ecountLabel})`,
      });

      // 본인 프로필 수정 시 로컬 세션도 동기화
      if (user && targetUser.email.toLowerCase() === user.email.toLowerCase()) {
        const updatedSelf = {
          ...user,
          department: saveDept,
          position: savePos,
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
        <div className="flex items-center gap-3 text-slate-600 font-bold text-sm bg-white px-5 py-3 rounded-xl shadow-xs border border-slate-200">
          <span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
          <span>사용자 프로필을 확인하는 중입니다...</span>
        </div>
      </div>
    );
  }

  if (!user || !canManagePerms) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="bg-white border border-rose-200 p-8 rounded-2xl shadow-md text-center max-w-md w-full">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            🔒
          </div>
          <h2 className="text-lg font-extrabold text-slate-900 mb-2">접근 제한</h2>
          <p className="text-xs text-slate-600 leading-relaxed mb-6">
            시스템 사용자 및 부서/직책 권한 설정 페이지는 <strong className="text-rose-600 font-bold">ADMIN 권한</strong> 또는 <strong className="text-slate-900 font-bold">경영지원팀·경영진</strong> 계정으로만 접근하실 수 있습니다.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => router.push("/workspace")}
              className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer w-full"
            >
              메인 워크스페이스로 이동
            </button>
            {!user && (
              <button
                onClick={() => router.push("/login")}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-5 py-2.5 rounded-xl transition-colors cursor-pointer w-full border border-slate-200"
              >
                로그인
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const adminCount = profiles.filter((p) => p.role === "ADMIN").length;
  const qaCount = profiles.filter((p) => p.role === "QA").length;
  const workerCount = profiles.filter((p) => p.role === "WORKER").length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-16">
      {/* 상단 헤더 */}
      <div className="bg-white border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-slate-200 uppercase tracking-wider">
                  SYSTEM ADMINISTRATION
                </span>
                {dbStatusInfo && (
                  <span className="text-[11px] font-normal text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                    {dbStatusInfo}
                  </span>
                )}
              </div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>사용자 · 권한 그룹 관리</span>
              </h1>
              <p className="text-xs text-slate-500 mt-1 font-normal">
                권한 그룹·이카운트 매칭과 함께 사원 목록이 대시보드 스케줄표와 자동 동기화됩니다.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={handleAddEmployee}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-xs cursor-pointer"
            >
              + 사원 추가
            </button>
            <button
              onClick={loadProfiles}
              disabled={loading}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 self-start md:self-auto"
            >
              <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>목록 새로고침</span>
            </button>
            </div>
          </div>

          {/* 무채색 깔끔한 요약 카운트 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-slate-500">전체 사용자</span>
              <span className="text-lg font-bold text-slate-900 font-mono mt-1">{profiles.length} 명</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-slate-600">ADMIN 권한</span>
              <span className="text-lg font-bold text-slate-900 font-mono mt-1">{adminCount} 명</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-slate-600">품질관리 (QA)</span>
              <span className="text-lg font-bold text-slate-900 font-mono mt-1">{qaCount} 명</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-slate-600">일반실무 (WORKER)</span>
              <span className="text-lg font-bold text-slate-900 font-mono mt-1">{workerCount} 명</span>
            </div>
          </div>
        </div>
      </div>

      {/* 메인 데이터 테이블 */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 mt-6 space-y-6">
        {/* 무채색 깔끔한 알림 메시지 토스트 */}
        {statusMsg && (
          <div className="mb-4 p-3.5 rounded-xl border border-slate-300 bg-slate-900 text-white text-xs font-medium flex items-center justify-between shadow-xs animate-fadeIn">
            <span>{statusMsg.text}</span>
            <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-white cursor-pointer ml-3">
              ✕
            </button>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-sm text-slate-800">가입 사원 · 이카운트 매칭</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Google 계정 ↔ 이카운트 로그인 ID 연결. OpenAPI는 사원 목록 조회를 지원하지 않아{" "}
                <span className="font-semibold text-slate-700">EMM001M 엑셀 업로드·붙여넣기·수동 등록</span> 후
                드롭다운·직접입력으로 매칭합니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={ecountExcelInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => handleEcountExcelUpload(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={() => ecountExcelInputRef.current?.click()}
                disabled={!canManagePerms || ecountExcelImporting}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
              >
                {ecountExcelImporting ? "엑셀 등록 중…" : "엑셀 업로드"}
              </button>
              <button
                type="button"
                onClick={() => setEcountBulkOpen((v) => !v)}
                disabled={!canManagePerms}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 cursor-pointer disabled:opacity-50"
              >
                {ecountBulkOpen ? "붙여넣기 닫기" : "붙여넣기 등록"}
              </button>
              <button
                type="button"
                onClick={handleAddEcountUserManual}
                disabled={!canManagePerms}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-white cursor-pointer disabled:opacity-50"
              >
                + ID 수동 등록
              </button>
              <button
                type="button"
                onClick={handleSyncEcountUsers}
                disabled={!canManagePerms || ecountSyncing}
                title="이카운트 OpenAPI는 사원 목록 API 미제공 — 대부분 EXP00001로 실패합니다"
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                {ecountSyncing ? "시도 중…" : "OpenAPI 동기화 시도"}
              </button>
              <span className="text-xs text-slate-500 font-normal">총 {profiles.length} 건</span>
            </div>
          </div>
          {ecountSyncMsg && (
            <div className="px-5 py-2 text-[11px] border-b border-slate-100 bg-amber-50 text-amber-900">
              {ecountSyncMsg}
            </div>
          )}
          {ecountBulkOpen && (
            <div className="px-5 py-3 border-b border-slate-100 bg-emerald-50/60 space-y-2">
              <p className="text-[11px] text-emerald-900">
                이카운트 「사용자등록(EMM001M)」 엑셀은 위{" "}
                <span className="font-semibold">엑셀 업로드</span>로 바로 등록할 수 있습니다.
                또는 ID·이름을 복사해 붙여넣으세요. 한 줄에{" "}
                <code className="font-mono bg-white/80 px-1 rounded">ID, 이름, 부서(선택)</code> — 탭·쉼표 구분.
              </p>
              <textarea
                value={ecountBulkText}
                onChange={(e) => setEcountBulkText(e.target.value)}
                disabled={!canManagePerms || ecountBulkSaving}
                rows={5}
                placeholder={"hwalang, 임화랑, 경영지원\nsyeeun, 성예은\njsun4you, 정선영, 영업"}
                className="w-full text-xs font-mono border border-emerald-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:opacity-60"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleBulkEcountUsers}
                  disabled={!canManagePerms || ecountBulkSaving}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer disabled:opacity-50"
                >
                  {ecountBulkSaving ? "등록 중…" : "목록에 등록"}
                </button>
                <span className="text-[11px] text-emerald-800 self-center">
                  등록 후 각 사원 행의 「이카운트 매칭」에서 선택 → 저장
                </span>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Google 사용자</th>
                  <th className="py-3 px-4">표시 직책</th>
                  <th className="py-3 px-4 min-w-[120px]">부서</th>
                  <th className="py-3 px-4 min-w-[100px]">직급</th>
                  <th className="py-3 px-4 min-w-[140px]">권한 그룹</th>
                  <th className="py-3 px-4 min-w-[200px]">이카운트 매칭</th>
                  <th className="py-3 px-4">최근 수정</th>
                  <th className="py-3 px-4 text-right">저장</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-normal">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                      <div className="flex justify-center items-center gap-2">
                        <span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
                        <span>사용자 프로필을 로딩하는 중입니다...</span>
                      </div>
                    </td>
                  </tr>
                ) : profiles.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                      가입된 사용자 프로필이 없습니다.
                    </td>
                  </tr>
                ) : (
                  profiles.map((p) => {
                    const currentEdit = editStates[p.id] || {
                      department: p.department,
                      position: p.position,
                      role: p.role,
                      permission_group_id: p.permission_group_id || null,
                      ecount_user_id: p.ecount_user_id || "",
                    };
                    const isChanged =
                      currentEdit.department !== p.department ||
                      currentEdit.position !== p.position ||
                      currentEdit.role !== p.role ||
                      (currentEdit.permission_group_id || null) !== (p.permission_group_id || null) ||
                      (currentEdit.ecount_user_id || "") !== (p.ecount_user_id || "");
                    const previewJobTitle = formatJobTitle(currentEdit.department, currentEdit.position);
                    const isSelf = user?.email === p.email;
                    const ecountFreeText =
                      currentEdit.ecount_user_id &&
                      !ecountUsers.some((e) => e.user_id === currentEdit.ecount_user_id);

                    return (
                      <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${isSelf ? "bg-slate-50/90" : ""}`}>
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 text-xs">{p.full_name}</span>
                              {isSelf && (
                                <span className="text-[10px] font-semibold bg-slate-200 text-slate-800 px-1.5 py-0.2 rounded border border-slate-300">
                                  본인
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono font-normal">{p.email}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                            {previewJobTitle}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <select
                            value={currentEdit.department}
                            onChange={(e) => handleSelectChange(p.id, "department", e.target.value)}
                            className="w-full text-xs font-normal border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none cursor-pointer"
                          >
                            {DEPARTMENT_OPTIONS.map((dept) => (
                              <option key={dept} value={dept}>
                                {dept}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3.5 px-4">
                          <select
                            value={normalizePosition(currentEdit.position)}
                            onChange={(e) => handleSelectChange(p.id, "position", e.target.value)}
                            className="w-full text-xs font-normal border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none cursor-pointer"
                          >
                            {POSITION_OPTIONS.map((pos) => (
                              <option key={pos} value={pos}>
                                {pos}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3.5 px-4">
                          <select
                            value={currentEdit.permission_group_id || ""}
                            onChange={(e) => handleSelectChange(p.id, "permission_group_id", e.target.value)}
                            disabled={!canManagePerms}
                            className="w-full text-xs font-bold border border-indigo-200 rounded-lg px-2.5 py-1.5 bg-indigo-50 text-indigo-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer disabled:opacity-60"
                          >
                            <option value="">미배정 (자동)</option>
                            {permGroups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3.5 px-4">
                          <select
                            value={currentEdit.ecount_user_id || ""}
                            onChange={(e) => handleSelectChange(p.id, "ecount_user_id", e.target.value)}
                            disabled={!canManagePerms}
                            className="w-full text-xs font-bold border border-emerald-200 rounded-lg px-2.5 py-1.5 bg-emerald-50 text-emerald-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none cursor-pointer disabled:opacity-60"
                          >
                            <option value="">미연결</option>
                            {ecountFreeText && (
                              <option value={currentEdit.ecount_user_id}>
                                {currentEdit.ecount_user_id} (직접입력)
                              </option>
                            )}
                            {ecountUsers.map((e) => (
                              <option key={e.user_id} value={e.user_id}>
                                {e.user_name} ({e.user_id})
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="또는 ID 직접 입력"
                            value={currentEdit.ecount_user_id}
                            onChange={(e) => handleSelectChange(p.id, "ecount_user_id", e.target.value)}
                            disabled={!canManagePerms}
                            className="mt-1 w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1 font-mono disabled:bg-slate-50"
                          />
                        </td>

                        {/* 최근 수정일 */}
                        <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px] font-normal">
                          {p.updated_at ? p.updated_at.split("T")[0] : "-"}
                        </td>

                        {/* 저장 & 삭제 버튼 */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSaveProfile(p)}
                              disabled={savingId === p.id}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                                isChanged
                                  ? "bg-slate-900 hover:bg-slate-800 text-white animate-pulse"
                                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                              } disabled:opacity-50`}
                            >
                              {savingId === p.id ? "저장 중..." : isChanged ? "권한 변경 저장" : "저장됨"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEmployee(p)}
                              disabled={deletingId === p.id}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all cursor-pointer disabled:opacity-50"
                              title="사원 삭제"
                            >
                              {deletingId === p.id ? "삭제 중..." : "삭제"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 권한 그룹 설정 — 접기/펼치기 */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setPermPanelOpen((v) => !v)}
            className="w-full px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 text-left hover:bg-slate-100/80 transition-colors cursor-pointer"
            aria-expanded={permPanelOpen}
          >
            <div>
              <h2 className="font-bold text-sm text-slate-800">권한 그룹 설정</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                메뉴별 조회/수정 권한을 그룹 단위로 만들고 편집합니다. ({permGroups.length}개 그룹)
              </p>
            </div>
            <span
              className={`shrink-0 text-slate-500 text-xs font-bold transition-transform ${permPanelOpen ? "rotate-180" : ""}`}
              aria-hidden
            >
              ▼
            </span>
          </button>
          {permPanelOpen && (
            <div className="p-4 md:p-5 border-t border-slate-100">
              <PermissionGroupsPanel canManage={canManagePerms} onGroupsChange={setPermGroups} />
            </div>
          )}
        </div>
      </div>

      {/* 🌟 사원 신규 등록 초고속 모달 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <span>👤</span>
                <span>신규 사원 추가</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddEmployeeSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  사원 이름 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="예: 홍길동"
                  className="w-full text-xs border border-slate-300 rounded-xl px-3.5 py-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">부서</label>
                  <select
                    value={addDept}
                    onChange={(e) => setAddDept(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none cursor-pointer"
                  >
                    {DEPARTMENT_OPTIONS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">직급</label>
                  <select
                    value={addPos}
                    onChange={(e) => setAddPos(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none cursor-pointer"
                  >
                    {POSITION_OPTIONS.map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isAdding ? "등록 중..." : "등록하기"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  FEATURE_CATALOG,
  emptyPermissionMap,
  type PermissionGroupRecord,
  type PermissionMap,
  type FeatureKey,
} from "@/lib/permissions";
import {
  listPermissionGroups,
  createPermissionGroup,
  updatePermissionGroup,
  deletePermissionGroup,
} from "@/app/actions/permissionActions";

type Props = {
  canManage: boolean;
  onGroupsChange?: (groups: PermissionGroupRecord[]) => void;
};

export default function PermissionGroupsPanel({ canManage, onGroupsChange }: Props) {
  const [groups, setGroups] = useState<PermissionGroupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftFeatures, setDraftFeatures] = useState<PermissionMap>(emptyPermissionMap(true, false));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await listPermissionGroups();
    if (res.success) {
      setGroups(res.data);
      onGroupsChange?.(res.data);
      if (!selectedId && res.data[0]) {
        selectGroup(res.data[0]);
      } else if (selectedId) {
        const found = res.data.find((g) => g.id === selectedId);
        if (found) selectGroup(found);
      }
    } else {
      setMsg(res.message || "권한 그룹을 불러오지 못했습니다. Supabase에 마이그레이션을 실행했는지 확인하세요.");
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectGroup = (g: PermissionGroupRecord) => {
    setSelectedId(g.id);
    setDraftName(g.name);
    setDraftDesc(g.description);
    setDraftFeatures({ ...g.features });
    setMsg(null);
  };

  const toggleFeature = (key: FeatureKey, field: "can_view" | "can_edit") => {
    if (!canManage) return;
    setDraftFeatures((prev) => {
      const next = { ...prev, [key]: { ...prev[key] } };
      next[key][field] = !next[key][field];
      // 수정 켜면 조회도 자동 ON
      if (field === "can_edit" && next[key].can_edit) next[key].can_view = true;
      // 조회 끄면 수정도 OFF
      if (field === "can_view" && !next[key].can_view) next[key].can_edit = false;
      return next;
    });
  };

  const handleCreate = async () => {
    if (!canManage) return;
    const name = prompt("새 권한 그룹 이름");
    if (!name?.trim()) return;
    setSaving(true);
    const res = await createPermissionGroup({
      name: name.trim(),
      description: "",
      features: emptyPermissionMap(true, false),
    });
    setSaving(false);
    if (!res.success) {
      alert(res.message || "생성 실패");
      return;
    }
    await load();
    if (res.data) selectGroup(res.data);
  };

  const handleSave = async () => {
    if (!canManage || !selectedId) return;
    setSaving(true);
    const res = await updatePermissionGroup(selectedId, {
      name: draftName,
      description: draftDesc,
      features: draftFeatures,
    });
    setSaving(false);
    if (!res.success) {
      setMsg(res.message || "저장 실패");
      return;
    }
    setMsg("권한 그룹이 저장되었습니다.");
    await load();
  };

  const handleDelete = async () => {
    if (!canManage || !selectedId) return;
    const g = groups.find((x) => x.id === selectedId);
    if (!g || g.is_system) {
      alert("시스템 기본 그룹은 삭제할 수 없습니다.");
      return;
    }
    if (!confirm(`'${g.name}' 그룹을 삭제할까요? 배정된 사용자는 그룹 미배정이 됩니다.`)) return;
    setSaving(true);
    const res = await deletePermissionGroup(selectedId);
    setSaving(false);
    if (!res.success) {
      alert(res.message || "삭제 실패");
      return;
    }
    setSelectedId(null);
    await load();
  };

  const selected = groups.find((g) => g.id === selectedId);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">권한 그룹 설정</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            이카운트처럼 그룹을 만들고, 메뉴별 조회/수정 권한을 체크한 뒤 사원에게 배정합니다.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 cursor-pointer disabled:opacity-50"
          >
            + 새 그룹
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-400">불러오는 중…</div>
      ) : (
        <div className="grid md:grid-cols-[200px_1fr] min-h-[320px]">
          <div className="border-r border-slate-200 bg-slate-50/50 p-2 space-y-1 max-h-[420px] overflow-y-auto">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => selectGroup(g)}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  selectedId === g.id
                    ? "bg-indigo-600 text-white"
                    : "text-slate-700 hover:bg-white border border-transparent hover:border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span>{g.name}</span>
                  {g.is_system && (
                    <span className={`text-[9px] font-medium ${selectedId === g.id ? "text-indigo-100" : "text-slate-400"}`}>
                      기본
                    </span>
                  )}
                </div>
              </button>
            ))}
            {groups.length === 0 && (
              <p className="text-[11px] text-slate-400 p-2">
                그룹이 없습니다. Supabase SQL에서 permission_groups 마이그레이션을 실행하세요.
              </p>
            )}
          </div>

          <div className="p-4 space-y-3">
            {!selected ? (
              <p className="text-xs text-slate-400">왼쪽에서 그룹을 선택하세요.</p>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500">그룹 이름</label>
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      disabled={!canManage || selected.is_system}
                      className="w-full mt-0.5 text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500">설명</label>
                    <input
                      value={draftDesc}
                      onChange={(e) => setDraftDesc(e.target.value)}
                      disabled={!canManage}
                      className="w-full mt-0.5 text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 disabled:bg-slate-100"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="text-left px-3 py-2 font-bold">기능 / 메뉴</th>
                        <th className="text-center px-2 py-2 font-bold w-20">조회</th>
                        <th className="text-center px-2 py-2 font-bold w-20">수정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FEATURE_CATALOG.map((f) => (
                        <tr key={f.key} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            <div className="font-bold text-slate-800">{f.label}</div>
                            <div className="text-[10px] text-slate-400">{f.description}</div>
                          </td>
                          <td className="text-center">
                            <input
                              type="checkbox"
                              checked={!!draftFeatures[f.key]?.can_view}
                              onChange={() => toggleFeature(f.key, "can_view")}
                              disabled={!canManage}
                              className="cursor-pointer"
                            />
                          </td>
                          <td className="text-center">
                            <input
                              type="checkbox"
                              checked={!!draftFeatures[f.key]?.can_edit}
                              onChange={() => toggleFeature(f.key, "can_edit")}
                              disabled={!canManage}
                              className="cursor-pointer"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {msg && <p className="text-[11px] text-emerald-700 font-medium">{msg}</p>}

                {canManage && (
                  <div className="flex justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={saving || selected.is_system}
                      className="text-[11px] px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-40"
                    >
                      그룹 삭제
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer disabled:opacity-50"
                    >
                      {saving ? "저장 중…" : "권한 저장"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

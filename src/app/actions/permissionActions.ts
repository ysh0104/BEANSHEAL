'use server'

import { createClient } from '@supabase/supabase-js';
import {
  ALL_FEATURE_KEYS,
  DEFAULT_GROUP_SEEDS,
  featuresFromRows,
  fullPermissionMap,
  inferGroupNameFromProfile,
  type FeatureKey,
  type PermissionGroupRecord,
  type PermissionMap,
} from '@/lib/permissions';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'placeholder-key';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function rowsFromFeatures(groupId: string, features: PermissionMap) {
  return ALL_FEATURE_KEYS.map((key) => ({
    group_id: groupId,
    feature_key: key,
    can_view: !!features[key]?.can_view,
    can_edit: !!features[key]?.can_edit,
  }));
}

async function loadGroupFeatures(groupId: string): Promise<PermissionMap> {
  const { data } = await supabase
    .from('permission_group_features')
    .select('feature_key, can_view, can_edit')
    .eq('group_id', groupId);
  return featuresFromRows(data || []);
}

/** 기본 그룹이 없으면 시드 */
export async function ensureDefaultPermissionGroups() {
  try {
    const { data: existing, error } = await supabase.from('permission_groups').select('id, name');
    if (error) {
      return { success: false as const, message: error.message };
    }

    const names = new Set((existing || []).map((g) => g.name));
    for (const seed of DEFAULT_GROUP_SEEDS) {
      if (names.has(seed.name)) continue;
      const { data: created, error: cErr } = await supabase
        .from('permission_groups')
        .insert({
          name: seed.name,
          description: seed.description,
          is_system: seed.is_system,
        })
        .select('id')
        .single();
      if (cErr || !created) continue;
      await supabase.from('permission_group_features').upsert(rowsFromFeatures(created.id, seed.features));
    }
    return { success: true as const };
  } catch (e: any) {
    return { success: false as const, message: e?.message || '시드 실패' };
  }
}

export async function listPermissionGroups(): Promise<{
  success: boolean;
  message?: string;
  data: PermissionGroupRecord[];
}> {
  try {
    await ensureDefaultPermissionGroups();

    const { data: groups, error } = await supabase
      .from('permission_groups')
      .select('*')
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });

    if (error) {
      return { success: false, message: error.message, data: [] };
    }

    const result: PermissionGroupRecord[] = [];
    for (const g of groups || []) {
      const features = await loadGroupFeatures(g.id);
      result.push({
        id: g.id,
        name: g.name,
        description: g.description || '',
        is_system: !!g.is_system,
        features,
      });
    }
    return { success: true, data: result };
  } catch (e: any) {
    return { success: false, message: e?.message || '조회 오류', data: [] };
  }
}

export async function createPermissionGroup(input: {
  name: string;
  description?: string;
  features?: PermissionMap;
}) {
  try {
    const name = (input.name || '').trim();
    if (!name) return { success: false, message: '그룹 이름을 입력하세요.' };

    const features = input.features || fullPermissionMap();
    const { data, error } = await supabase
      .from('permission_groups')
      .insert({
        name,
        description: input.description || '',
        is_system: false,
      })
      .select('*')
      .single();

    if (error || !data) {
      return { success: false, message: error?.message || '생성 실패' };
    }

    await supabase.from('permission_group_features').upsert(rowsFromFeatures(data.id, features));
    return {
      success: true,
      data: {
        id: data.id,
        name: data.name,
        description: data.description || '',
        is_system: false,
        features,
      } as PermissionGroupRecord,
    };
  } catch (e: any) {
    return { success: false, message: e?.message || '생성 오류' };
  }
}

export async function updatePermissionGroup(
  id: string,
  input: { name?: string; description?: string; features?: PermissionMap }
) {
  try {
    const patch: any = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.description !== undefined) patch.description = input.description;

    const { error } = await supabase.from('permission_groups').update(patch).eq('id', id);
    if (error) return { success: false, message: error.message };

    if (input.features) {
      await supabase.from('permission_group_features').delete().eq('group_id', id);
      await supabase.from('permission_group_features').upsert(rowsFromFeatures(id, input.features));
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || '수정 오류' };
  }
}

export async function deletePermissionGroup(id: string) {
  try {
    const { data: g } = await supabase
      .from('permission_groups')
      .select('is_system, name')
      .eq('id', id)
      .maybeSingle();

    if (g?.is_system) {
      return { success: false, message: '시스템 기본 그룹은 삭제할 수 없습니다.' };
    }

    // 배정된 사용자는 NULL 처리 (FK ON DELETE SET NULL)
    const { error } = await supabase.from('permission_groups').delete().eq('id', id);
    if (error) return { success: false, message: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || '삭제 오류' };
  }
}

export async function assignUserPermissionGroup(userId: string, groupId: string | null) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        permission_group_id: groupId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || '배정 오류' };
  }
}

/** 로그인 사용자 권한맵 로드 */
export async function getUserPermissionMap(userId: string): Promise<{
  success: boolean;
  groupId: string | null;
  groupName: string | null;
  permissions: PermissionMap;
  message?: string;
}> {
  try {
    await ensureDefaultPermissionGroups();

    const { data: profile } = await supabase
      .from('profiles')
      .select('permission_group_id, department, role')
      .eq('id', userId)
      .maybeSingle();

    let groupId = profile?.permission_group_id || null;

    // 미배정이면 부서/역할로 기본 그룹 자동 연결
    if (!groupId && profile) {
      const inferred = inferGroupNameFromProfile(profile.department || '', profile.role || 'WORKER');
      const { data: g } = await supabase
        .from('permission_groups')
        .select('id, name')
        .eq('name', inferred)
        .maybeSingle();
      if (g) {
        groupId = g.id;
        await supabase
          .from('profiles')
          .update({ permission_group_id: g.id })
          .eq('id', userId);
      }
    }

    if (!groupId) {
      // ADMIN role fallback
      if (profile?.role === 'ADMIN') {
        return {
          success: true,
          groupId: null,
          groupName: '전체관리자(역할)',
          permissions: fullPermissionMap(),
        };
      }
      return {
        success: true,
        groupId: null,
        groupName: null,
        permissions: featuresFromRows([]),
      };
    }

    const { data: group } = await supabase
      .from('permission_groups')
      .select('id, name')
      .eq('id', groupId)
      .maybeSingle();

    const permissions = await loadGroupFeatures(groupId);
    return {
      success: true,
      groupId,
      groupName: group?.name || null,
      permissions,
    };
  } catch (e: any) {
    return {
      success: false,
      groupId: null,
      groupName: null,
      permissions: featuresFromRows([]),
      message: e?.message,
    };
  }
}

export async function getProfilesWithGroups() {
  try {
    await ensureDefaultPermissionGroups();
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, department, position, role, permission_group_id, updated_at')
      .order('updated_at', { ascending: false });

    if (error) return { success: false, message: error.message, data: [] };
    return { success: true, data: data || [] };
  } catch (e: any) {
    return { success: false, message: e?.message || '조회 오류', data: [] };
  }
}

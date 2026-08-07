-- 워크스페이스 권한 세분화: workspace → schedule_mgmt, memo, work_schedule, weekly_plan

INSERT INTO public.permission_group_features (group_id, feature_key, can_view, can_edit)
SELECT
  pgf.group_id,
  split.key,
  pgf.can_view,
  pgf.can_edit
FROM public.permission_group_features pgf
CROSS JOIN (
  VALUES
    ('schedule_mgmt'),
    ('memo'),
    ('work_schedule'),
    ('weekly_plan')
) AS split(key)
WHERE pgf.feature_key = 'workspace'
ON CONFLICT (group_id, feature_key) DO NOTHING;

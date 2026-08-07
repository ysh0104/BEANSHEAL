-- 워크스페이스 메모 템플릿 / 태그 / 멘션 공용 설정

CREATE TABLE IF NOT EXISTS public.memo_presets (
  id TEXT PRIMARY KEY DEFAULT 'workspace',
  templates JSONB DEFAULT '[]'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  mentions JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.memo_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for service role on memo_presets" ON public.memo_presets;
CREATE POLICY "Enable all access for service role on memo_presets"
ON public.memo_presets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Enable read access for all on memo_presets" ON public.memo_presets;
CREATE POLICY "Enable read access for all on memo_presets"
ON public.memo_presets
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Enable write access for all on memo_presets" ON public.memo_presets;
CREATE POLICY "Enable write access for all on memo_presets"
ON public.memo_presets
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

INSERT INTO public.memo_presets (id, templates, tags, mentions)
VALUES (
  'workspace',
  '[
    {"id":"tpl-inspect","label":"점검 완료","html":"<span class=\"memo-tag\">#점검</span> <b>설비 점검 완료</b> — 이상 없음"},
    {"id":"tpl-delay","label":"입고 지연","html":"<span class=\"memo-tag\">#입고</span> <span class=\"memo-tag\">#지연</span> <span style=\"color:#dc2626\"><b>원료 입고 지연</b></span> — 사유: "},
    {"id":"tpl-urgent","label":"긴급","html":"<span class=\"memo-tag\">#긴급</span> <span class=\"memo-highlight\" style=\"background-color:#fef08a\"><b>긴급 공유</b></span> — "},
    {"id":"tpl-qa","label":"품질 이슈","html":"<span class=\"memo-tag\">#품질</span> 품질 이슈 발생 — LOT: , 조치: "},
    {"id":"tpl-todo","label":"할 일","html":"<span class=\"memo-check\" contenteditable=\"false\">☐</span> 할 일 1<br/><span class=\"memo-check\" contenteditable=\"false\">☐</span> 할 일 2"}
  ]'::jsonb,
  '["#긴급","#입고","#점검","#지연","#완료","#품질"]'::jsonb,
  '["@생산팀","@품질팀","@관리팀","@영업팀"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

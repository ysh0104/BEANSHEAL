# 📑 BEANSHEAL ERP 품질 서류 템플릿 및 매핑 관리 매뉴얼

이 문서는 빈스힐 ERP 시스템의 품질 서류 템플릿 파일(.docx / .hwpx)과 매핑 규칙을 쉽게 추가하고 수정하는 방법을 안내합니다.

---

## 1. 📂 템플릿 폴더 구조 (`public/templates/`)

서류 양식 파일은 아래 카테고리 폴더 중 알맞은 곳에 넣어두시면 됩니다.

```
public/templates/
├── 01_raw/                 # 🧪 원료 관련 서류 템플릿
│   ├── qc_raw_liquid_log.docx          (원료 액상 시험일지)
│   ├── qc_raw_liquid_instruction.docx  (원료 액상 시험지시 및 기록서)
│   ├── qc_raw_liquid_report.docx       (원료 액상 시험결과보고서)
│   ├── qc_raw_powder_log.docx          (원료 분말 시험일지)
│   ├── qc_raw_powder_instruction.docx  (원료 분말 시험지시 및 기록서)
│   └── qc_raw_powder_report.docx       (원료 분말 시험결과보고서)
│
├── 02_sub/                 # 📦 부자재 관련 서류 템플릿
│   ├── qc_sub_pouch_log.docx           (부자재 파우치 시험일지)
│   ├── qc_sub_singlebox_log.docx       (부자재 단상자 시험일지)
│   └── qc_sub_cartonbox_log.docx       (부자재 카톤박스 시험일지)
│
├── 03_semi/                # ☕ 반제품 관련 서류 템플릿
│   ├── qc_semi_liquid_log.docx         (반제품 액상 시험일지)
│   └── qc_semi_liquid_request.docx     (반제품 시험의뢰서)
│
├── 04_product/             # 🏷️ 완제품 관련 서류 템플릿
│   ├── qc_product_default_log.docx     (완제품 시험일지)
│   └── qc_product_default_request.docx (완제품 시험의뢰서)
│
└── 00_common/              # 📌 공통 서류 템플릿
    └── qc_label.docx                   (품질관리표시서)
```

---

## 2. ⚙️ 매핑 사전 수정 방법 (`src/config/qcTemplateMap.json`)

새로운 품목 유형이나 특정 원료명(비타민C, 타우린 등)을 지정하려면 `src/config/qcTemplateMap.json` 파일을 열어 수정하시면 됩니다.

```json
{
  "description": "BEANSHEAL ERP 품질 서류 템플릿 매핑 설정 파일",
  "itemMapping": {
    "비타민C": "원료_분말",
    "비타민D3": "원료_액상",
    "타우린": "원료_분말",
    "구연산": "원료_분말",
    "늙은호박 농축액": "원료_액상"
  },
  "prefixMap": {
    "원료_액상": "qc_raw_liquid",
    "원료_분말": "qc_raw_powder",
    "부자재_파우치": "qc_sub_pouch",
    "부자재_단상자": "qc_sub_singlebox",
    "부자재_카톤박스": "qc_sub_cartonbox",
    "반제품_액상": "qc_semi_liquid",
    "완제품_기본": "qc_product_default"
  },
  "docNameMap": {
    "log": "시험일지",
    "instruction": "시험지시_및_기록서",
    "report": "시험결과보고서",
    "label": "품질관리표시서",
    "request": "시험의뢰서"
  }
}
```

### 💡 특정 원료명(비타민C 등) 지정 추가 예시:
`비타민C`처럼 이름만으로 액상/분말 구분이 어려운 원료는 `itemMapping`에 적어두시면 됩니다:
- `"비타민C": "원료_분말"` 한 줄 추가 -> 서류 발급 시 100% 원료 분말 양식(`qc_raw_powder`)으로 연결됩니다!

### 💡 새로운 양식 추가 예시:
예를 들어 `포장재_스티커`라는 새로운 부자재 양식을 추가하고 싶을 때:
1. `public/templates/02_sub/` 폴더에 `qc_sub_sticker_log.docx` 파일 넣기.
2. `src/config/qcTemplateMap.json` 파일의 `prefixMap`에 `"부자재_스티커": "qc_sub_sticker"` 한 줄 추가하기.
3. 소스 코드를 건드리지 않아도 시스템이 자동으로 새 양식을 감지하여 발급합니다!

---

## 3. 📝 템플릿 파일 치환 치환자 목록

양식 파일(.docx / .hwpx) 내부에 아래 치환자 변수를 적어두시면 시스템 데이터가 자동으로 채워집니다:

| 치환자 변수명 | 설명 | 출력 데이터 예시 |
|---|---|---|
| `{{제품명}}` / `{{품명}}` | 제품/원료명 | 늙은호박 농축액 |
| `{{LOT번호}}` | LOT 번호 | 260724Q2 |
| `{{시험번호}}` | 유기농 구분 연산 시험번호 | 260724Q2 / 260724Q2u |
| `{{시험일자}}` / `{{오늘날짜}}` | 서류 출력일자 | 2026-08-06 |
| `{{제조일자}}` | 제조년월일 | 2026-07-24 |
| `{{완료예정일}}` | 완료 예정일 (당일 + 3일) | 2026-08-09 |
| `{{수량}}` / `{{제조수량}}` | 수량 | 500 kg |
| `{{규격}}` | 제품 대괄호 규격 | 20kg/드럼 |
| `{{제조번호}}` | 제조번호 | 260724Q2 |

# EQA customer source data

Canonical file: **`EQA_v1.xlsx`**

- Hospital universe = first sheet `EQA信息表` **visible** rows only.
  Excel AutoFilter hides rows with `26年EQA标签 = '/'` (~1073); those are excluded.
  Visible set ≈ **364** (matches `省考客户` scale).
- Import/prune skip AutoFilter-hidden rows and empty/`/` tags.
- Sheets `国考客户` / `省考客户` supply EQA participation facts for hospitals already
  on the visible sheet-1 set; they must not introduce new hospitals.
- `eqa-customers.xlsx` is a legacy alias; prefer `EQA_v1.xlsx`.

Ops:
- Import: `scripts/eqa_xlsx_import.py` / `run-eqa-xlsx-import-on-ecs.sh`
- Prune extras: `scripts/prune_hospitals_to_eqa_sheet1.py` / `run-prune-hospitals-on-ecs.sh`

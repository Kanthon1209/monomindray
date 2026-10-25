# EQA customer source data

Canonical file: **`EQA_v1.xlsx`**

- Hospital universe = **first sheet** `EQA信息表` only (customer_code + name + region/branch + tags).
- Sheets `国考客户` / `省考客户` supply EQA participation facts for hospitals already on sheet 1; they must not introduce new hospitals.
- `eqa-customers.xlsx` is a legacy alias of the same sheet-1 set; prefer `EQA_v1.xlsx`.

Ops:
- Import: `scripts/eqa_xlsx_import.py` / `run-eqa-xlsx-import-on-ecs.sh`
- Prune extras (demo seeds, short-code duplicates): `scripts/prune_hospitals_to_eqa_sheet1.py` / `run-prune-hospitals-on-ecs.sh`

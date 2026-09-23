# 业务数据模型（看板采集）

目标：采集员录入医院 / 设备 / 客户 / 案例 → 汇聚到数据看板（地图 + 筛选 + 清单）。

## ER 关系

```text
users
  │ created_by / collected_by
  ▼
hospitals ──< devices
    │            │
    │            └──< cases (optional device_id)
    ├──< customers
    └──< cases
```

## 表说明

### `hospitals`（医院主数据）

看板核心实体。`province` 必须与前端地图 GeoJSON 省份名一致（如 `广东省`、`内蒙古自治区`）。

| 字段 | 说明 |
|------|------|
| level | `三级甲等` / `三级乙等` / `二级甲等` / `二级乙等` / `一级` |
| type | `综合医院` / `专科医院` / `中医医院` / `妇幼保健院` |
| status | `active` 运营中 / `pending` 待确认 / `inactive` 停用 |
| created_by | 录入人（采集员） |
| archive | JSONB，对齐《化免客户档案》Excel 扩展字段（大区/分公司/机型/标本量/质控等） |

唯一约束：`(name, province, city)` 防重复建档。

`archive` 常用键：`branchOffice`、`customerCode`、`contactName`、`contactPhone`、`enabledAt`、`usageLocation`、`projectCount`、`mindrayReagentCount`、`matchingRate`、`otherAnalyzers`、`mindraySampleVolume`、`totalSampleVolume`、`qcVendor`、`qcLevels`、`qcCycle`、`reagentSupplier`、`mindrayProjects`、`newProjects`、`unusedProjects`、`missingProjects`、`archiveRemark`。

区域（华北/华东…）**不落库**，由省份映射得出（与现前端 `provinceRegionMap` 一致）。

### `devices`（设备）

挂在医院下；看板「设备型号 / 开展装置」筛选走此表。

| 字段 | 说明 |
|------|------|
| category | `biochem` 生化 / `immuno` 免疫 / `hematology` 血液 / `coag` 凝血 / `urine` 尿沉渣 |
| model | 如 `BS-2000M`、`CL-8000` |
| status | `active` / `inactive` / `maintenance` |

医院列表上的 `deviceCount` / `deviceModels` 由设备表聚合（见视图）。

### `customers`（客户联系人）

可选挂靠医院，对应「客户管理」页。

### `cases`（案例）

产品应用价值案例，对应「案例维护」。

| 字段 | 说明 |
|------|------|
| status | `draft` 草稿 / `submitted` 已提交 / `approved` 已通过 / `rejected` 已驳回 |
| collected_by / collected_at | 采集人、采集时间 |

## 视图

### `v_hospital_dashboard`

医院 + 在用设备数量 + 去重型号数组，供看板列表直接查询，避免前端再拼装。

## API（已实现）

| 能力 | 路径 |
|------|------|
| 医院 CRUD | `/api/v1/hospitals` |
| 设备 CRUD | `/api/v1/hospitals/:id/devices`、`/api/v1/devices/:id` |
| 客户 CRUD | `/api/v1/customers` |
| 案例 CRUD | `/api/v1/cases` |
| 看板聚合 | `/api/v1/dashboard/hospitals`、`/api/v1/dashboard/provinces` |

## 迁移文件

- `001_create_users.sql` — 用户
- `002_user_status.sql` — 用户审核状态（存量库）
- `003_create_business_tables.sql` — 本模型
- `004_seed_demo.sql` — 演示数据（医院/设备/客户/案例）
- `005_hospital_archive.sql` — 化免档案 archive JSONB + 演示回填
- `006_anhui_city_seed.sql` — 安徽地市演示医院
- `007_surveys.sql` — 问卷模板/发放/任务/答卷 + 化免种子模板 `immuno_archive_v1`

迁移由 [goose](https://github.com/pressly/goose) 管理（文件含 `-- +goose Up/Down`）。  
存量库与空库均通过 `scripts/goose-up.sh` 应用；`docker-entrypoint-initdb.d` 仅作全新 volume 的兜底。

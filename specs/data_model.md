# 业务数据模型（看板采集）

目标：采集员按医院任务录入装机/竞品等结构化数据 → 汇聚到数据看板（地图 + 筛选 + 清单）。

## ER 关系

```text
users
  │
  ▼
hospitals ──< devices
    │
    ├──< customers (contacts)
    ├── hospital_attributes / hospital_metrics
    ├── hospital_assays → assay_projects
    ├── hospital_supplies → suppliers
    ├── hospital_role_assignments → org_staff
    └── archive（过渡缓冲）

survey_templates → survey_campaigns
       → survey_assignments (assignee × hospital)
            → survey_submissions
```

问卷审核发布双写：医院列 + archive（兼容）+ attributes / metrics / assays / supplies / roles。
模板 target 支持 `hospital.*`、`hospital.attributes.*`、`hospital.metrics.*`、`hospital.archive.*`、`devices[]`。

案例（cases）已移除。

## 表说明

### `hospitals`（医院主数据）

看板核心实体。`province` 必须与前端地图 GeoJSON 省份名一致（如 `广东省`、`内蒙古自治区`）。

| 字段 | 说明 |
|------|------|
| level | `三级甲等` / `三级乙等` / `二级甲等` / `二级乙等` / `一级` |
| type | `综合医院` / `专科医院` / `中医医院` / `妇幼保健院` |
| status | `active` 运营中 / `pending` 待确认 / `inactive` 停用 |
| created_by | 录入人（采集员） |
| archive | JSONB，对齐《2024年化免客户档案》三张表全部列；支持标量 / 字符串数组 / 对象数组 |

唯一约束：`(name, province, city)` 防重复建档。

#### `archive` 约定（可查询）

**化学发光（标量）**：`region`、`branchOffice`、`customerName`、`customerCode`、`customerLevel`、`model`、`serialNo`、`contactName`、`contactPhone`、`installedAt`、`enabledAt`、`annualRevenue`、`usageLocation`、`projectCount`、`mindrayReagentCount`、`matchingRate`、`otherAnalyzers`、`mindraySampleVolume`、`totalSampleVolume`、`qcVendor`、`qcLevels`、`qcCycle`、`reagentSupplier`、`unusedProjects`、`missingProjects`、`archiveRemark`。

**结构化（统计友好）**：

| 键 | 形态 | 说明 |
|----|------|------|
| `mindrayProjects` | `string[]` | 如 `["AFP","CEA","CA125"]` |
| `newProjects` | `string[]` | 主导新增项目 |
| `competitorProjectDistribution` | `object[]` | `{line,brand,instrument,projects[],note}` |

**SVIP / 双大（标量）**：`svipLevel`、`dualMajorCustomer`、`groupName`、`volumeDirection`、`iotStock23`、`iotForecast24`、`iotIncrement24`、`iotGrowthRate24`、责任人工号字段、`dualMajorType`、`dualMajorTarget`、产出目标、`competitorDevicesProjects`、`mindrayDevicesProjectsVolume`、`supplyChannel`、`labDirector`、`workContact`、`customerSegment`、`segmentCategory` 等。

查询示例：

```sql
-- 按迈瑞项目覆盖医院数
SELECT project_name, COUNT(DISTINCT hospital_id)
FROM hospital_project_items
WHERE kind = 'mindray' AND project_name <> ''
GROUP BY project_name ORDER BY 2 DESC;

-- archive JSON 直查
SELECT name, archive->'mindrayProjects'
FROM hospitals
WHERE archive @> '{"svipLevel":"SVIP1"}';
```

### `hospital_project_items`（项目展开表）

从 `mindrayProjects` / `competitorProjectDistribution` 同步展开，便于按项目名、品牌、产线 `GROUP BY`。写入/更新医院档案时由后端自动刷新。

| 字段 | 说明 |
|------|------|
| kind | `mindray` / `competitor` |
| line_category | 生化 / 发光 / 凝血 等 |
| brand / instrument / project_name | 品牌、仪器、项目名 |

区域（华北/华东…）仍可由省份映射得出；安徽市内大区可写在 `archive.region`。

### `devices`（设备）

挂在医院下；看板「设备型号 / 开展装置」筛选走此表。

| 字段 | 说明 |
|------|------|
| category | `biochem` 生化 / `immuno` 免疫 / `hematology` 血液 / `coag` 凝血 / `urine` 尿沉渣 |
| model | 如 `BS-2000M`、`CL-8000` |
| status | `active` / `inactive` / `maintenance` |

医院列表上的 `deviceCount` / `deviceModels` 由设备表聚合（见视图）。问卷「化学发光」模板中的 `devices[]` 审核通过后 upsert 到此表。

### `customers`（客户联系人）

可选挂靠医院，对应「客户管理」页。

## 视图

### `v_hospital_dashboard`

医院 + 在用设备数量 + 去重型号数组，供看板列表直接查询，避免前端再拼装。

## API（已实现）

| 能力 | 路径 |
|------|------|
| 医院 CRUD | `/api/v1/hospitals` |
| 设备 CRUD | `/api/v1/hospitals/:id/devices`、`/api/v1/devices/:id` |
| 客户 CRUD | `/api/v1/customers` |
| 问卷模板/发放/任务/审核 | `/api/v1/surveys/*`、`/api/v1/me/survey-assignments/*` |
| 看板聚合 | `/api/v1/dashboard/hospitals`、`/api/v1/dashboard/provinces` |

## 迁移文件

- `001_create_users.sql` — 用户
- `002_user_status.sql` — 用户审核状态（存量库）
- `003_create_business_tables.sql` — 本模型
- `004_seed_demo.sql` — 演示数据（医院/设备/客户）
- `005_hospital_archive.sql` — 化免档案 archive JSONB + 演示回填
- `006_anhui_city_seed.sql` — 安徽地市演示医院
- `007_surveys.sql` — 问卷模板/发放/任务/答卷 + 化免种子模板 `immuno_archive_v1`
- `008_campaign_defaults.sql` — 发放默认值 / 锁定字段
- `009_archive_project_items.sql` — 全表列可查询约定、项目展开表、GIN 索引
- `010_drop_cases.sql` — 删除案例表
- `011_survey_assignment_hospital.sql` — 任务绑定医院 + `chemilum_device_v1` 层级模板

迁移由 [goose](https://github.com/pressly/goose) 管理（文件含 `-- +goose Up/Down`）。  
存量库与空库均通过 `scripts/goose-up.sh` 应用；`docker-entrypoint-initdb.d` 仅作全新 volume 的兜底。

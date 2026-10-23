#!/usr/bin/env python3
"""Conflict-safe EQA xlsx import via admin HTTP API (no direct DB).

Hospitals + eqa_participation(+items). dual_major written when possible via
POST create then a best-effort attributes path; if API has no attributes
endpoint, emits SQL snippet for hospital_attributes dual_major only.

Re-run safe:
  - hospital match by normalized customer_code; fill empty code/region/branch only
  - create participation; on 409 merge items client-side (union, keep existing values)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any, Optional

import openpyxl

YEAR = 2026
META = {"区域", "分公司", "客户编码", "客户名称", "责任人", "26年EQA标签", "26年是否双大"}


def norm_ws(s: Any) -> str:
    if s is None:
        return ""
    t = str(s).replace("\n", "").replace("\r", "").strip()
    return re.sub(r"\s+", " ", t)


def norm_label(s: str) -> str:
    return re.sub(r"\s+", "", norm_ws(s))


def norm_code(s: Any) -> str:
    t = norm_ws(s)
    if not t:
        return ""
    if t.isdigit():
        x = t.lstrip("0")
        return x if x else "0"
    return t


def store_code(s: Any) -> str:
    return norm_ws(s)


def city_from_branch(branch: str) -> str:
    b = norm_ws(branch)
    if b.endswith("分公司"):
        b = b[: -len("分公司")].strip()
    if not b:
        return "合肥市"
    if b.endswith(("市", "地区", "州", "县")):
        return b
    return b + "市"


def parse_dual(v: Any) -> Optional[str]:
    t = norm_ws(v)
    if not t or t in {"#N/A", "N/A", "/", "-", "—", "无", "否", "0"}:
        return None
    if t in {"是", "是双大", "1", "Y", "y"} or "双大" in t:
        return "是"
    return None


def parse_tag(v: Any) -> Optional[str]:
    t = norm_ws(v)
    if not t or t in {"/", "-", "—", "#N/A"}:
        return None
    return t


class API:
    def __init__(self, base: str, token: str):
        self.base = base.rstrip("/")
        self.token = token

    def _req(self, method: str, path: str, body: Any = None, timeout: int = 60) -> tuple[int, Any]:
        data = None
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/json"}
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode()
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode()
                return resp.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read().decode() if e.fp else ""
            try:
                parsed = json.loads(raw) if raw else {"msg": raw}
            except Exception:
                parsed = {"msg": raw}
            return e.code, parsed

    def login(self, email: str, password: str) -> None:
        code, data = self._req("POST", "/api/v1/auth/login", {"email": email, "password": password})
        if code != 200 or not data or "token" not in data:
            raise SystemExit(f"login failed {code} {data}")
        self.token = data["token"]

    def list_hospitals(self) -> list[dict]:
        items = []
        page = 1
        total = None
        while True:
            code, data = self._req("GET", f"/api/v1/hospitals?page={page}&pageSize=200")
            if code != 200:
                raise SystemExit(f"list hospitals {code} {data}")
            batch = data.get("items") or []
            items.extend(batch)
            total = data.get("total")
            if not batch or (total is not None and len(items) >= total):
                break
            page += 1
        return items

    def get_hospital(self, hid: int) -> dict:
        code, data = self._req("GET", f"/api/v1/hospitals/{hid}")
        if code != 200:
            raise RuntimeError(f"get hospital {hid}: {code} {data}")
        return data["hospital"]

    def create_hospital(self, body: dict) -> tuple[int, Any]:
        return self._req("POST", "/api/v1/hospitals", body)

    def update_hospital(self, hid: int, body: dict) -> tuple[int, Any]:
        return self._req("PUT", f"/api/v1/hospitals/{hid}", body)

    def eqa_fields(self) -> list[dict]:
        code, data = self._req("GET", "/api/v1/eqa/fields")
        if code != 200:
            raise SystemExit(f"eqa fields {code}")
        return data.get("items") or []

    def list_participations(self, hospital_id: Optional[int] = None) -> list[dict]:
        items = []
        page = 1
        while True:
            q = f"year={YEAR}&page={page}&pageSize=100"
            if hospital_id:
                q += f"&hospitalId={hospital_id}"
            code, data = self._req("GET", f"/api/v1/eqa/participations?{q}")
            if code != 200:
                raise SystemExit(f"list parts {code} {data}")
            batch = data.get("items") or []
            items.extend(batch)
            total = data.get("total")
            if not batch or (total is not None and len(items) >= total):
                break
            page += 1
            if hospital_id:
                break  # filtered list is small
        return items

    def get_participation(self, pid: int) -> dict:
        code, data = self._req("GET", f"/api/v1/eqa/participations/{pid}")
        if code != 200:
            raise RuntimeError(f"get part {pid}: {code} {data}")
        return data["participation"]

    def create_participation(self, body: dict) -> tuple[int, Any]:
        return self._req("POST", "/api/v1/eqa/participations", body)

    def update_participation(self, pid: int, body: dict) -> tuple[int, Any]:
        return self._req("PUT", f"/api/v1/eqa/participations/{pid}", body)


def load_xlsx(path: Path):
    wb = openpyxl.load_workbook(path, data_only=True)

    def headers(ws):
        return {norm_ws(ws.cell(1, c).value): c for c in range(1, ws.max_column + 1) if ws.cell(1, c).value}

    def read(ws, with_owner=False):
        h = headers(ws)
        subj = [k for k in h if k not in META]
        rows = []
        for r in range(2, ws.max_row + 1):
            code = store_code(ws.cell(r, h["客户编码"]).value) if "客户编码" in h else ""
            name = norm_ws(ws.cell(r, h["客户名称"]).value) if "客户名称" in h else ""
            if not code and not name:
                continue
            row = {
                "code": code,
                "name": name,
                "region": norm_ws(ws.cell(r, h["区域"]).value) if "区域" in h else "",
                "branch": norm_ws(ws.cell(r, h["分公司"]).value) if "分公司" in h else "",
                "dual": parse_dual(ws.cell(r, h["26年是否双大"]).value) if "26年是否双大" in h else None,
                "tag": parse_tag(ws.cell(r, h["26年EQA标签"]).value) if "26年EQA标签" in h else None,
                "subjects": {s: ws.cell(r, h[s]).value for s in subj},
            }
            rows.append(row)
        return rows, subj

    info_rows, _ = read(wb["EQA信息表"])
    guo_rows, guo_subj = read(wb["国考客户"], with_owner=True)
    sheng_rows, _ = read(wb["省考客户"])

    hospitals = {}
    for row in info_rows:
        hospitals[norm_code(row["code"]) or f"name:{row['name']}"] = row
    guo_by = {}
    for row in guo_rows:
        k = norm_code(row["code"]) or f"name:{row['name']}"
        guo_by[k] = row
        if k not in hospitals:
            hospitals[k] = {**row, "subjects": {}}
        else:
            if not hospitals[k].get("tag") and row.get("tag"):
                hospitals[k]["tag"] = row["tag"]
    for row in sheng_rows:
        k = norm_code(row["code"]) or f"name:{row['name']}"
        if k not in hospitals:
            hospitals[k] = {**row, "subjects": {}}
        elif not hospitals[k].get("tag") and row.get("tag"):
            hospitals[k]["tag"] = row["tag"]
    return hospitals, guo_by, guo_subj


def national_label_map(fields: list[dict]) -> dict[str, str]:
    m = {}
    def walk(nodes):
        for n in nodes:
            if n.get("parentCode") == "scope.national" and n.get("valueType") == "boolean":
                m[norm_label(n["name"])] = n["code"]
            walk(n.get("children") or [])
    walk(fields)
    return m


def match(row, by_code, by_name):
    nc = norm_code(row["code"])
    if nc and nc in by_code:
        return by_code[nc]
    if not nc:
        cands = [h for h in by_name.get(row["name"], []) if not norm_code(h.get("customerCode"))]
        if len(cands) == 1:
            return cands[0]
    return None


def main():
    ap = argparse.ArgumentParser()
    root = Path(__file__).resolve().parents[1]
    ap.add_argument("--xlsx", type=Path, default=root / "scripts/data/eqa-customers.xlsx")
    ap.add_argument("--base", default=os.environ.get("MINDRAY_API", "https://www.mindcollect.xyz"))
    ap.add_argument("--email", default=os.environ.get("MINDRAY_ADMIN_EMAIL", "admin@mindray.com"))
    ap.add_argument("--password", default=os.environ.get("MINDRAY_ADMIN_PASSWORD", "admin123"))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sleep", type=float, default=0.02)
    args = ap.parse_args()

    api = API(args.base, "")
    api.login(args.email, args.password)

    hospitals_xlsx, guo_by, guo_subj = load_xlsx(args.xlsx)
    label_to_code = national_label_map(api.eqa_fields())

    db_hosp = api.list_hospitals()
    by_code = {}
    by_name = defaultdict(list)
    for h in db_hosp:
        # list may omit customerCode — fetch detail when needed is slow; get all details for coded ones
        by_name[h["name"]].append(h)
    # Enrich with customerCode via full list fields — list payload sometimes has it
    # Enrich only rows missing customerCode (list usually includes it after import).
    enriched = []
    for h in db_hosp:
        if h.get("customerCode"):
            enriched.append(h)
            continue
        detail = api.get_hospital(h["id"])
        enriched.append(detail)
        time.sleep(args.sleep)
    db_hosp = enriched
    by_code.clear()
    by_name.clear()
    for h in db_hosp:
        nc = norm_code(h.get("customerCode"))
        if nc:
            by_code.setdefault(nc, h)
        by_name[h["name"]].append(h)

    stats = defaultdict(int)
    dual_sql = []
    id_by_key = {}
    errors = []

    def fill_empty(hid: int, row: dict, existing: dict):
        # Build PUT body preserving protected fields; only fill empty code/region/branch
        need = False
        body = {
            "name": existing["name"],
            "province": existing["province"],
            "city": existing["city"],
            "district": existing.get("district") or "",
            "level": existing["level"],
            "type": existing["type"],
            "status": existing.get("status") or "active",
            "address": existing.get("address") or "",
            "remark": existing.get("remark") or "",
            "customerCode": existing.get("customerCode") or "",
            "region": existing.get("region") or "",
            "branchOffice": existing.get("branchOffice") or "",
        }
        if not norm_ws(body["customerCode"]) and row["code"]:
            body["customerCode"] = store_code(row["code"])
            need = True
        if not norm_ws(body["region"]) and row.get("region"):
            body["region"] = row["region"]
            need = True
        if not norm_ws(body["branchOffice"]) and row.get("branch"):
            body["branchOffice"] = row["branch"]
            need = True
        if not need:
            return
        if args.dry_run:
            stats["hospitals_filled"] += 1
            return
        code, data = api.update_hospital(hid, body)
        if code == 200:
            stats["hospitals_filled"] += 1
            existing.update({"customerCode": body["customerCode"], "region": body["region"], "branchOffice": body["branchOffice"]})
        else:
            errors.append(f"update hospital {hid}: {code} {data}")

    for key, row in hospitals_xlsx.items():
        existing = match(row, by_code, by_name)
        if existing:
            stats["hospitals_matched"] += 1
            hid = existing["id"]
            fill_empty(hid, row, existing)
        else:
            status = "inactive" if "禁用" in row["name"] else "active"
            body = {
                "name": row["name"],
                "province": "安徽省",
                "city": city_from_branch(row.get("branch") or ""),
                "district": "",
                "level": "二级甲等",
                "type": "综合医院",
                "status": status,
                "address": "",
                "remark": "",
                "customerCode": store_code(row["code"]),
                "region": row.get("region") or "",
                "branchOffice": row.get("branch") or "",
            }
            if args.dry_run:
                stats["hospitals_inserted"] += 1
                hid = -1
            else:
                code, data = api.create_hospital(body)
                if code in (200, 201) and data and "hospital" in data:
                    hid = data["hospital"]["id"]
                    stats["hospitals_inserted"] += 1
                    h = data["hospital"]
                    nc = norm_code(h.get("customerCode") or row["code"])
                    if nc:
                        by_code[nc] = h
                    by_name[h["name"]].append(h)
                else:
                    # unique name collision → treat as match (fill empty only; never overwrite name)
                    errors.append(f"create hospital {row['name']}: {code} {data}")
                    cands = by_name.get(row["name"]) or []
                    if not cands:
                        # name may exist under different page that we now have fully loaded
                        stats["hospitals_skipped"] += 1
                        continue
                    existing = cands[0]
                    hid = existing["id"]
                    stats["hospitals_matched"] += 1
                    fill_empty(hid, row, existing)
        id_by_key[key] = hid

        # dual_major SQL (API has no attributes write)
        attrs = (existing or {}).get("attributes") if existing else None
        if isinstance(attrs, dict) and attrs.get("dual_major"):
            stats["dual_major_skipped"] += 1
        elif row.get("dual") and hid and hid != -1:
            dual_sql.append((hid, row["dual"]))
            stats["dual_major_pending_sql"] += 1
        else:
            stats["dual_major_skipped"] += 1
        time.sleep(args.sleep)

    # Build participation map hospital_id -> participation summary
    parts = api.list_participations()
    # May need paging if many — currently 0
    part_by_hid = {}
    for p in parts:
        if p.get("scope") == "national" and int(p.get("year") or 0) == YEAR:
            part_by_hid[p["hospitalId"]] = p

    def ones_for(grow):
        out = []
        for label, v in (grow.get("subjects") or {}).items():
            if v == 1 or v == "1" or v is True:
                code = label_to_code.get(norm_label(label))
                if code:
                    out.append(code)
                else:
                    stats["subject_unmapped"] += 1
        return out

    def ensure_part(hid: int, tag: Optional[str], ones: list[str]):
        if hid == -1:
            stats["participations_created"] += 1
            stats["items_inserted"] += len(ones)
            return
        existing = part_by_hid.get(hid)
        if not existing:
            body = {
                "hospitalId": hid,
                "year": YEAR,
                "scope": "national",
                "tags": [tag] if tag else [],
                "items": [{"fieldCode": c, "value": True} for c in ones],
            }
            if args.dry_run:
                stats["participations_created"] += 1
                stats["items_inserted"] += len(ones)
                return
            code, data = api.create_participation(body)
            if code in (200, 201):
                stats["participations_created"] += 1
                stats["items_inserted"] += len(ones)
                part_by_hid[hid] = data["participation"]
            elif code == 409:
                # fetch and merge
                lst = api.list_participations(hospital_id=hid)
                hit = next((x for x in lst if x.get("scope") == "national"), None)
                if not hit:
                    errors.append(f"409 but no part for hospital {hid}")
                    return
                existing = hit
                part_by_hid[hid] = existing
                stats["participations_existing"] += 1
            else:
                errors.append(f"create part hospital={hid}: {code} {data}")
                return
        if existing:
            stats["participations_existing"] += 1
            detail = api.get_participation(existing["id"])
            have = {it["fieldCode"]: it["value"] for it in (detail.get("items") or [])}
            merged = [{"fieldCode": k, "value": bool(v)} for k, v in have.items()]
            added = 0
            for c in ones:
                if c not in have:
                    merged.append({"fieldCode": c, "value": True})
                    added += 1
            tags = list(detail.get("tags") or [])
            tag_body = None
            if tag and len(tags) == 0:
                tag_body = [tag]
            if added == 0 and tag_body is None:
                stats["items_skipped_existing"] += len(ones)
                return
            if args.dry_run:
                stats["items_inserted"] += added
                if tag_body:
                    stats["participations_tags_filled"] += 1
                return
            body = {"items": merged}
            if tag_body is not None:
                body["tags"] = tag_body
            code, data = api.update_participation(detail["id"], body)
            if code == 200:
                stats["items_inserted"] += added
                if tag_body:
                    stats["participations_tags_filled"] += 1
            else:
                errors.append(f"update part {detail['id']}: {code} {data}")

    for key, grow in guo_by.items():
        hid = id_by_key.get(key)
        if not hid:
            base = hospitals_xlsx.get(key) or grow
            m = match(base, by_code, by_name)
            if not m:
                errors.append(f"no hospital for guo {grow.get('code')} {grow.get('name')}")
                continue
            hid = m["id"]
        ones = ones_for(grow)
        tag = grow.get("tag") or (hospitals_xlsx.get(key) or {}).get("tag")
        if ones or tag:
            ensure_part(hid, tag, ones)
        time.sleep(args.sleep)

    for key, row in hospitals_xlsx.items():
        if key in guo_by:
            continue
        if not row.get("tag"):
            continue
        hid = id_by_key.get(key)
        if not hid:
            continue
        ensure_part(hid, row["tag"], [])
        time.sleep(args.sleep)

    # Write dual_major SQL for ops
    sql_path = root / "scripts/data/eqa_dual_major.sql"
    lines = [
        "-- dual_major only; ON CONFLICT DO NOTHING (never overwrite)",
        "BEGIN;",
    ]
    for hid, val in dual_sql:
        lines.append(
            "INSERT INTO hospital_attributes (hospital_id, attr_key, attr_value) "
            f"VALUES ({int(hid)}, 'dual_major', '{val}') "
            "ON CONFLICT (hospital_id, attr_key) DO NOTHING;"
        )
    lines.append("COMMIT;")
    sql_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    out = {
        "dry_run": args.dry_run,
        "stats": dict(stats),
        "errors": errors[:40],
        "error_count": len(errors),
        "dual_major_sql": str(sql_path),
        "dual_major_rows": len(dual_sql),
        "defaults_new_hospitals": {
            "province": "安徽省",
            "city": "from 分公司 or 合肥市",
            "level": "二级甲等",
            "type": "综合医院",
        },
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

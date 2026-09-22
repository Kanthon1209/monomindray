"use client";

import { useMemo, useState, useCallback } from "react";
import { Map as MapIcon, List } from "lucide-react";
import { Header } from "../components/Header";
import { FilterBar } from "../components/FilterBar";
import { ChinaMap } from "../components/ChinaMap";
import { HospitalPanel } from "../components/HospitalPanel";
import { mockHospitals, provinceMapData } from "@/lib/mock-data";
import type { FilterOptions } from "@/lib/types";

const defaultFilters: FilterOptions = {
  region: "all",
  hospitalLevel: "all",
  hospitalType: "all",
  deviceCategory: "all",
  deviceModel: "all",
};

// 省份名 -> 区域映射
const provinceRegionMap: Record<string, string> = {
  北京市: "huabei", 天津市: "huabei", 河北省: "huabei", 山西省: "huabei", 内蒙古自治区: "huabei",
  上海市: "huadong", 江苏省: "huadong", 浙江省: "huadong", 安徽省: "huadong", 福建省: "huadong", 江西省: "huadong", 山东省: "huadong",
  广东省: "huanan", 广西壮族自治区: "huanan", 海南省: "huanan",
  河南省: "huazhong", 湖北省: "huazhong", 湖南省: "huazhong",
  重庆市: "xinan", 四川省: "xinan", 贵州省: "xinan", 云南省: "xinan", 西藏自治区: "xinan",
  陕西省: "xibei", 甘肃省: "xibei", 青海省: "xibei", 宁夏回族自治区: "xibei", 新疆维吾尔自治区: "xibei",
  辽宁省: "dongbei", 吉林省: "dongbei", 黑龙江省: "dongbei",
};

type MobileTab = "map" | "list";

export default function DashboardPage() {
  const [filters, setFilters] = useState<FilterOptions>(defaultFilters);
  const [selectedProvince, setSelectedProvince] = useState<string | undefined>();
  const [mobileTab, setMobileTab] = useState<MobileTab>("map");

  const handleFilterChange = useCallback(
    (key: keyof FilterOptions, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setSelectedProvince(undefined);
    },
    []
  );

  const handleProvinceClick = useCallback((provinceName: string) => {
    setSelectedProvince((prev) =>
      prev === provinceName ? undefined : provinceName
    );
    // 手机端点击省份后自动切换到列表查看
    setMobileTab("list");
  }, []);

  // 过滤医院列表
  const filteredHospitals = useMemo(() => {
    let result = mockHospitals;

    // 区域筛选
    if (filters.region !== "all") {
      result = result.filter(
        (h) => provinceRegionMap[h.province] === filters.region
      );
    }

    // 医院级别筛选
    if (filters.hospitalLevel !== "all") {
      const levelMap: Record<string, string> = {
        sanjiayi: "三级甲等",
        sanjiyi: "三级乙等",
        erjiayi: "二级甲等",
        erjiyi: "二级乙等",
        yiji: "一级",
      };
      const target = levelMap[filters.hospitalLevel];
      if (target) result = result.filter((h) => h.level === target);
    }

    // 医院类型筛选
    if (filters.hospitalType !== "all") {
      const typeMap: Record<string, string> = {
        zonghe: "综合医院",
        zhuanke: "专科医院",
        zhongyi: "中医医院",
        fuyou: "妇幼保健院",
      };
      const target = typeMap[filters.hospitalType];
      if (target) result = result.filter((h) => h.type === target);
    }

    // 设备类别筛选
    if (filters.deviceCategory !== "all") {
      const categoryModelMap: Record<string, string[]> = {
        biochem: ["BS-2000M", "BS-2200"],
        immuno: ["CL-8000", "CL-6000"],
        hematology: ["BC-7500", "BC-6800"],
        coag: [],
        urine: [],
      };
      const targetModels = categoryModelMap[filters.deviceCategory];
      if (targetModels && targetModels.length > 0) {
        result = result.filter((h) =>
          h.deviceModels.some((m) => targetModels.includes(m))
        );
      } else if (targetModels) {
        result = [];
      }
    }

    // 设备型号筛选
    if (filters.deviceModel !== "all") {
      const modelMap: Record<string, string> = {
        bs2000m: "BS-2000M",
        bs2200: "BS-2200",
        cl8000: "CL-8000",
        cl6000: "CL-6000",
        bc7500: "BC-7500",
        bc6800: "BC-6800",
      };
      const target = modelMap[filters.deviceModel];
      if (target) {
        result = result.filter((h) => h.deviceModels.includes(target));
      }
    }

    // 省份点击筛选
    if (selectedProvince) {
      result = result.filter((h) => h.province === selectedProvince);
    }

    return result;
  }, [filters, selectedProvince]);

  // 过滤地图数据（只过滤区域）
  const mapData = useMemo(() => {
    if (filters.region === "all") return provinceMapData;
    return provinceMapData.filter(
      (p) => provinceRegionMap[p.name] === filters.region
    );
  }, [filters.region]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-50 dark:bg-zinc-900">
      <FilterBar filters={filters} onFilterChange={handleFilterChange} />

      {/* 移动端 Tab 切换 */}
      <div className="flex border-b bg-white dark:bg-zinc-950 md:hidden">
        <button
          onClick={() => setMobileTab("map")}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
            mobileTab === "map"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground"
          }`}
        >
          <MapIcon className="h-4 w-4" />
          地图
        </button>
        <button
          onClick={() => setMobileTab("list")}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
            mobileTab === "list"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground"
          }`}
        >
          <List className="h-4 w-4" />
          医院清单
          {filteredHospitals.length > 0 && (
            <span className="ml-0.5 rounded bg-muted px-1 text-xs">
              {filteredHospitals.length}
            </span>
          )}
        </button>
      </div>

      <div className="min-h-0 flex-1 md:grid md:grid-cols-[minmax(0,7fr)_minmax(360px,3fr)]">
        {/* 地图区域 */}
        <div
          className={`relative min-h-0 overflow-hidden bg-white dark:bg-zinc-950 md:block md:border-r ${
            mobileTab === "map" ? "block" : "hidden"
          }`}
        >
          <ChinaMap
            data={mapData}
            onProvinceClick={handleProvinceClick}
            selectedProvince={selectedProvince}
          />
          {selectedProvince && (
            <div className="absolute left-4 top-4 z-20 rounded-md bg-white/90 px-3 py-1.5 text-xs font-medium shadow-md dark:bg-zinc-900/90">
              已选择: {selectedProvince}
              <button
                onClick={() => setSelectedProvince(undefined)}
                className="ml-2 text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* 医院面板 */}
        <div
          className={`min-h-0 md:block ${
            mobileTab === "list" ? "block" : "hidden"
          }`}
        >
          <HospitalPanel
            hospitals={filteredHospitals}
            selectedProvince={selectedProvince}
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { FilterBar } from "../components/FilterBar";
import { AnhuiMap } from "../components/ChinaMap";
import { HospitalPanel } from "../components/HospitalPanel";
import { fetchDashboardHospitals, fetchProvinceStats } from "@/lib/business";
import { resolveArchiveField } from "@/lib/hospital-archive";
import { useIsDesktop } from "@/hooks/use-mobile";
import type { FilterOptions, Hospital, ProvinceData } from "@/lib/types";

const defaultFilters: FilterOptions = {
  region: "all",
  customerLevel: "all",
  model: "all",
};

export default function DashboardPage() {
  const isDesktop = useIsDesktop();
  const [filters, setFilters] = useState<FilterOptions>(defaultFilters);
  const [selectedCity, setSelectedCity] = useState<string | undefined>();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [mapData, setMapData] = useState<ProvinceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleFilterChange = useCallback(
    (key: keyof FilterOptions, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      if (key === "region") setSelectedCity(undefined);
    },
    [],
  );

  const handleCityClick = useCallback((cityName: string) => {
    setSelectedCity((prev) => (prev === cityName ? undefined : cityName));
  }, []);

  useEffect(() => {
    if (isDesktop === null) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const hospPromise = fetchDashboardHospitals({
        region: filters.region,
        province: "安徽省",
        city: selectedCity,
      });
      // 手机端不展示地图，跳过省市统计请求
      const cityPromise = isDesktop
        ? fetchProvinceStats(filters.region)
        : Promise.resolve({ items: [] as ProvinceData[], error: undefined as string | undefined });
      const [hospRes, cityRes] = await Promise.all([hospPromise, cityPromise]);
      if (cancelled) return;
      if (hospRes.error || cityRes.error) {
        setError(hospRes.error || cityRes.error || "加载失败");
        setHospitals([]);
        setMapData([]);
      } else {
        setHospitals(hospRes.items);
        setMapData(cityRes.items);
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [filters.region, selectedCity, isDesktop]);

  const modelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const h of hospitals) {
      const model = resolveArchiveField(h, "model").trim();
      if (model) set.add(model);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [hospitals]);

  const levelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const h of hospitals) {
      const level = resolveArchiveField(h, "customerLevel").trim();
      if (level) set.add(level);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [hospitals]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30">
      <FilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        modelOptions={modelOptions}
        levelOptions={levelOptions}
      />

      {error ? (
        <div className="shrink-0 border-b bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[minmax(0,6fr)_minmax(380px,4fr)]">
        {loading || isDesktop === null ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {isDesktop ? (
          <div className="relative hidden min-h-0 overflow-hidden border-r bg-background md:block">
            <AnhuiMap
              data={mapData}
              onCityClick={handleCityClick}
              selectedCity={selectedCity}
            />
            {selectedCity ? (
              <div className="absolute left-4 top-4 z-20 rounded-md border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm">
                已选择: {selectedCity}
                <button
                  type="button"
                  onClick={() => setSelectedCity(undefined)}
                  className="ml-2 text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <HospitalPanel
            hospitals={hospitals}
            selectedProvince={selectedCity}
            modelFilter={filters.model}
            levelFilter={filters.customerLevel}
          />
        </div>
      </div>
    </div>
  );
}

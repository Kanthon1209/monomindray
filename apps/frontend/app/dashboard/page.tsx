"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Map as MapIcon, List, Loader2 } from "lucide-react";
import { FilterBar } from "../components/FilterBar";
import { AnhuiMap } from "../components/ChinaMap";
import { HospitalPanel } from "../components/HospitalPanel";
import { fetchDashboardHospitals, fetchProvinceStats } from "@/lib/business";
import { resolveArchiveField } from "@/lib/hospital-archive";
import type { FilterOptions, Hospital, ProvinceData } from "@/lib/types";

const defaultFilters: FilterOptions = {
  region: "all",
  customerLevel: "all",
  model: "all",
};

type MobileTab = "map" | "list";

export default function DashboardPage() {
  const [filters, setFilters] = useState<FilterOptions>(defaultFilters);
  const [selectedCity, setSelectedCity] = useState<string | undefined>();
  const [mobileTab, setMobileTab] = useState<MobileTab>("map");
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
    setMobileTab("list");
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const [hospRes, cityRes] = await Promise.all([
        fetchDashboardHospitals({
          region: filters.region,
          province: "安徽省",
          city: selectedCity,
        }),
        fetchProvinceStats(filters.region),
      ]);
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
  }, [filters.region, selectedCity]);

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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-50 dark:bg-zinc-900">
      <FilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        modelOptions={modelOptions}
        levelOptions={levelOptions}
      />

      {error ? (
        <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

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
          客户档案
          {hospitals.length > 0 && (
            <span className="ml-0.5 rounded bg-muted px-1 text-xs">
              {hospitals.length}
            </span>
          )}
        </button>
      </div>

      <div className="relative min-h-0 flex-1 md:grid md:grid-cols-[minmax(0,6fr)_minmax(420px,4fr)]">
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        <div
          className={`relative min-h-0 overflow-hidden bg-white dark:bg-zinc-950 md:block md:border-r ${
            mobileTab === "map" ? "block" : "hidden"
          }`}
        >
          <AnhuiMap
            data={mapData}
            onCityClick={handleCityClick}
            selectedCity={selectedCity}
          />
          {selectedCity && (
            <div className="absolute left-4 top-4 z-20 rounded-md bg-white/90 px-3 py-1.5 text-xs font-medium shadow-md dark:bg-zinc-900/90">
              已选择: {selectedCity}
              <button
                onClick={() => setSelectedCity(undefined)}
                className="ml-2 text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        <div
          className={`min-h-0 overflow-hidden ${
            mobileTab === "list"
              ? "absolute inset-0 md:relative md:inset-auto md:h-full"
              : "hidden md:relative md:block md:h-full"
          }`}
        >
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

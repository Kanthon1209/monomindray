"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { FilterBar } from "../components/FilterBar";
import { AnhuiMap } from "../components/ChinaMap";
import { HospitalPanel } from "../components/HospitalPanel";
import {
  fetchAssayTree,
  fetchDashboardHospitals,
} from "@/lib/business";
import { resolveArchiveField } from "@/lib/hospital-archive";
import { useIsDesktop } from "@/hooks/use-mobile";
import type { FilterOptions, Hospital, ProvinceData } from "@/lib/types";
import {
  extractAssayPackages,
  packageAccentColor,
  packageThemeColors,
  type AssayPackage,
} from "@/lib/assay-packages";

const defaultFilters: FilterOptions = {
  region: "all",
  customerLevel: "all",
  model: "all",
};

function normalizeCityName(name: string): string {
  const n = (name || "").trim();
  if (!n) return "";
  return n.endsWith("市") ? n : `${n}市`;
}

export default function DashboardPage() {
  const isDesktop = useIsDesktop();
  const [filters, setFilters] = useState<FilterOptions>(defaultFilters);
  const [selectedCity, setSelectedCity] = useState<string | undefined>();
  const [selectedPackageCode, setSelectedPackageCode] = useState("");
  const [selectedDeviceBrands, setSelectedDeviceBrands] = useState<string[]>([]);
  const [packages, setPackages] = useState<AssayPackage[]>([]);
  const [packageCounts, setPackageCounts] = useState<Record<string, number>>({});
  const [deviceBrandCounts, setDeviceBrandCounts] = useState<Record<string, number>>({});
  const [totalHospitalCount, setTotalHospitalCount] = useState(0);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
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

  const handlePackageChange = useCallback((code: string) => {
    setSelectedPackageCode(code);
  }, []);

  const handleDeviceBrandsChange = useCallback((brands: string[]) => {
    setSelectedDeviceBrands(brands);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchAssayTree();
      if (cancelled) return;
      if (!res.error) setPackages(extractAssayPackages(res.items));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Baseline hospital set for 套餐 chip counts (ignores package filter).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchDashboardHospitals({
        region: filters.region,
        province: "安徽省",
        city: selectedCity,
      });
      if (cancelled || res.error) return;
      const counts: Record<string, number> = {};
      const deviceCounts: Record<string, number> = {};
      for (const h of res.items) {
        for (const code of h.assayCategoryCodes || []) {
          counts[code] = (counts[code] || 0) + 1;
        }
        const seenBrands = new Set<string>();
        for (const raw of h.deviceBrands || []) {
          const brand = String(raw || "").trim() || "迈瑞";
          if (seenBrands.has(brand)) continue;
          seenBrands.add(brand);
          deviceCounts[brand] = (deviceCounts[brand] || 0) + 1;
        }
      }
      setPackageCounts(counts);
      setDeviceBrandCounts(deviceCounts);
      setTotalHospitalCount(res.total || res.items.length);
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.region, selectedCity]);

  // Load hospitals for current region + package (no city). Map + list share this set;
  // city / device-company / model / level are applied client-side so choropleth matches the list.
  useEffect(() => {
    if (isDesktop === null) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const assayCategory = selectedPackageCode || undefined;
      const hospRes = await fetchDashboardHospitals({
        region: filters.region,
        province: "安徽省",
        assayCategory,
      });
      if (cancelled) return;
      if (hospRes.error) {
        setError(hospRes.error || "加载失败");
        setHospitals([]);
      } else {
        setHospitals(hospRes.items);
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [filters.region, selectedPackageCode, isDesktop]);

  const selectedPackage = useMemo(
    () => packages.find((p) => p.code === selectedPackageCode) || null,
    [packages, selectedPackageCode],
  );

  const mapThemeColors = useMemo(
    () => packageThemeColors(selectedPackage),
    [selectedPackage],
  );
  const mapAccent = useMemo(
    () => packageAccentColor(selectedPackage),
    [selectedPackage],
  );

  /** Same filters as HospitalPanel (except search): device company AND model AND level. */
  const mapFilteredHospitals = useMemo(() => {
    const brandFilterActive = selectedDeviceBrands.length > 0;
    const brandSet = brandFilterActive ? new Set(selectedDeviceBrands) : null;
    return hospitals.filter((h) => {
      const model = resolveArchiveField(h, "model");
      const level = resolveArchiveField(h, "customerLevel");
      if (filters.model !== "all" && model !== filters.model) return false;
      if (filters.customerLevel !== "all" && level !== filters.customerLevel) return false;
      if (brandSet) {
        const hospitalBrands = h.deviceBrands || [];
        if (!hospitalBrands.some((b) => brandSet.has(b))) return false;
      }
      return true;
    });
  }, [hospitals, selectedDeviceBrands, filters.model, filters.customerLevel]);

  const mapData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of mapFilteredHospitals) {
      const name = normalizeCityName(h.city);
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const items: ProvinceData[] = Array.from(counts.entries()).map(([name, value]) => ({
      name,
      value,
    }));
    items.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    return items;
  }, [mapFilteredHospitals]);

  const listHospitals = useMemo(() => {
    if (!selectedCity) return hospitals;
    const selected = normalizeCityName(selectedCity);
    return hospitals.filter((h) => normalizeCityName(h.city) === selected);
  }, [hospitals, selectedCity]);

  const modelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const h of hospitals) {
      const model = resolveArchiveField(h, "model").trim();
      if (model) set.add(model);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [hospitals]);

  const deviceBrandOptions = useMemo(() => {
    return Object.entries(deviceBrandCounts)
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => {
        if (a.brand === "迈瑞" && b.brand !== "迈瑞") return -1;
        if (b.brand === "迈瑞" && a.brand !== "迈瑞") return 1;
        if (b.count !== a.count) return b.count - a.count;
        return a.brand.localeCompare(b.brand, "zh-CN");
      });
  }, [deviceBrandCounts]);

  const levelOptions = useMemo(() => {
    const set = new Set<string>(["V1", "V2", "V3", "非V"]);
    for (const h of hospitals) {
      const level = resolveArchiveField(h, "customerLevel").trim();
      if (level) set.add(level);
    }
    const order = ["V1", "V2", "V3", "非V"];
    return Array.from(set).sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      return a.localeCompare(b, "zh-CN");
    });
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
              themeColors={mapThemeColors}
              accentColor={mapAccent}
            />
            {selectedCity || selectedPackage ? (
              <div className="absolute left-4 top-4 z-20 flex flex-col gap-1.5">
                {selectedCity ? (
                  <div className="rounded-md border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm">
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
                {selectedPackage ? (
                  <div className="rounded-md border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm">
                    套餐: {selectedPackage.lineName} · {selectedPackage.name}
                    <button
                      type="button"
                      onClick={() => setSelectedPackageCode("")}
                      className="ml-2 text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <HospitalPanel
            hospitals={listHospitals}
            selectedProvince={selectedCity}
            modelFilter={filters.model}
            levelFilter={filters.customerLevel}
            packages={packages}
            packageCounts={packageCounts}
            selectedPackageCode={selectedPackageCode}
            onPackageChange={handlePackageChange}
            deviceBrandOptions={deviceBrandOptions}
            selectedDeviceBrands={selectedDeviceBrands}
            onDeviceBrandsChange={handleDeviceBrandsChange}
            totalHospitalCount={totalHospitalCount}
          />
        </div>
      </div>
    </div>
  );
}

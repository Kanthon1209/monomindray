"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import type { EChartsType } from "echarts/core";
import { MapChart } from "echarts/charts";
import {
  TooltipComponent,
  VisualMapComponent,
  GeoComponent,
  TitleComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ProvinceData } from "@/lib/types";

echarts.use([
  MapChart,
  TooltipComponent,
  VisualMapComponent,
  GeoComponent,
  TitleComponent,
  CanvasRenderer,
]);

interface AnhuiMapProps {
  data: ProvinceData[];
  onCityClick?: (cityName: string) => void;
  selectedCity?: string;
}

const ANHUI_MAP_LOCAL = "/anhui.json";
const ANHUI_MAP_REMOTE =
  "https://geo.datav.aliyun.com/areas_v3/bound/340000_full.json";

let mapRegistered = false;

function normalizeCityName(name: string): string {
  const n = name.trim();
  if (!n) return "";
  return n.endsWith("市") ? n : `${n}市`;
}

export function AnhuiMap({ data, onCityClick, selectedCity }: AnhuiMapProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<EChartsType | null>(null);
  const onCityClickRef = useRef(onCityClick);
  onCityClickRef.current = onCityClick;

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);
    chartInstanceRef.current = chart;

    const clickHandler = (params: { name: string }) => {
      onCityClickRef.current?.(normalizeCityName(params.name));
    };
    chart.on("click", clickHandler);

    return () => {
      chart.off("click", clickHandler);
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartInstanceRef.current) return;
    const chart = chartInstanceRef.current;

    const renderOption = () => {
      const max = Math.max(...data.map((d) => d.value), 1);
      const selected = normalizeCityName(selectedCity || "");

      const valueByCity = new Map<string, number>();
      for (const item of data) {
        valueByCity.set(normalizeCityName(item.name), item.value);
      }

      chart.setOption({
        tooltip: {
          trigger: "item",
          formatter: (params: { name: string; value?: number }) => {
            const val = params.value ?? 0;
            return `${params.name}<br/>档案客户：${Number.isFinite(val) ? val : 0}`;
          },
        },
        visualMap: {
          left: "right",
          top: "bottom",
          min: 0,
          max,
          inRange: {
            color: [
              "#fff1f0",
              "#ffccc7",
              "#ffa39e",
              "#ff7875",
              "#f5222d",
              "#cf1322",
              "#a8071a",
            ],
          },
          text: ["多", "少"],
          calculable: true,
          textStyle: { fontSize: 11 },
        },
        series: [
          {
            name: "化免客户分布",
            type: "map",
            map: "anhui",
            roam: false,
            layoutCenter: ["50%", "52%"],
            layoutSize: "92%",
            label: {
              show: true,
              fontSize: 10,
              color: "#334155",
            },
            emphasis: {
              label: {
                show: true,
                fontSize: 11,
                fontWeight: 600,
              },
              itemStyle: {
                areaColor: "#ff7875",
              },
            },
            data: Array.from(valueByCity.entries()).map(([name, value]) => ({
              name,
              value,
              itemStyle:
                selected && selected === name
                  ? {
                      areaColor: "#a8071a",
                      borderColor: "#f59e0b",
                      borderWidth: 2,
                    }
                  : undefined,
              label:
                selected && selected === name
                  ? { color: "#fff", fontWeight: 600 }
                  : undefined,
            })),
          },
        ],
      });
    };

    if (mapRegistered) {
      renderOption();
      return;
    }

    const loadMap = async (url: string): Promise<unknown> => {
      const res = await fetch(url);
      const text = await res.text();
      if (text.trim().startsWith("<")) {
        throw new Error(`返回内容非 JSON: ${url}`);
      }
      return JSON.parse(text);
    };

    loadMap(ANHUI_MAP_LOCAL)
      .catch(() => {
        console.warn("本地安徽地图加载失败，尝试远程数据源...");
        return loadMap(ANHUI_MAP_REMOTE);
      })
      .then((geoJson) => {
        echarts.registerMap(
          "anhui",
          geoJson as Parameters<typeof echarts.registerMap>[1],
        );
        mapRegistered = true;
        renderOption();
      })
      .catch((err) => {
        console.error("加载安徽地图失败:", err);
      });
  }, [data, selectedCity]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;

    const handleResize = () => {
      chartInstanceRef.current?.resize();
    };
    window.addEventListener("resize", handleResize);

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (el.offsetWidth > 0 && el.offsetHeight > 0) {
          chartInstanceRef.current?.resize();
        }
      });
    });
    resizeObserver.observe(el);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
    };
  }, []);

  return <div ref={chartRef} className="h-full w-full" />;
}

/** @deprecated use AnhuiMap */
export { AnhuiMap as ChinaMap };

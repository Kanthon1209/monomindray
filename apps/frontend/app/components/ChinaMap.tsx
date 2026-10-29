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
  /** VisualMap / area palette; defaults to red. When a 套餐 is selected, pass its theme. */
  themeColors?: string[];
  /** Emphasis / selected city fill; derived from theme if omitted. */
  accentColor?: string;
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

const DEFAULT_THEME = [
  "#fff1f0",
  "#ffccc7",
  "#ffa39e",
  "#ff7875",
  "#f5222d",
  "#cf1322",
  "#a8071a",
];

export function AnhuiMap({
  data,
  onCityClick,
  selectedCity,
  themeColors,
  accentColor,
}: AnhuiMapProps) {
  const palette =
    themeColors && themeColors.length >= 2 ? themeColors : DEFAULT_THEME;
  const selectedFill = accentColor || palette[palette.length - 1];
  const emphasisFill = palette[Math.min(3, palette.length - 1)];
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
            color: palette,
          },
          text: ["多", "少"],
          calculable: true,
          textStyle: { fontSize: 12, fontWeight: 600, color: "#0f172a" },
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
              fontSize: 13,
              fontWeight: 700,
              color: "#0f172a",
              textBorderColor: "#ffffff",
              textBorderWidth: 2.5,
              textShadowColor: "rgba(255,255,255,0.85)",
              textShadowBlur: 3,
            },
            emphasis: {
              label: {
                show: true,
                fontSize: 14,
                fontWeight: 700,
                color: "#0f172a",
                textBorderColor: "#ffffff",
                textBorderWidth: 2.5,
              },
              itemStyle: {
                areaColor: emphasisFill,
              },
            },
            data: Array.from(valueByCity.entries()).map(([name, value]) => ({
              name,
              value,
              itemStyle:
                selected && selected === name
                  ? {
                      areaColor: selectedFill,
                      borderColor: "#f59e0b",
                      borderWidth: 2,
                    }
                  : undefined,
              label:
                selected && selected === name
                  ? {
                      color: "#ffffff",
                      fontWeight: 700,
                      fontSize: 14,
                      textBorderColor: "#7f1d1d",
                      textBorderWidth: 2,
                    }
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
  }, [data, selectedCity, palette, selectedFill, emphasisFill]);

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

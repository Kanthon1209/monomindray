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

interface ChinaMapProps {
  data: ProvinceData[];
  onProvinceClick?: (provinceName: string) => void;
  selectedProvince?: string;
}

// 优先使用本地 GeoJSON，远程作为备用
const CHINA_MAP_LOCAL = "/china.json";
const CHINA_MAP_REMOTE =
  "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json";

let mapRegistered = false;

// 省份名称标准化：GeoJSON 中可能用简称，mock 数据中用全称
function normalizeProvinceName(name: string): string {
  return name
    .replace(/省$/, "")
    .replace(/市$/, "")
    .replace(/自治区$/, "")
    .replace(/壮族自治区$/, "")
    .replace(/维吾尔自治区$/, "")
    .replace(/回族自治区$/, "")
    .replace(/特别行政区$/, "");
}

export function ChinaMap({ data, onProvinceClick, selectedProvince }: ChinaMapProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<EChartsType | null>(null);
  // 保存最新的回调到 ref，避免 useEffect 依赖变化导致重新注册
  const onProvinceClickRef = useRef(onProvinceClick);
  onProvinceClickRef.current = onProvinceClick;

  // 初始化图表
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);
    chartInstanceRef.current = chart;

    // 注册 click 事件（只注册一次）
    const clickHandler = (params: { name: string }) => {
      onProvinceClickRef.current?.(params.name);
    };
    chart.on("click", clickHandler);

    return () => {
      chart.off("click", clickHandler);
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  // 加载地图数据并设置 option
  useEffect(() => {
    if (!chartInstanceRef.current) return;

    const chart = chartInstanceRef.current;

    const renderOption = () => {
      const max = Math.max(...data.map((d) => d.value), 1);

      // 构建选中的省份 set（标准化后比较）
      const selectedSet = new Set(
        (selectedProvince ? [selectedProvince] : []).map(normalizeProvinceName)
      );

      chart.setOption({
        tooltip: {
          trigger: "item",
          formatter: (params: { name: string; value?: number }) => {
            const val = params.value ?? 0;
            return `${params.name}<br/>医院数量：${val}`;
          },
        },
        visualMap: {
          left: "right",
          top: "bottom",
          min: 0,
          max,
          inRange: {
            color: [
              "#e0f2fe",
              "#bae6fd",
              "#7dd3fc",
              "#38bdf8",
              "#0ea5e9",
              "#0284c7",
              "#1e40af",
            ],
          },
          text: ["多", "少"],
          calculable: true,
          textStyle: {
            fontSize: 11,
          },
        },
        series: [
          {
            name: "医院分布",
            type: "map",
            map: "china",
            roam: false,
            layoutCenter: ["50%", "50%"],
            layoutSize: "95%",
            label: {
              show: false,
            },
            emphasis: {
              label: {
                show: true,
                fontSize: 10,
              },
            },
            // 选中省份高亮
            data: data.map((item) => ({
              name: item.name,
              value: item.value,
              itemStyle: selectedSet.has(normalizeProvinceName(item.name))
                ? {
                    areaColor: "#1e40af",
                    borderColor: "#f59e0b",
                    borderWidth: 2,
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

    // 加载地图 GeoJSON（优先本地，远程备用）
    const loadMap = async (url: string): Promise<unknown> => {
      const res = await fetch(url);
      const text = await res.text();
      // 检查响应是否为有效 JSON
      if (text.trim().startsWith("<")) {
        throw new Error(`返回内容非 JSON: ${url}`);
      }
      return JSON.parse(text);
    };

    loadMap(CHINA_MAP_LOCAL)
      .catch(() => {
        console.warn("本地地图数据加载失败，尝试远程数据源...");
        return loadMap(CHINA_MAP_REMOTE);
      })
      .then((geoJson) => {
        echarts.registerMap("china", geoJson as Parameters<typeof echarts.registerMap>[1]);
        mapRegistered = true;
        renderOption();
      })
      .catch((err) => {
        console.error("加载地图数据失败:", err);
      });
  }, [data, selectedProvince]);

  // 响应式调整：监听容器尺寸变化（移动端 Tab 切换时容器从 hidden→block）
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;

    const handleResize = () => {
      chartInstanceRef.current?.resize();
    };

    window.addEventListener("resize", handleResize);

    // 使用 ResizeObserver 监听容器尺寸变化（Tab 切换 display 变化时触发）
    const resizeObserver = new ResizeObserver(() => {
      // 容器可能被 display:none 隐藏，延迟 resize 等显示后再调整
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

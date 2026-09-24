import type { ArchiveValue } from "./hospital-archive";

export interface Hospital {
  id: string;
  name: string;
  province: string;
  city: string;
  district?: string;
  level: string;
  type: string;
  deviceCount: number;
  deviceModels: string[];
  status: "active" | "pending" | "inactive" | string;
  address?: string;
  remark?: string;
  archive?: Record<string, ArchiveValue>;
}

export interface FilterOptions {
  region: string;
  customerLevel: string;
  model: string;
}

export interface ProvinceData {
  name: string;
  value: number;
}

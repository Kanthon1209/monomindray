export interface Hospital {
  id: string;
  name: string;
  province: string;
  city: string;
  level: string;
  type: string;
  deviceCount: number;
  deviceModels: string[];
  status: "active" | "pending" | "inactive" | string;
  remark?: string;
  archive?: Record<string, string>;
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

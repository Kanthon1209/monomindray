export interface Hospital {
  id: string;
  name: string;
  province: string;
  city: string;
  level: string;
  type: string;
  deviceCount: number;
  deviceModels: string[];
  status: "active" | "pending" | "inactive";
}

export interface FilterOptions {
  region: string;
  hospitalLevel: string;
  hospitalType: string;
  deviceCategory: string;
  deviceModel: string;
}

export interface ProvinceData {
  name: string;
  value: number;
}

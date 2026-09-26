import type { User } from "@/lib/auth";

export function isAdmin(user?: Pick<User, "role"> | null) {
  return user?.role === "admin";
}

export function isCollector(user?: Pick<User, "role"> | null) {
  return user?.role === "collector";
}

/** 登录后默认落地页 */
export function homePathForRole(role?: string) {
  if (role === "collector") return "/dashboard/surveys/tasks";
  return "/dashboard";
}

/** 采集员允许访问的路径（含设置）；其它 dashboard 路径应重定向 */
export function isCollectorAllowedPath(pathname: string) {
  if (pathname === "/dashboard/settings") return true;
  if (pathname === "/dashboard/surveys") return true;
  if (pathname.startsWith("/dashboard/surveys/tasks")) return true;
  return false;
}

import type { AssayTreeNode } from "@/lib/business";

/** 套餐 = 检测线下的类别（category），如 生化 → 肝功能 */
export type AssayPackage = {
  code: string;
  name: string;
  lineCode: string;
  lineName: string;
  items: { code: string; name: string }[];
};

/** Stable pastel→deep palettes keyed by assay line; packages rotate within line. */
const LINE_PALETTES: Record<string, string[][]> = {
  biochemistry: [
    ["#eff6ff", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8"],
    ["#ecfeff", "#a5f3fc", "#67e8f9", "#22d3ee", "#06b6d4", "#0891b2", "#0e7490"],
    ["#f0fdf4", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a", "#15803d"],
    ["#fefce8", "#fef08a", "#fde047", "#facc15", "#eab308", "#ca8a04", "#a16207"],
  ],
  immunoassay: [
    ["#faf5ff", "#e9d5ff", "#d8b4fe", "#c084fc", "#a855f7", "#9333ea", "#7e22ce"],
    ["#fdf2f8", "#fbcfe8", "#f9a8d4", "#f472b6", "#ec4899", "#db2777", "#be185d"],
    ["#fff7ed", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c"],
  ],
  coagulation: [
    ["#fef2f2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626", "#b91c1c"],
    ["#fff1f2", "#ffe4e6", "#fecdd3", "#fda4af", "#fb7185", "#f43f5e", "#e11d48"],
  ],
  hematology: [
    ["#f0fdfa", "#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488", "#0f766e"],
    ["#ecfdf5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669", "#047857"],
  ],
};

const FALLBACK_PALETTES: string[][] = [
  ["#fff1f0", "#ffccc7", "#ffa39e", "#ff7875", "#f5222d", "#cf1322", "#a8071a"],
  ["#eff6ff", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8"],
  ["#faf5ff", "#e9d5ff", "#d8b4fe", "#c084fc", "#a855f7", "#9333ea", "#7e22ce"],
  ["#f0fdf4", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a", "#15803d"],
  ["#fff7ed", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c"],
  ["#ecfeff", "#a5f3fc", "#67e8f9", "#22d3ee", "#06b6d4", "#0891b2", "#0e7490"],
];

/** Chip / badge Tailwind classes paired with map palettes (by line family). */
const LINE_CHIP_CLASS: Record<string, string> = {
  biochemistry:
    "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200",
  immunoassay:
    "border-transparent bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200",
  coagulation:
    "border-transparent bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200",
  hematology:
    "border-transparent bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200",
};

function lineKey(lineCode: string, lineName: string): string {
  const c = (lineCode || "").toLowerCase();
  const n = lineName || "";
  if (c.includes("bio") || n.includes("生化")) return "biochemistry";
  if (c.includes("imm") || n.includes("免疫")) return "immunoassay";
  if (c.includes("coag") || n.includes("凝血")) return "coagulation";
  if (c.includes("heme") || c.includes("hemato") || n.includes("血球") || n.includes("血液"))
    return "hematology";
  return "";
}

export function extractAssayPackages(tree: AssayTreeNode[]): AssayPackage[] {
  const out: AssayPackage[] = [];
  for (const line of tree || []) {
    if (line.kind && line.kind !== "line") continue;
    for (const cat of line.children || []) {
      if (cat.kind && cat.kind !== "category") continue;
      const items = (cat.children || [])
        .filter((it) => !it.kind || it.kind === "item")
        .map((it) => ({ code: it.code, name: it.name }));
      out.push({
        code: cat.code,
        name: cat.name,
        lineCode: line.code,
        lineName: line.name,
        items,
      });
    }
  }
  return out;
}

export function packageThemeColors(pkg: AssayPackage | null | undefined): string[] | undefined {
  if (!pkg) return undefined;
  const key = lineKey(pkg.lineCode, pkg.lineName);
  const bank = (key && LINE_PALETTES[key]) || FALLBACK_PALETTES;
  // Stable index from code hash within the palette bank
  let h = 0;
  for (let i = 0; i < pkg.code.length; i++) h = (h * 31 + pkg.code.charCodeAt(i)) >>> 0;
  return bank[h % bank.length];
}

export function packageChipClass(pkg: AssayPackage): string {
  const key = lineKey(pkg.lineCode, pkg.lineName);
  return (
    (key && LINE_CHIP_CLASS[key]) ||
    "border-transparent bg-secondary text-secondary-foreground"
  );
}

export function packageAccentColor(pkg: AssayPackage | null | undefined): string | undefined {
  const colors = packageThemeColors(pkg);
  return colors ? colors[colors.length - 1] : undefined;
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Inset ring for filter chips — stays inside bounds so overflow-hidden parents do not clip it. */
export const filterChipSelectedClass =
  "ring-2 ring-inset ring-primary/70 dark:ring-primary/85";

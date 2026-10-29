import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Inset ring for filter chips — neutral emphasis, not theme primary; stays inside bounds. */
export const filterChipSelectedClass =
  "ring-2 ring-inset ring-foreground/40 dark:ring-foreground/55";

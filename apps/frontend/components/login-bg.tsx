"use client";

/**
 * Picks login background on each mount (random by default).
 * Force mode via LOGIN_BG_MODE exported from app/login/page — pass as prop.
 *
 * Rollback / force:
 * - "ascii"   → always LoginAsciiNoiseBg
 * - "marquee" → always LoginMarqueeBg
 * - "random"  → 50/50 each time this component mounts
 */
import { useEffect, useState } from "react";
import { LoginAsciiNoiseBg } from "@/components/login-ascii-noise-bg";
import { LoginMarqueeBg } from "@/components/login-marquee-bg";

export type LoginBgMode = "random" | "ascii" | "marquee";

type Kind = "ascii" | "marquee";

export function LoginBg({ mode = "random" }: { mode?: LoginBgMode }) {
  const [kind, setKind] = useState<Kind | null>(null);

  useEffect(() => {
    if (mode === "ascii") {
      setKind("ascii");
      return;
    }
    if (mode === "marquee") {
      setKind("marquee");
      return;
    }
    // Prefer fresh random on every mount (each visit / remount of login page)
    setKind(Math.random() < 0.5 ? "ascii" : "marquee");
  }, [mode]);

  if (!kind) {
    // Dark placeholder for one frame — matches page shell, avoids wrong-style flash
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-[#07090c]"
      />
    );
  }

  return kind === "ascii" ? <LoginAsciiNoiseBg /> : <LoginMarqueeBg />;
}

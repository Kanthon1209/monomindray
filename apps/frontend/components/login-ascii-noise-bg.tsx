"use client";

/**
 * Full-viewport ASCII + Perlin noise colored gradient background (from ascii-perlin-noise.html).
 *
 * Rollback: in app/login/page.tsx set USE_ASCII_NOISE_BG = false to restore LoginMarqueeBg.
 * Marquee source kept at components/login-marquee-bg.tsx (do not delete).
 */
import { useEffect, useRef } from "react";

const RAMP =
  " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

const SPEED = 0.42; // slower drift
const SCALE = 0.018; // larger spatial waves
const LIGHT_GAIN = 1.35;
/** Amplify fBm height before remap → stronger peaks/valleys */
const HEIGHT_AMP = 1.55;

const perm = new Uint8Array(512);
(function seed() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 20261010;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
})();

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(a: number, b: number, t: number) {
  return a + t * (b - a);
}
function grad3(h: number, x: number, y: number, z: number) {
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
function perlin3(x: number, y: number, z: number) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  const A = perm[X] + Y;
  const AA = perm[A] + Z;
  const AB = perm[A + 1] + Z;
  const B = perm[X + 1] + Y;
  const BA = perm[B] + Z;
  const BB = perm[B + 1] + Z;
  return lerp(
    lerp(
      lerp(grad3(perm[AA], x, y, z), grad3(perm[BA], x - 1, y, z), u),
      lerp(grad3(perm[AB], x, y - 1, z), grad3(perm[BB], x - 1, y - 1, z), u),
      v,
    ),
    lerp(
      lerp(
        grad3(perm[AA + 1], x, y, z - 1),
        grad3(perm[BA + 1], x - 1, y, z - 1),
        u,
      ),
      lerp(
        grad3(perm[AB + 1], x, y - 1, z - 1),
        grad3(perm[BB + 1], x - 1, y - 1, z - 1),
        u,
      ),
      v,
    ),
    w,
  );
}
function fbm(x: number, y: number, z: number) {
  let amp = 0.65;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < 5; i++) {
    sum += amp * perlin3(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= 0.52;
    freq *= 2.03;
  }
  return sum / norm;
}

const Lx = -0.55;
const Ly = -0.75;
const Lz = 0.9;
const Llen = Math.hypot(Lx, Ly, Lz);
const lx = Lx / Llen;
const ly = Ly / Llen;
const lz = Lz / Llen;

function shadeColor(
  height01: number,
  lit: number,
  rim: number,
  x: number,
  y: number,
  time: number,
) {
  // Hue locked to light-blue ↔ cyan only (no purple / magenta / amber)
  const wave = Math.sin(x * 0.035 + time * 0.28) * 0.5 + 0.5;
  const wave2 =
    Math.cos(y * 0.05 - time * 0.18 + height01 * 3.2) * 0.5 + 0.5;
  let hue = 178 + height01 * 20 + wave * 10 + wave2 * 8;
  hue = Math.min(208, Math.max(172, hue));
  const sat = 48 + height01 * 22 + lit * 10;
  const baseL = 14 + height01 * 38;
  const L = Math.min(78, Math.max(6, baseL + lit * 30 + rim * 10));
  return `hsl(${hue.toFixed(1)} ${sat.toFixed(1)}% ${L.toFixed(1)}%)`;
}

export function LoginAsciiNoiseBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cols = 100;
    let rows = 36;
    let cellW = 10;
    let cellH = 14;
    let t = 0;
    let last = performance.now();
    let raf = 0;
    let alive = true;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (cssW < 1 || cssH < 1) return;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Always cover full viewport; raise font size if cell count would exceed ~10k
      const MAX_CELLS = 10000;
      let fontPx = Math.max(10, Math.min(16, Math.floor(cssW / 88)));
      for (;;) {
        ctx.font = `600 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        ctx.textBaseline = "top";
        cellW = ctx.measureText("M").width || fontPx * 0.6;
        cellH = fontPx * 1.12;
        cols = Math.ceil(cssW / cellW) + 1;
        rows = Math.ceil(cssH / cellH) + 1;
        if (cols * rows <= MAX_CELLS || fontPx >= 28) break;
        fontPx += 1;
      }
    };

    const paint = (time: number, animate: boolean) => {
      if (animate) {
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt * SPEED;
      } else {
        t = time;
      }

      const scale = SCALE;
      const lightGain = LIGHT_GAIN;
      const z = t * 0.32;
      const eps = scale * 1.35;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#05070a";
      ctx.fillRect(0, 0, cssW, cssH);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const nx = x * scale;
          const ny = y * scale * 1.55;
          const h0 = fbm(nx, ny, z);
          const hx = fbm(nx + eps, ny, z);
          const hy = fbm(nx, ny + eps, z);
          let nxv = h0 - hx;
          let nyv = h0 - hy;
          let nzv = 0.35;
          const nlen = Math.hypot(nxv, nyv, nzv) || 1;
          nxv /= nlen;
          nyv /= nlen;
          nzv /= nlen;
          let lit = Math.max(0, nxv * lx + nyv * ly + nzv * lz);
          lit = Math.pow(lit, 0.85) * lightGain;
          const rim = Math.pow(1 - Math.max(0, nzv), 2) * 0.35;

          const height01 = Math.min(
            1,
            Math.max(0, (h0 * HEIGHT_AMP + 1) * 0.5),
          );
          // Lower gamma → punchier ASCII density contrast
          const density = Math.pow(height01, 0.72);
          const idx = Math.min(
            RAMP.length - 1,
            (density * (RAMP.length - 1)) | 0,
          );
          const ch = RAMP[idx];
          if (ch === " ") continue;

          ctx.fillStyle = shadeColor(height01, lit, rim, x, y, t);
          if (lit > 0.7 && height01 > 0.5) {
            ctx.shadowColor = shadeColor(height01, 1.1, 0.2, x, y, t);
            ctx.shadowBlur = 8;
          } else {
            ctx.shadowBlur = 0;
          }
          ctx.fillText(ch, x * cellW, y * cellH);
        }
      }
      ctx.shadowBlur = 0;
    };

    const frame = () => {
      if (!alive) return;
      paint(0, true);
      raf = requestAnimationFrame(frame);
    };

    resize();
    if (reduceMotion) {
      paint(1.2, false);
    } else {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    const onResize = () => {
      resize();
      if (reduceMotion) paint(1.2, false);
    };
    window.addEventListener("resize", onResize);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{
        background:
          "radial-gradient(900px 500px at 18% 0%, rgba(70,130,180,.14), transparent 55%), radial-gradient(700px 480px at 92% 100%, rgba(196,22,28,.07), transparent 50%), #07090c",
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ background: "#05070a" }}
      />
    </div>
  );
}

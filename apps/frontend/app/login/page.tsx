import { Oswald } from "next/font/google"
import { LoginForm } from "@/components/login-form"
import { LoginAsciiNoiseBg } from "@/components/login-ascii-noise-bg"
import { LoginMarqueeBg } from "@/components/login-marquee-bg"

/**
 * Login background switch (rollback):
 * - true  → ASCII Perlin noise (login-ascii-noise-bg.tsx)
 * - false → diagonal MINDRAY marquee (login-marquee-bg.tsx) — keep file, do not delete
 */
const USE_ASCII_NOISE_BG = true

/** Used by marquee watermark; kept loaded so flipping the switch above is one-line. */
const loginDisplay = Oswald({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-login-display",
  display: "swap",
})

export default function Page() {
  return (
    <div
      className={`${loginDisplay.variable} relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-[#07090c] p-6 md:p-10`}
    >
      {USE_ASCII_NOISE_BG ? <LoginAsciiNoiseBg /> : <LoginMarqueeBg />}
      <div className="relative z-10 w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  )
}

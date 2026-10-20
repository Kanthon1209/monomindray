import { Oswald } from "next/font/google"
import { LoginForm } from "@/components/login-form"
import { LoginBg, type LoginBgMode } from "@/components/login-bg"

/**
 * Login background mode (rollback / force):
 * - "random"  → ASCII noise OR MINDRAY marquee, new pick each mount
 * - "ascii"   → always ASCII Perlin noise (login-ascii-noise-bg.tsx)
 * - "marquee" → always diagonal MINDRAY watermark (login-marquee-bg.tsx)
 *
 * See components/LOGIN_BG_SWITCH.md
 */
// ASCII Perlin disabled (code kept). Set "random" or "ascii" to re-enable.
const LOGIN_BG_MODE: LoginBgMode = "marquee"

/** Marquee Oswald face; harmless when ASCII wins the random pick. */
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
      <LoginBg mode={LOGIN_BG_MODE} />
      <div className="relative z-10 w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  )
}

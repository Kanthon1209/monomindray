import { Oswald } from "next/font/google"
import { LoginForm } from "@/components/login-form"
import { LoginMarqueeBg } from "@/components/login-marquee-bg"

/** Condensed display face — close to ZZZ site Mont-Heavy / Impact watermark vibe */
const loginDisplay = Oswald({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-login-display",
  display: "swap",
})

export default function Page() {
  return (
    <div
      className={`${loginDisplay.variable} relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-[#12151a] p-6 md:p-10`}
    >
      <LoginMarqueeBg />
      <div className="relative z-10 w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  )
}

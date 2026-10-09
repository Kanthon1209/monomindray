import { LoginForm } from "@/components/login-form"
import { LoginMarqueeBg } from "@/components/login-marquee-bg"

export default function Page() {
  return (
    <div className="relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-[#faf7f7] p-6 md:p-10">
      <LoginMarqueeBg />
      <div className="relative z-10 w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  )
}

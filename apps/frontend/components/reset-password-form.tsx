"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  confirmPasswordReset,
  validatePasswordResetToken,
} from "@/lib/password-reset";

export function ResetPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || "").trim();

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        if (!cancelled) {
          setChecking(false);
          setValid(false);
          setTokenError("缺少重置令牌，请使用管理员发给你的完整链接");
        }
        return;
      }
      const res = await validatePasswordResetToken(token);
      if (cancelled) return;
      setChecking(false);
      setValid(res.valid);
      setMaskedEmail(res.email || "");
      if (!res.valid) setTokenError(res.msg || "链接无效或已失效");
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("密码至少需要 8 个字符");
      return;
    }
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    const result = await confirmPasswordReset(token, password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(result.message);
  };

  if (checking) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardContent className="flex h-32 items-center justify-center pt-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <CardTitle>密码已更新</CardTitle>
            <CardDescription>{success}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" asChild>
              <Link href="/login">去登录</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardHeader>
            <CardTitle>无法重置密码</CardTitle>
            <CardDescription>{tokenError || "链接无效或已失效"}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button className="w-full" asChild>
              <Link href="/forgot-password">重新申请</Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/login">返回登录</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>设置新密码</CardTitle>
          <CardDescription>
            {maskedEmail ? `账号 ${maskedEmail}` : "请设置新密码（至少 8 位）"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="password">新密码</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm">确认新密码</FieldLabel>
                <Input
                  id="confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </Field>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Field>
                <Button type="submit" disabled={loading}>
                  {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                  保存新密码
                </Button>
                <FieldDescription className="text-center">
                  <Link href="/login" className="underline underline-offset-4 hover:text-primary">
                    返回登录
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldX,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import { formatTime, roleLabel } from "@/lib/users-admin";
import {
  buildResetLink,
  listPasswordResetRequests,
  reviewPasswordReset,
  type PasswordResetItem,
} from "@/lib/password-reset";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DesktopTable,
  MobileCardItem,
  MobileCardList,
} from "@/components/mobile-data-list";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function statusBadge(status?: string) {
  switch (status) {
    case "pending":
      return <Badge variant="warning">待审核</Badge>;
    case "approved":
      return <Badge variant="success">已通过</Badge>;
    case "rejected":
      return <Badge variant="destructive">已拒绝</Badge>;
    case "used":
      return <Badge variant="outline">已使用</Badge>;
    case "expired":
      return <Badge variant="outline">已过期</Badge>;
    default:
      return <Badge variant="outline">{status || "-"}</Badge>;
  }
}

export default function PasswordResetsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [items, setItems] = useState<PasswordResetItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [linkById, setLinkById] = useState<Record<number, string>>({});
  const [issuedLink, setIssuedLink] = useState<{ email: string; link: string } | null>(null);
  const [issuedCopied, setIssuedCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listPasswordResetRequests({
      status: tab === "pending" ? "pending" : undefined,
      page: 1,
      pageSize: 50,
    });
    if (!res.ok) {
      setError(res.error);
      setItems([]);
      setTotal(0);
    } else {
      setItems(res.items);
      setTotal(res.total);
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  useEffect(() => {
    if (user?.role === "admin") void load();
  }, [user, load]);

  const onApprove = async (id: number) => {
    setActingId(id);
    setError(null);
    const res = await reviewPasswordReset(id, "approve");
    setActingId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.item.resetPath) {
      const link = buildResetLink(res.item.resetPath);
      setLinkById((prev) => ({ ...prev, [id]: link }));
      setIssuedLink({ email: res.item.email, link });
      setIssuedCopied(false);
      try {
        await navigator.clipboard.writeText(link);
        setCopiedId(id);
        setIssuedCopied(true);
      } catch {
        // ignore clipboard failures; admin can still click copy
      }
    }
    await load();
  };

  const onReject = async (id: number) => {
    setActingId(id);
    setError(null);
    const res = await reviewPasswordReset(id, "reject");
    setActingId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
  };

  const onCopy = async (id: number, link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
    } catch {
      setError("复制失败，请手动选中链接复制");
    }
  };

  if (!user || user.role !== "admin") return null;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Card className="border-none shadow-none">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <KeyRound className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>密码重置审核</CardTitle>
                <CardDescription>
                  用户提交申请后，通过即可生成一次性重置链接（复制后发微信/钉钉）。当前列表 {total}{" "}
                  条。
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border p-0.5">
                <Button
                  size="sm"
                  variant={tab === "pending" ? "default" : "ghost"}
                  onClick={() => setTab("pending")}
                >
                  待审核
                </Button>
                <Button
                  size="sm"
                  variant={tab === "all" ? "default" : "ghost"}
                  onClick={() => setTab("all")}
                >
                  全部
                </Button>
              </div>
              <Button variant="outline" size="icon" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}

          <DesktopTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>申请人</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>申请时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      暂无记录
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => {
                    const link = linkById[item.id];
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.name || "-"}</div>
                          <div className="text-xs text-muted-foreground">{item.email}</div>
                          {link ? (
                            <div className="mt-2 max-w-md break-all rounded-md bg-muted px-2 py-1 text-xs">
                              {link}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{roleLabel(item.role)}</Badge>
                        </TableCell>
                        <TableCell>{statusBadge(item.status)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatTime(item.requestedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {item.status === "pending" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={actingId === item.id}
                                  onClick={() => onApprove(item.id)}
                                >
                                  {actingId === item.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}
                                  通过并生成链接
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={actingId === item.id}
                                  onClick={() => onReject(item.id)}
                                >
                                  {actingId === item.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <ShieldX className="h-4 w-4" />
                                  )}
                                  拒绝
                                </Button>
                              </>
                            ) : null}
                            {link ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => onCopy(item.id, link)}
                              >
                                {copiedId === item.id ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                                {copiedId === item.id ? "已复制" : "复制链接"}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </DesktopTable>

          <MobileCardList>
            {loading ? (
              <li className="flex h-24 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </li>
            ) : items.length === 0 ? (
              <li className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                暂无记录
              </li>
            ) : (
              items.map((item) => {
                const link = linkById[item.id];
                return (
                  <MobileCardItem key={item.id}>
                    <div className="font-medium">{item.name || "-"}</div>
                    <div className="text-xs text-muted-foreground">{item.email}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{roleLabel(item.role)}</Badge>
                      {statusBadge(item.status)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatTime(item.requestedAt)}
                    </div>
                    {link ? (
                      <div className="break-all rounded-md bg-muted px-2 py-1 text-xs">{link}</div>
                    ) : null}
                    <div className="grid w-full grid-cols-1 gap-2 pt-1">
                      {item.status === "pending" ? (
                        <>
                          <Button
                            variant="outline"
                            className="min-h-10 w-full"
                            disabled={actingId === item.id}
                            onClick={() => onApprove(item.id)}
                          >
                            通过并生成链接
                          </Button>
                          <Button
                            variant="destructive"
                            className="min-h-10 w-full"
                            disabled={actingId === item.id}
                            onClick={() => onReject(item.id)}
                          >
                            拒绝
                          </Button>
                        </>
                      ) : null}
                      {link ? (
                        <Button
                          variant="secondary"
                          className="min-h-10 w-full"
                          onClick={() => onCopy(item.id, link)}
                        >
                          {copiedId === item.id ? "已复制" : "复制链接"}
                        </Button>
                      ) : null}
                    </div>
                  </MobileCardItem>
                );
              })
            )}
          </MobileCardList>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(issuedLink)}
        onOpenChange={(open) => {
          if (!open) setIssuedLink(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置链接已生成</DialogTitle>
            <DialogDescription>
              请复制链接发给 {issuedLink?.email || "用户"}（微信/钉钉均可）。链接一次性有效，约 24 小时后过期。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-40 overflow-auto break-all rounded-md bg-muted px-3 py-2 text-sm">
            {issuedLink?.link}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="secondary"
              onClick={async () => {
                if (!issuedLink) return;
                try {
                  await navigator.clipboard.writeText(issuedLink.link);
                  setIssuedCopied(true);
                } catch {
                  setError("复制失败，请手动选中链接复制");
                }
              }}
            >
              {issuedCopied ? (
                <>
                  <Check className="h-4 w-4" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  复制链接
                </>
              )}
            </Button>
            <Button onClick={() => setIssuedLink(null)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

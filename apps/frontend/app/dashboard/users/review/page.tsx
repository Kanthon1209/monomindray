"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardCheck, Loader2, RefreshCw, ShieldX } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { formatTime, roleLabel, statusBadge, useAdminUsers } from "@/lib/users-admin";
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

export default function UserReviewPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { items, total, loading, actingId, error, loadUsers, review } =
    useAdminUsers("pending");

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Card className="border-none shadow-none">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>用户审核</CardTitle>
                <CardDescription>
                  处理待审核的注册申请。当前待审 {total} 人。
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="icon" onClick={loadUsers} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>申请人</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>申请时间</TableHead>
                  <TableHead className="text-right">审核</TableHead>
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
                      暂无待审核用户
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-muted-foreground">{item.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{roleLabel(item.role)}</Badge>
                      </TableCell>
                      <TableCell>{statusBadge(item.status)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatTime(item.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actingId === item.id}
                            onClick={() => review(item.id, "approve")}
                          >
                            {actingId === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            通过
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={actingId === item.id}
                            onClick={() => review(item.id, "reject")}
                          >
                            {actingId === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldX className="h-4 w-4" />
                            )}
                            拒绝
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

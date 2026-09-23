"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Loader2, RefreshCw } from "lucide-react";

import {
  listMySurveyAssignments,
  type SurveyAssignment,
} from "@/lib/business";
import { formatTime } from "@/lib/users-admin";
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

function assignmentStatusBadge(status: string) {
  switch (status) {
    case "todo":
      return <Badge variant="outline">待填写</Badge>;
    case "in_progress":
      return <Badge variant="warning">填写中</Badge>;
    case "submitted":
      return <Badge variant="success">已提交</Badge>;
    case "cancelled":
      return <Badge variant="secondary">已取消</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function SurveyTasksPage() {
  const [items, setItems] = useState<SurveyAssignment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listMySurveyAssignments();
    if (res.error) setError(res.error);
    setItems(res.items);
    setTotal(res.total);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Card className="border-none shadow-none">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <ClipboardList className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>我的问卷</CardTitle>
                <CardDescription>
                  管理员分发给你的采集任务。共 {total} 条。
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="icon" onClick={load} disabled={loading}>
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
                  <TableHead>发放标题</TableHead>
                  <TableHead>模板</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>截止</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      暂无任务
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.campaignTitle || "—"}
                      </TableCell>
                      <TableCell>{item.templateTitle || item.templateCode}</TableCell>
                      <TableCell>{assignmentStatusBadge(item.status)}</TableCell>
                      <TableCell>{formatTime(item.dueAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/surveys/tasks/${item.id}`}>
                            {item.status === "submitted" ? "查看" : "填写"}
                          </Link>
                        </Button>
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

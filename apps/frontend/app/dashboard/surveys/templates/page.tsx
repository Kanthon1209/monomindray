"use client";

import { useCallback, useEffect, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, LayoutTemplate, Loader2, RefreshCw } from "lucide-react";

import { useAuth } from "@/lib/auth";
import {
  listSurveyTemplates,
  type SurveyField,
  type SurveyTemplate,
} from "@/lib/business";
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

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge variant="success">启用</Badge>;
    case "archived":
      return <Badge variant="outline">已归档</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function groupFields(fields: SurveyField[]) {
  const map = new Map<string, SurveyField[]>();
  for (const f of fields) {
    const section = f.section || "未分组";
    if (!map.has(section)) map.set(section, []);
    map.get(section)!.push(f);
  }
  return Array.from(map.entries());
}

export default function SurveyTemplatesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<SurveyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard/surveys/tasks");
    }
  }, [user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listSurveyTemplates();
    if (res.error) setError(res.error);
    setItems(res.items);
    setExpanded((prev) => prev || res.items[0]?.id || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user, load]);

  if (!user || user.role !== "admin") return null;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Card className="border-none shadow-none">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>模板管理</CardTitle>
                <CardDescription>
                  查看采集表单模板与字段定义。当前共 {items.length} 个模板。
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="icon" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-0">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>标题</TableHead>
                  <TableHead>编码</TableHead>
                  <TableHead>版本</TableHead>
                  <TableHead>字段数</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      暂无模板
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => {
                    const open = expanded === item.id;
                    const fields = item.schema?.fields || [];
                    return (
                      <Fragment key={item.id}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() =>
                            setExpanded((prev) => (prev === item.id ? null : item.id))
                          }
                        >
                          <TableCell>
                            {open ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{item.title}</TableCell>
                          <TableCell className="font-mono text-xs">{item.code}</TableCell>
                          <TableCell>v{item.version}</TableCell>
                          <TableCell>{fields.length}</TableCell>
                          <TableCell>{statusBadge(item.status)}</TableCell>
                        </TableRow>
                        {open ? (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/30 p-4">
                              {item.description ? (
                                <p className="mb-3 text-sm text-muted-foreground">
                                  {item.description}
                                </p>
                              ) : null}
                              {fields.length === 0 ? (
                                <p className="text-sm text-muted-foreground">暂无字段</p>
                              ) : (
                                <div className="space-y-4">
                                  {groupFields(fields).map(([section, sectionFields]) => (
                                    <div key={section}>
                                      <p className="mb-2 text-sm font-medium">{section}</p>
                                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                        {sectionFields.map((f) => (
                                          <div
                                            key={f.key}
                                            className="rounded-md border bg-background px-3 py-2 text-sm"
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="font-medium">{f.label}</span>
                                              {f.required ? (
                                                <Badge variant="outline">必填</Badge>
                                              ) : null}
                                            </div>
                                            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                                              {f.key}
                                              {f.target ? ` → ${f.target}` : ""}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

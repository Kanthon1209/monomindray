"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import {
  ensureEqaSurveyTemplate,
  fetchEqaDashboard,
  fetchEqaFields,
  fetchEqaParticipations,
  scopeLabel,
  type EqaDashboard,
  type EqaFieldNode,
  type EqaParticipation,
} from "@/lib/eqa";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function FieldTree({ nodes, depth = 0 }: { nodes: EqaFieldNode[]; depth?: number }) {
  if (!nodes?.length) return null;
  return (
    <ul className={depth ? "ml-4 border-l pl-3" : "space-y-1"}>
      {nodes.map((n) => (
        <li key={n.code} className="py-0.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{n.name}</span>
            <Badge variant="outline" className="text-[10px]">
              {n.valueType}
            </Badge>
            <span className="text-xs text-muted-foreground">{n.code}</span>
          </div>
          {n.children?.length ? <FieldTree nodes={n.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

export default function EqaDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const yearNow = new Date().getFullYear();
  const [year, setYear] = useState(yearNow);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dash, setDash] = useState<EqaDashboard | null>(null);
  const [fields, setFields] = useState<EqaFieldNode[]>([]);
  const [rows, setRows] = useState<EqaParticipation[]>([]);
  const [total, setTotal] = useState(0);
  const [ensuring, setEnsuring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [d, f, p] = await Promise.all([
      fetchEqaDashboard(year),
      fetchEqaFields(),
      fetchEqaParticipations({ year }),
    ]);
    if (d.error) setError(d.error);
    else setDash(d.data || null);
    if (f.data?.items) setFields(f.data.items);
    if (p.data) {
      setRows(p.data.items || []);
      setTotal(p.data.total || 0);
    }
    setLoading(false);
  }, [year]);

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard");
      return;
    }
    if (user?.role === "admin") load();
  }, [user, router, load]);

  const onEnsureTemplate = async () => {
    setEnsuring(true);
    setMessage(null);
    const res = await ensureEqaSurveyTemplate();
    setEnsuring(false);
    if (res.error) setError(res.error);
    else setMessage(`已生成/更新问卷模板「${res.data?.template?.title || res.data?.template?.code}」，可在问卷发放中使用。`);
  };

  if (!user || user.role !== "admin") return null;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">室间质评 (EQA)</h1>
            <p className="text-sm text-muted-foreground">
              覆盖统计、参评记录与字段树。答卷审核通过后会回写参评数据。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[yearNow, yearNow - 1, yearNow - 2].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y} 年
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={onEnsureTemplate} disabled={ensuring}>
            {ensuring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            生成 EQA 问卷模板
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>参评记录</CardDescription>
            <CardTitle className="text-2xl">
              {loading ? "…" : dash?.totalParticipations ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>覆盖医院</CardDescription>
            <CardTitle className="text-2xl">
              {loading ? "…" : dash?.coverageHospitals ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        {(dash?.byScope || []).map((s) => (
          <Card key={s.scope}>
            <CardHeader className="pb-2">
              <CardDescription>{scopeLabel(s.scope)} 范围</CardDescription>
              <CardTitle className="text-2xl">{s.count}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">热门参评项目</CardTitle>
            <CardDescription>勾选次数 Top</CardDescription>
          </CardHeader>
          <CardContent>
            {(dash?.topItems || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无数据</p>
            ) : (
              <ul className="space-y-2">
                {dash!.topItems.map((it) => (
                  <li key={it.fieldCode} className="flex justify-between text-sm">
                    <span>{it.fieldName}</span>
                    <Badge variant="secondary">{it.count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">负责人进度</CardTitle>
            <CardDescription>参评数 / 勾选项数</CardDescription>
          </CardHeader>
          <CardContent>
            {(dash?.ownerProgress || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无数据</p>
            ) : (
              <ul className="space-y-2">
                {dash!.ownerProgress.map((o, i) => (
                  <li key={o.ownerUserId || i} className="flex justify-between text-sm">
                    <span>{o.ownerName}</span>
                    <span className="text-muted-foreground">
                      {o.participation} 条 · {o.itemCount} 项
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">参评记录（{total}）</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>医院</TableHead>
                <TableHead>年份</TableHead>
                <TableHead>范围</TableHead>
                <TableHead>负责人</TableHead>
                <TableHead>勾选项</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    暂无参评记录。可通过问卷发放 EQA 模板，审核通过后自动写入。
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.hospitalName || r.hospitalId}</TableCell>
                    <TableCell>{r.year}</TableCell>
                    <TableCell>{scopeLabel(r.scope)}</TableCell>
                    <TableCell>{r.ownerName || "-"}</TableCell>
                    <TableCell>{r.itemCount}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">字段注册树</CardTitle>
          <CardDescription>来自 field_registry，问卷模板按此生成</CardDescription>
        </CardHeader>
        <CardContent>
          {fields.length ? <FieldTree nodes={fields} /> : (
            <p className="text-sm text-muted-foreground">无字段</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

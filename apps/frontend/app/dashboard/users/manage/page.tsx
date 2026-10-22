"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, RefreshCw, ShieldX, Trash2, Users } from "lucide-react";
import type { User } from "@/lib/auth";

import { useAuth } from "@/lib/auth";
import {
  formatTime,
  roleLabel,
  statusBadge,
  useAdminUsers,
  type StatusFilter,
} from "@/lib/users-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  DesktopTable,
  MobileCardItem,
  MobileCardList,
  PageToolbar,
} from "@/components/mobile-data-list";

export default function UserManagePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("all");
  const { items, total, loading, actingId, error, loadUsers, review, updateUser, deleteUser } =
    useAdminUsers(status);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "collector", status: "pending" });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, role: u.role || "collector", status: u.status || "pending" });
    setFormError(null);
  };
  const isSelf = (u: User | null) => !!u && !!user && String(u.id) === String(user.id);

  const saveEdit = async () => {
    if (!editing) return;
    if (!form.name.trim()) return setFormError("姓名不能为空");
    if (!form.email.trim()) return setFormError("邮箱不能为空");
    setSaving(true);
    const err = await updateUser(editing.id, {
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      status: form.status,
    });
    setSaving(false);
    if (err) setFormError(err);
    else setEditing(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const err = await deleteUser(deleting.id);
    if (err) setDeleteError(err);
    else setDeleting(null);
  };

  const manageButtons = (item: User, mobile = false) => (
    <>
      <Button
        size={mobile ? "default" : "sm"}
        variant="outline"
        className={mobile ? "min-h-10 w-full" : undefined}
        disabled={actingId === item.id}
        onClick={() => openEdit(item)}
      >
        <Pencil className="h-4 w-4" />
        编辑
      </Button>
      <Button
        size={mobile ? "default" : "sm"}
        variant="destructive"
        className={mobile ? "min-h-10 w-full" : undefined}
        disabled={actingId === item.id || isSelf(item)}
        title={isSelf(item) ? "不能删除自己" : undefined}
        onClick={() => {
          setDeleteError(null);
          setDeleting(item);
        }}
      >
        <Trash2 className="h-4 w-4" />
        删除
      </Button>
    </>
  );

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
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>用户列表</CardTitle>
                <CardDescription>
                  管理系统内全部用户账号与状态。当前共 {total} 人。
                </CardDescription>
              </div>
            </div>
            <PageToolbar>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue placeholder="状态筛选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="pending">待审核</SelectItem>
                  <SelectItem value="approved">已通过</SelectItem>
                  <SelectItem value="rejected">已拒绝</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={loadUsers}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </PageToolbar>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          <DesktopTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>注册时间</TableHead>
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
                      暂无用户
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
                        {item.role === "admin" ? (
                          <div className="flex justify-end gap-2">{manageButtons(item)}</div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            {manageButtons(item)}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actingId === item.id || item.status === "approved"}
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
                              disabled={actingId === item.id || item.status === "rejected"}
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
                        )}
                      </TableCell>
                    </TableRow>
                  ))
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
                暂无用户
              </li>
            ) : (
              items.map((item) => (
                <MobileCardItem key={item.id}>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.email}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{roleLabel(item.role)}</Badge>
                    {statusBadge(item.status)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatTime(item.createdAt)}
                  </div>
                  <div className="grid w-full grid-cols-2 gap-2 pt-1">{manageButtons(item, true)}</div>
                  {item.role === "admin" ? null : (
                    <div className="grid w-full grid-cols-2 gap-2 pt-1">
                      <Button
                        variant="outline"
                        className="min-h-10 w-full"
                        disabled={actingId === item.id || item.status === "approved"}
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
                        variant="destructive"
                        className="min-h-10 w-full"
                        disabled={actingId === item.id || item.status === "rejected"}
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
                  )}
                </MobileCardItem>
              ))
            )}
          </MobileCardList>
        </CardContent>
      </Card>
    <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
            <DialogDescription>修改用户资料、角色与状态。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="eu-name">姓名</Label>
              <Input id="eu-name" value={form.name} maxLength={64}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="eu-email">邮箱</Label>
              <Input id="eu-email" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>角色</Label>
              <Select value={form.role} disabled={isSelf(editing)}
                onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="collector">采集员</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>状态</Label>
              <Select value={form.status} disabled={isSelf(editing)}
                onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">待审核</SelectItem>
                  <SelectItem value="approved">已通过</SelectItem>
                  <SelectItem value="rejected">已拒绝</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isSelf(editing) ? (
              <p className="text-xs text-muted-foreground">不能修改自己的角色和状态。</p>
            ) : null}
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          </div>
          <DialogFooter className="[&>button]:w-full sm:[&>button]:w-auto">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>取消</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除用户</DialogTitle>
            <DialogDescription>
              确定要删除用户「{deleting?.name}」（{deleting?.email}）吗？此操作不可恢复，
              该用户的问卷分配会一并删除，其创建/采集的数据保留但创建人显示为空。
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter className="[&>button]:w-full sm:[&>button]:w-auto">
            <Button variant="outline" onClick={() => setDeleting(null)}>取消</Button>
            <Button variant="destructive" onClick={confirmDelete}
              disabled={!!deleting && actingId === deleting.id}>
              {deleting && actingId === deleting.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

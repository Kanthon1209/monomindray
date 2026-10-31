"use client";

import { useCallback, useEffect, useState } from "react";

import { API_BASE, getAuthToken } from "@/lib/auth";
import { listSurveySubmissions } from "@/lib/business";
import { listPasswordResetRequests } from "@/lib/password-reset";

export type PendingSection = "users" | "surveys" | "passwordResets";

const STORAGE_KEY = "mindray.admin.pendingSeen.v1";

type SeenMap = Partial<Record<PendingSection, number>>;

type Snapshot = {
  loaded: boolean;
  usersTotal: number;
  usersNewestId: number;
  surveysTotal: number;
  surveysNewestId: number;
  passwordResetsTotal: number;
  passwordResetsNewestId: number;
};

function readSeen(): SeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SeenMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSeen(next: SeenMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}

function parseId(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function fetchPendingSnapshot(): Promise<Omit<Snapshot, "loaded">> {
  const empty = {
    usersTotal: 0,
    usersNewestId: 0,
    surveysTotal: 0,
    surveysNewestId: 0,
    passwordResetsTotal: 0,
    passwordResetsNewestId: 0,
  };
  const token = getAuthToken();
  if (!token) return empty;

  const usersPromise = (async () => {
    const qs = new URLSearchParams({
      status: "pending",
      page: "1",
      pageSize: "1",
    });
    const resp = await fetch(`${API_BASE}/admin/users?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return { total: 0, newestId: 0 };
    const data = await resp.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return {
      total: Number(data.total) || 0,
      newestId: parseId(items[0]?.id),
    };
  })();

  const surveysPromise = (async () => {
    const res = await listSurveySubmissions({ status: "submitted", page: 1, pageSize: 1 });
    if (res.error) return { total: 0, newestId: 0 };
    return {
      total: res.total || 0,
      newestId: parseId(res.items[0]?.id),
    };
  })();

  const passwordResetsPromise = (async () => {
    const res = await listPasswordResetRequests({ status: "pending", page: 1, pageSize: 1 });
    if (!res.ok) return { total: 0, newestId: 0 };
    return {
      total: res.total || 0,
      newestId: parseId(res.items[0]?.id),
    };
  })();

  const [users, surveys, passwordResets] = await Promise.all([
    usersPromise,
    surveysPromise,
    passwordResetsPromise,
  ]);
  return {
    usersTotal: users.total,
    usersNewestId: users.newestId,
    surveysTotal: surveys.total,
    surveysNewestId: surveys.newestId,
    passwordResetsTotal: passwordResets.total,
    passwordResetsNewestId: passwordResets.newestId,
  };
}

function visibleFor(
  total: number,
  newestId: number,
  seenNewestId: number | undefined,
): boolean {
  if (total <= 0) return false;
  if (seenNewestId == null || !Number.isFinite(seenNewestId)) return true;
  // Hide after visit for current set; reappear when a newer pending item arrives.
  return newestId > seenNewestId;
}

/**
 * Admin sidebar red-dot state for pending user approvals, password resets,
 * and survey reviews. Visiting the matching review route acknowledges the
 * current newest pending id (localStorage); the dot returns when a newer
 * pending item appears.
 */
export function useAdminPendingBadges(enabled: boolean, pathname: string) {
  const [snap, setSnap] = useState<Snapshot>({
    loaded: false,
    usersTotal: 0,
    usersNewestId: 0,
    surveysTotal: 0,
    surveysNewestId: 0,
    passwordResetsTotal: 0,
    passwordResetsNewestId: 0,
  });
  const [seen, setSeen] = useState<SeenMap>({});

  useEffect(() => {
    if (!enabled) return;
    setSeen(readSeen());
  }, [enabled]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const next = await fetchPendingSnapshot();
      setSnap({ ...next, loaded: true });
    } catch {
      // keep last good snapshot
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 45_000);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, refresh]);

  // Acknowledge on visit: hide dot for current pending set until newer work arrives.
  useEffect(() => {
    if (!enabled || !snap.loaded) return;
    let section: PendingSection | null = null;
    if (pathname.startsWith("/dashboard/users/review")) section = "users";
    else if (pathname.startsWith("/dashboard/users/password-resets"))
      section = "passwordResets";
    else if (pathname.startsWith("/dashboard/surveys/review")) section = "surveys";
    if (!section) return;

    const newestId =
      section === "users"
        ? snap.usersNewestId
        : section === "passwordResets"
          ? snap.passwordResetsNewestId
          : snap.surveysNewestId;
    const total =
      section === "users"
        ? snap.usersTotal
        : section === "passwordResets"
          ? snap.passwordResetsTotal
          : snap.surveysTotal;

    if (total <= 0) {
      setSeen((prev) => {
        if (prev[section!] == null) return prev;
        const next = { ...prev };
        delete next[section!];
        writeSeen(next);
        return next;
      });
      return;
    }
    if (newestId <= 0) return;

    setSeen((prev) => {
      if (prev[section!] === newestId) return prev;
      const next = { ...prev, [section!]: newestId };
      writeSeen(next);
      return next;
    });
  }, [
    enabled,
    pathname,
    snap.loaded,
    snap.usersNewestId,
    snap.usersTotal,
    snap.passwordResetsNewestId,
    snap.passwordResetsTotal,
    snap.surveysNewestId,
    snap.surveysTotal,
  ]);

  const showUsersDot =
    snap.loaded &&
    visibleFor(snap.usersTotal, snap.usersNewestId, seen.users);
  const showPasswordResetsDot =
    snap.loaded &&
    visibleFor(
      snap.passwordResetsTotal,
      snap.passwordResetsNewestId,
      seen.passwordResets,
    );
  const showSurveysDot =
    snap.loaded &&
    visibleFor(snap.surveysTotal, snap.surveysNewestId, seen.surveys);

  return {
    showUsersDot,
    showPasswordResetsDot,
    showSurveysDot,
    usersTotal: snap.usersTotal,
    passwordResetsTotal: snap.passwordResetsTotal,
    surveysTotal: snap.surveysTotal,
    refresh,
  };
}

/** Tiny red notification pip for sidebar rows. */
export function SidebarNotifyDot({
  show,
  className = "",
}: {
  show: boolean;
  className?: string;
}) {
  if (!show) return null;
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full bg-red-500 ${className}`}
    />
  );
}

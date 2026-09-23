"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function SurveysIndexPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    if (user.role === "admin") {
      router.replace("/dashboard/surveys/campaigns");
    } else {
      router.replace("/dashboard/surveys/tasks");
    }
  }, [user, router]);

  return null;
}

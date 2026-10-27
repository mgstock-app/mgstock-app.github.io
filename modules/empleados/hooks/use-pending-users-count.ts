"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { accessApi } from "@/features/access/api";
import { canManage } from "@/utils/permissions";
import { needsAssignment } from "@/utils/assignment-selection";
import type { AppUser } from "@/types/access";

export const USERS_CHANGED_EVENT = "recibonet:users-changed";

export function usePendingUsersCount(user: AppUser | null) {
  const path = usePathname();
  const enabled = canManage(user);
  const userId = user?.user_id;
  const organization = user?.organization_id;
  const [result, setResult] = useState<{ userId: string; count: number } | null>(null);
  useEffect(() => {
    if (!enabled || !userId) return;
    let active = true;
    let sequence = 0;
    async function refresh() {
      const request = ++sequence;
      try {
        const users = await accessApi.users();
        if (active && sequence === request) {
          setResult({ userId: userId!, count: users.filter(needsAssignment).length });
        }
      } catch {
        if (active && sequence === request) setResult(null);
      }
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener(USERS_CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(USERS_CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, userId, organization, path]);
  return enabled && result && result.userId === userId ? result.count : 0;
}

"use client";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AdminShell } from "@/components/admin/AdminShell";
export function ManagementFrame({children}:{children:ReactNode}) {
  const {user}=useAuth();
  return user?.role==="admin" ? <AdminShell>{children}</AdminShell> : <>{children}</>;
}

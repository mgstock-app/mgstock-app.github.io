"use client";
import { useAuth } from "@/components/auth/AuthProvider";
import { AccessGate } from "@/components/auth/AccessGate";
import { OwnerHome } from "@/components/owner/OwnerHome";
import { AlessandroOwnerHome } from "@/components/owner/AlessandroOwnerHome";
import { AdminHome } from "@/components/admin/AdminHome";
import { AdminShell } from "@/components/admin/AdminShell";
import { ReportPortal } from "./ReportPortal";
import { GerenteHome } from "./GerenteHome";
import { isGestlokGerente } from "@/utils/permissions";
export function HomeEntry() {
  const { user } = useAuth();
  if (isGestlokGerente(user)) return <AccessGate gerenteHome><GerenteHome /></AccessGate>;
  if (user?.role === "admin") return <AccessGate><AdminShell><AdminHome /></AdminShell></AccessGate>;
  return user?.role === "owner"
    ? <AccessGate>{user.owner_public_id === "2026002" ? <AlessandroOwnerHome key={user.user_id} user={user} /> : <OwnerHome key={user.user_id} user={user} />}</AccessGate>
    : <ReportPortal />;
}

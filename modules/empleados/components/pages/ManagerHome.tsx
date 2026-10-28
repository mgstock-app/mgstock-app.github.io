"use client";
import { useAuth } from "@/components/auth/AuthProvider";
import { SharedOwnerCode } from "@/components/invitations/SharedOwnerCode";
import { GerenteHome } from "./GerenteHome";
export function ManagerHome() {
  const { user } = useAuth();
  return <>
    <GerenteHome/>
    {user?.organization_id && <section className="management-page"><SharedOwnerCode key={user.organization_id} organization={user.organization_id}/></section>}
  </>;
}

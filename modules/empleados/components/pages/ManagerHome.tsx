"use client";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { SharedOwnerCode } from "@/components/invitations/SharedOwnerCode";

export function ManagerHome() {
  const { user } = useAuth();
  return (
    <section className="management-page">
      <h1>Mis carpetas</h1>
      <section className="organization-home">
        <div>
          <h2><Link href="/horarios">📁 Horarios</Link></h2>
          <p>Planilla compartida con el dueño y los demás gerentes de tu empresa. Todos pueden cargar y modificar los horarios.</p>
        </div>
        <div>
          <h2><Link href="/mi-reporte">📁 Mi reporte</Link></h2>
          <p>Tu imagen de sueldo personal. Solo vos y el dueño autorizado pueden consultarla.</p>
        </div>
      </section>
      {user?.organization_id && <SharedOwnerCode key={user.organization_id} organization={user.organization_id} />}
    </section>
  );
}

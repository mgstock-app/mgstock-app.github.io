"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { GoogleSignIn } from "./GoogleSignIn";
import { canManage, canUseSchedules, hasAssignment, isGestlokGerente } from "@/utils/permissions";
import { RegistrationChoice } from "./RegistrationChoice";
export function AccessGate({
  children,
  manager = false,
  schedules = false,
  gerenteHome = false,
}: {
  children: ReactNode;
  manager?: boolean;
  schedules?: boolean;
  gerenteHome?: boolean;
}) {
  const { user, loading, error, refresh } = useAuth();
  if (loading)
    return (
      <div className="empty-state" role="status">
        Comprobando tu acceso…
      </div>
    );
  if (error)
    return (
      <div className="empty-state">
        <h1>No pudimos comprobar tu acceso</h1>
        <p role="alert">{error}</p>
        <button onClick={() => void refresh()}>Volver a intentar</button>
      </div>
    );
  if (!user) return <GoogleSignIn />;
  // Gerente de GESTLOK: su portada privada contiene Colaboradores; también se habilita Horarios. El resto sigue restringido.
  if (isGestlokGerente(user))
    return schedules || gerenteHome ? (
      children
    ) : (
      <div className="empty-state">
        <h1>Acceso restringido</h1>
        <p>Como gerente solo podés usar la carpeta Horarios.</p>
        <Link href="/horarios">Ir a Horarios</Link>
      </div>
    );
  if (!hasAssignment(user) && user.status !== "rejected")
    return <RegistrationChoice />;
  if (!hasAssignment(user))
    return (
      <div className="empty-state">
        <h1>
          {user.status === "rejected"
            ? "Acceso no habilitado"
            : "Tu cuenta está pendiente de asignación"}
        </h1>
        <p>
          {user.display_name}, tu cuenta ya está registrada. Necesitás un rol y
          un local asignados para acceder a los reportes. Pedile a tu dueño que
          vincule tu correo desde Dueños y empresas; así tu solicitud aparecerá
          únicamente en su espacio privado.
        </p>
        <button className="primary-button" onClick={() => void refresh()}>
          Revisar mi estado
        </button>
      </div>
    );
  if ((manager && !canManage(user)) || (schedules && !canUseSchedules(user)))
    return (
      <div className="empty-state">
        <h1>Acceso restringido</h1>
        <p>Esta sección está disponible para la administración y los dueños.</p>
      </div>
    );
  return children;
}

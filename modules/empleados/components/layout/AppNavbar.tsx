"use client";
import Link from "next/link";
import { brand } from "@/utils/brand";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { usePendingUsersCount } from "@/hooks/use-pending-users-count";
import {
  canManage,
  canUseSchedules,
  hasAssignment,
  roleLabels,
} from "@/utils/permissions";
export function AppNavbar() {
  const { user, signOut } = useAuth();
  const path = usePathname();
  const pendingCount = usePendingUsersCount(user);
  if ((user?.role === "owner" && (path === "/" || path === "/horarios")) || user?.role === "admin") return null;
  return (
    <header className="app-navbar">
      <Link href="/" className="navbar-brand">
        <span className="brand-mark">{brand.initials}</span>
        <span>
          {brand.name}
          <small>
            {user?.role ? roleLabels[user.role] : "Acceso a la aplicación"}
          </small>
        </span>
      </Link>
      <nav aria-label="Navegación principal">
        {hasAssignment(user) && (
          <Link href="/" aria-current={path === "/" ? "page" : undefined}>
            {user?.role === "manager" ? "Inicio" : "Reportes"}
          </Link>
        )}
        {canManage(user) && (
          <>
            {[
              ["/empresas", "Dueños y empresas"],
              ["/asignaciones", "Asignaciones"],
              ["/usuarios", "Usuarios"],
              ["/locales", "Locales"],
              ["/solicitudes", "Solicitudes de acceso"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
              >
                {label}
                {href === "/usuarios" && pendingCount > 0 && (
                  <span className="navbar-count" aria-label={`${pendingCount} usuarios pendientes`}>
                    {pendingCount}
                  </span>
                )}
              </Link>
            ))}
          </>
        )}
        {canUseSchedules(user) && (
          <Link
            href="/horarios"
            aria-current={path === "/horarios" ? "page" : undefined}
          >
            Horarios
          </Link>
        )}
        {hasAssignment(user) && user?.role === "manager" && (
          <Link href="/mi-reporte" aria-current={path === "/mi-reporte" ? "page" : undefined}>Mi reporte</Link>
        )}
        {user && <button onClick={() => void signOut()}>Salir</button>}
      </nav>
    </header>
  );
}

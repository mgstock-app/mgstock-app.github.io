"use client";
import { useEffect, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/browser";

/** Los perfiles aprobados ya tienen Cerrar sesión dentro de Mi perfil.
 * Si el acceso está pendiente, se ofrece un menú Mi perfil sin botón flotante
 * de salida. La acción conserva signOut({scope:"local"}) del proveedor.
 */
export function GlobalLogout() {
  const { user, signOut } = useAuth();
  const [sessionActive, setSessionActive] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    let version = 0;
    const client = createClient();
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      version += 1;
      if (alive) setSessionActive(Boolean(session?.user));
    });
    const initialVersion = version;
    void client.auth.getSession().then(({ data }) => {
      if (alive && initialVersion === version) setSessionActive(Boolean(data.session?.user));
    }).catch(() => {
      if (alive && initialVersion === version) setSessionActive(false);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!user && !sessionActive) return null;
  // Evita duplicar Mi perfil o Cerrar sesión de RoleProfileSwitcher.
  if (user?.status === "approved") return null;
  return (
    <div className="gl-empleados-session-profile">
      <button
        type="button"
        className="gl-empleados-profile-trigger"
        aria-expanded={open}
        aria-controls="gl-empleados-profile-menu"
        onClick={() => setOpen(v => !v)}
      >
        <UserRound size={18} aria-hidden="true" />
        <span>Mi perfil</span>
      </button>
      {open && (
        <div id="gl-empleados-profile-menu" className="gl-empleados-profile-menu">
          <button
            id="gl-empleados-universal-logout"
            type="button"
            className="gl-empleados-universal-logout"
            title="Cerrar sesión solo en este dispositivo"
            aria-label="Cerrar sesión de GESTLOK en este dispositivo"
            onClick={() => void signOut()}
          >
            <LogOut size={18} aria-hidden="true" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      )}
    </div>
  );
}

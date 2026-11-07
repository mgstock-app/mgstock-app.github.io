"use client";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/browser";

/** Salida visible también en la navegación simplificada del módulo Empleados.
 * No depende de rol ni de sucursal. signOut conserva scope local.
 */
export function GlobalLogout() {
  const { user, signOut } = useAuth();
  const [sessionActive, setSessionActive] = useState(false);
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
  return (
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
  );
}

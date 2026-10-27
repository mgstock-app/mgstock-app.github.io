import { Suspense, type ReactNode } from "react";
import { AccessGate } from "@/components/auth/AccessGate";
import { ManagementFrame } from "@/components/admin/ManagementFrame";
// Exportación estática de GESTLOK: no hay servidor que redirija antes de mostrar la pantalla.
// AccessGate decide qué se ve en el navegador y, además, los RPC y las políticas RLS de
// ReciboNet vuelven a comprobar la identidad y el permiso en cada consulta y cada cambio.
export default function ManagementLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p className="empty-state">Comprobando permisos…</p>}><AccessGate manager><ManagementFrame>{children}</ManagementFrame></AccessGate></Suspense>;
}

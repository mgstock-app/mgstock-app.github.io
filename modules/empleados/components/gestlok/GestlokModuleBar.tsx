"use client";
import { useGestlokCompany } from "./GestlokContext";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { isGestlokGerente } from "@/utils/permissions";

// Barra común de GESTLOK en todas las pantallas del módulo de empleados.
const home = process.env.NEXT_PUBLIC_GESTLOK_HOME || "/";
export function GestlokModuleBar() {
  const company = useGestlokCompany();
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  // La portada de gerentes ya tiene su cabecera propia; evitar barras superpuestas.
  if (pathname === "/" && (user?.role === "employee" || user?.role === "manager" || isGestlokGerente(user))) return null;
  return (
    <header className="gestlok-module-bar">
      <a className="gestlok-module-brand" href={home} aria-label="Volver al inicio de GESTLOK">
        <img src={`${home}icons/gestlok.svg`} alt="" width={30} height={30} />
        <span><b>GEST<em>LOK</em></b><small>Administrar a los empleados</small></span>
      </a>
      <div className="gestlok-module-company">
        {company?.logo_id === "mi-gusto"
          ? <div className="gestlok-module-company-brand">
              <img src={`${home}img/mi-gusto-blanco.png`} alt={company.company_name} width={562} height={278} />
              <small>Empanadas de Verdad</small>
            </div>
          : company ? <b>{company.company_name}</b> : null}
        <a className="gestlok-module-back" href={home}>← Volver a GESTLOK</a><button type="button" className="gestlok-module-back" onClick={()=>void signOut()}>Cerrar sesión</button>
      </div>
    </header>
  );
}

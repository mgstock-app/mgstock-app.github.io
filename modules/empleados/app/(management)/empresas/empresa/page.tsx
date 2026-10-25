"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CompanyHome } from "@/components/organizations/CompanyHome";
// Antes /empresas/[id]; una exportación estática no puede generar una página por empresa,
// así que el identificador viaja como parámetro. Conocerlo no da acceso: lo comprueba la base.
function CompanyFromQuery() {
  const id = useSearchParams().get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return <p className="empty-state">Empresa no disponible.</p>;
  return <CompanyHome companyId={id} />;
}
export default function CompanyPage() {
  return <Suspense fallback={<p className="empty-state">Cargando empresa…</p>}><CompanyFromQuery /></Suspense>;
}

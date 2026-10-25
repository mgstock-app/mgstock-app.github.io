"use client";
import { useEffect, useMemo, useState } from "react";
import { useOrganizationData } from "@/hooks/use-organization-data";
import { accessApi } from "@/features/access/api";
import { ReportWorkspace } from "@/components/reports/ReportWorkspace";
import type { AppLocal, AppUser } from "@/types/access";
import { useDisplayName } from "@/components/gestlok/GestlokContext";
import "./owner.css";

const ALESSANDRO_ID = "2026002";
const REQUIRED_LOCALS = ["munro", "torcuato"] as const;

export function AlessandroOwnerHome({ user }: { user: AppUser }) {
  const spaces = useOrganizationData();
  const shown = useDisplayName()("Alessandro");
  const [locals, setLocals] = useState<AppLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await accessApi.locals();
        if (active) {
          setLocals((previous) => JSON.stringify(previous) === JSON.stringify(result) ? previous : result);
          setError("");
        }
      } catch {
        if (active) setError("No se pudieron cargar los locales autorizados.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const organization = spaces.organizations.find((item) =>
    item.owner_public_id === ALESSANDRO_ID && item.name.trim().toLowerCase() === "alessandro"
  );
  const company = spaces.companies.find((item) =>
    item.organization_id === organization?.id && item.name.trim().toLowerCase() === "alessandro"
  );
  const companyLocals = useMemo(() =>
    REQUIRED_LOCALS
      .map((name) => locals.find((local) =>
        local.company_id === company?.id && local.name.trim().toLowerCase() === name
      ))
      .filter((local): local is AppLocal => Boolean(local)),
    [locals, company?.id]
  );

  if (loading || spaces.loading) return (
    <main className="alessandro-home">
      <p className="alessandro-notice" role="status">Cargando los locales de {shown}…</p>
    </main>
  );

  if (!organization || !company || companyLocals.length === 0) return (
    <main className="alessandro-home">
      <p className="alessandro-notice" role="alert">
        {error || spaces.error || `No encontramos Munro y Torcuato dentro de ${shown} (2026002) con los permisos actuales. No se modificó ninguna planilla.`}
      </p>
    </main>
  );

  return (
    <main className="alessandro-home" aria-label={`Inicio de ${shown}`}>
      {(error || spaces.error || companyLocals.length !== REQUIRED_LOCALS.length) && (
        <p className="alessandro-notice" role="alert">
          {error || spaces.error || "Falta acceso a uno de los locales: revisá los permisos de Munro y Torcuato."}
        </p>
      )}
      <ReportWorkspace user={user} locals={companyLocals} scheduleInFolderOnly />
    </main>
  );
}

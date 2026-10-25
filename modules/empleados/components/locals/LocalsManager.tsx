"use client";
import { useState } from "react";
import { useManagementData } from "@/hooks/use-management-data";
import { useOrganizationData } from "@/hooks/use-organization-data";
import Link from "next/link";
import { accessApi } from "@/features/access/api";
import type { AppLocal } from "@/types/access";
export function LocalsManager() {
  const organizations = useOrganizationData();
  const data = useManagementData();
  const [name, setName] = useState("");
  const [cycle, setCycle] = useState<AppLocal["cycle"]>("mensual");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await accessApi.createBranch(company, name.trim(), cycle);
      setName("");
      await data.refresh();
      setMessage("Local creado. Ya está disponible como carpeta en Reportes.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "No se pudo crear el local.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-page">
      <span className="eyebrow">CARPETAS DE TRABAJO</span>
      <h1>Locales</h1>
      <p>
        Organizá tus colaboradores por local y elegí si sus reportes son
        mensuales o semanales.
      </p>
      <div className="locals-grid">
        {data.locals.map((item) => (
          <article className="local-folder" key={item.id}>
            <span aria-hidden="true">▱</span>
            <h2>{item.name}</h2>
            <p>
              {item.cycle === "mensual"
                ? "Liquidación mensual"
                : "Liquidación semanal"}
            </p>
            <small>
              {
                organizations.companies.find((c) => c.id === item.company_id)
                  ?.name
              }
              {" · "}
              {
                organizations.organizations.find(
                  (o) => o.id === item.organization_id,
                )?.name
              }
            </small>
          </article>
        ))}
      </div>
      {data.error && <p role="alert">{data.error}</p>}
      {data.loading && <p role="status">Cargando locales…</p>}
      <form className="create-local-form" onSubmit={create}>
        <h2>Crear un local</h2>
        <label htmlFor="local-company">Empresa</label>
        <select
          id="local-company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          required
          disabled={busy}
        >
          <option value="">Elegí una empresa</option>
          {organizations.companies.map((c) => (
            <option key={c.id} value={c.id}>
              {
                organizations.organizations.find(
                  (o) => o.id === c.organization_id,
                )?.name
              }{" "}
              · {c.name}
            </option>
          ))}
        </select>
        <p className="hint">
          La sucursal pertenece al espacio privado de esa empresa.{" "}
          <Link href="/empresas">Crear una empresa</Link>
        </p>
        <label htmlFor="local-name">Nombre del local</label>
        <input
          id="local-name"
          required
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
          placeholder="Por ejemplo: Centro"
        />
        <label htmlFor="local-cycle">Período de los reportes</label>
        <select
          id="local-cycle"
          value={cycle}
          onChange={(event) =>
            setCycle(event.target.value as AppLocal["cycle"])
          }
          disabled={busy}
        >
          <option value="mensual">Mensual</option>
          <option value="semanal">Semanal</option>
        </select>
        <button className="primary-button" disabled={busy}>
          {busy ? "Creando…" : "Crear carpeta de local"}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { accessApi } from "@/features/access/api";
import { InvitationLinks } from "@/components/invitations/InvitationLinks";

export function CompanyCollaborators({ companyId, organizationId }: {
  companyId: string;
  organizationId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") || "").trim();
    setBusy(true);
    setMessage("");
    try {
      await accessApi.invite(organizationId, email);
      form.reset();
      setMessage("Correo vinculado al espacio. Asignale el local de esta empresa desde Asignaciones.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudo vincular el correo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="create-local-form">
      <summary>Incorporar colaboradores (opcional)</summary>
      <p>Tu empresa ya está creada. Podés vincular personas ahora o más adelante.</p>
      <InvitationLinks company={companyId} />
      <form onSubmit={invite}>
        <h2>Vincular por correo</h2>
        <p>La cuenta quedará pendiente hasta que le asignes un local y un reporte. Este paso no envía un correo.</p>
        <label htmlFor="company-collaborator-email">Correo de Google del colaborador</label>
        <input id="company-collaborator-email" name="email" type="email" required maxLength={254} disabled={busy} />
        <button className="primary-button" disabled={busy}>{busy ? "Vinculando…" : "Vincular correo"}</button>
        {message && <p role="status">{message}</p>}
      </form>
      <Link href="/asignaciones">Asignar local, reporte y permisos</Link>
    </details>
  );
}

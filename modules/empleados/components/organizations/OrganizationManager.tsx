"use client";
import { useState } from "react";
import Link from "next/link";
import { OwnerInvitations } from "@/components/invitations/OwnerInvitations";
import { SharedOwnerCode } from "@/components/invitations/SharedOwnerCode";
import { useAuth } from "@/components/auth/AuthProvider";
import { useOrganizationData } from "@/hooks/use-organization-data";
import { accessApi } from "@/features/access/api";
import { useDisplayName } from "@/components/gestlok/GestlokContext";
export function OrganizationManager() {
  const { user } = useAuth();
  const shown = useDisplayName();
  const data = useOrganizationData();
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const org =
    data.organizations.find((o) => o.id === selected) || data.organizations[0];
  async function submit(
    event: React.FormEvent<HTMLFormElement>,
    action: (form: FormData) => Promise<unknown>,
    success: string,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage("");
    try {
      await action(new FormData(form));
      form.reset();
      await data.refresh();
      setMessage(success);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "No se pudo guardar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-page">
      <span className="eyebrow">ESPACIOS PRIVADOS</span>
      <h1>Dueños y empresas</h1>
      <p>
        Cada espacio empresarial es privado y puede tener varios dueños.
        Solo aparecen los espacios que podés administrar.
      </p>
      {data.loading && <p role="status">Cargando espacios…</p>}
      {data.error && <p role="alert">{data.error}</p>}
      {message && <p role="status">{message}</p>}
      {user?.role === "admin" && <OwnerInvitations />}
      {user?.role === "admin" && (
        <form
          className="create-local-form"
          onSubmit={(e) =>
            void submit(
              e,
              (f) =>
                accessApi.createOwner(
                  String(f.get("email")),
                  String(f.get("name")),
                ),
              "Dueño creado con su espacio privado e ID de empresa.",
            )
          }
        >
          <h2>Crear cuenta de dueño</h2>
          <p>
            La persona debe registrarse primero con Google. Al crear su espacio
            quedás autorizada a administrarlo.
          </p>
          <label htmlFor="owner-email">Correo de Google del dueño</label>
          <input
            id="owner-email"
            name="email"
            type="email"
            required
            maxLength={254}
            disabled={busy}
          />
          <label htmlFor="owner-name">Nombre del espacio</label>
          <input
            id="owner-name"
            name="name"
            required
            maxLength={120}
            disabled={busy}
          />
          <button className="primary-button" disabled={busy}>
            Crear espacio privado
          </button>
        </form>
      )}
      {org ? (
        <>
          <label htmlFor="organization">Espacio a administrar</label>
          <select
            id="organization"
            value={org.id}
            onChange={(e) => setSelected(e.target.value)}
          >
            {data.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.owner_name || shown(o.name)} · {shown(o.name)}
              </option>
            ))}
          </select>
          <article className="organization-card">
            <h2>{shown(org.name)}</h2>
            <p>{org.owner_name || "Administración"}</p>
            <p>
              {org.owner_id ? "ID de empresa" : "ID del espacio"}:{" "}
              <code>{org.owner_public_id || org.id}</code>
            </p>
          </article>
          {org.owner_public_id && <SharedOwnerCode key={org.id} organization={org.id} canRenew />}
          <div className="locals-grid">
            {data.companies
              .filter((c) => c.organization_id === org.id)
              .map((c) => (
                <article key={c.id} className="local-folder">
                  <h2>{shown(c.name)}</h2>
                  <p>Espacio empresarial: {shown(org.name)}</p>
                  <Link href={`/empresas/empresa/?id=${c.id}`}>Abrir empresa</Link>
                  <br />
                  <Link href={`/horarios?empresa=${c.id}`}>
                    📁 Horarios · Gerentes
                  </Link>
                </article>
              ))}
          </div>
          <form
            className="create-local-form"
            onSubmit={(e) =>
              void submit(
                e,
                (f) => accessApi.createCompany(org.id, String(f.get("name"))),
                "Empresa creada en este espacio.",
              )
            }
          >
            <h2>Crear empresa</h2>
            <p>Podés crearla sin colaboradores y agregarlos después desde su inicio.</p>
            <label htmlFor="company-name">Nombre de la empresa</label>
            <input
              name="name"
              id="company-name"
              required
              maxLength={120}
              disabled={busy}
            />
            <button className="primary-button" disabled={busy}>
              Crear empresa
            </button>
          </form>
          {user?.role === "admin" && org.created_by === user.user_id && (
            <form
              className="create-local-form"
              onSubmit={(e) =>
                void submit(
                  e,
                  (f) =>
                    accessApi.adminAccess(
                      org.id,
                      String(f.get("email")),
                      f.get("permission") === "grant",
                    ),
                  "Autorización actualizada para este espacio.",
                )
              }
            >
              <h2>Acceso administrativo al espacio</h2>
              <p>
                Gestioná el acceso de cuentas que ya tienen el rol administrador.
                Esta opción no crea ni asigna ese rol.
              </p>
              <label htmlFor="admin-email">
                Correo de la cuenta administradora
              </label>
              <input
                id="admin-email"
                name="email"
                type="email"
                required
                maxLength={254}
                disabled={busy}
              />
              <label htmlFor="admin-permission">Permiso</label>
              <select id="admin-permission" name="permission" disabled={busy}>
                <option value="grant">Autorizar acceso a este espacio</option>
                <option value="revoke">Revocar acceso a este espacio</option>
              </select>
              <button className="primary-button" disabled={busy}>
                Guardar autorización
              </button>
            </form>
          )}
        </>
      ) : (
        !data.loading && <p>No tenés espacios asignados o autorizados.</p>
      )}
    </section>
  );
}

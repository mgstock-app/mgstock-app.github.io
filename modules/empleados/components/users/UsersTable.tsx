"use client";
import { useState } from "react";
import Link from "next/link";
import { useManagementData } from "@/hooks/use-management-data";
import { RejectAccountModal } from "./RejectAccountModal";
import { AssignmentModal } from "./AssignmentModal";
import { useAuth } from "@/components/auth/AuthProvider";
import { accessApi } from "@/features/access/api";
import { roleLabels, displayDate } from "@/utils/permissions";
import type { AppUser } from "@/types/access";
import { needsAssignment } from "@/utils/assignment-selection";
import { searchAssignmentUsers } from "@/utils/search-assignments";
import { formatOwnerLocalSummary } from "@/utils/owner-local-summary";
import { USERS_CHANGED_EVENT } from "@/hooks/use-pending-users-count";
export function UsersTable({ pendingOnly = false, assignments = false }: { pendingOnly?: boolean; assignments?: boolean }) {
  const { user } = useAuth();
  const data = useManagementData();
  const [selected, setSelected] = useState<AppUser | null>(null);
  const [rejecting, setRejecting] = useState<AppUser | null>(null);
  const [search, setSearch] = useState("");
  const [onlyPending, setOnlyPending] = useState(pendingOnly);
  const [localFilter, setLocalFilter] = useState("todos");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const localLabel = (item: AppUser) => {
    if (item.role === "owner")
      return formatOwnerLocalSummary(item, data.locals, data.companies);
    if (item.role === "manager")
      return data.companies.find((company) => company.id === item.manager_company_id)?.name || "Empresa sin asignar";
    return item.local_name || (item.role === "admin" ? "Espacios autorizados" : "Sin asignar");
  };
  const rows = searchAssignmentUsers(data.users, data.locals, data.companies, search, onlyPending, localFilter);
  async function reject() {
    if (!rejecting) return;
    setBusy(true);
    setMessage("");
    try {
      await accessApi.reject(rejecting.user_id);
      window.dispatchEvent(new Event(USERS_CHANGED_EVENT));
      setRejecting(null);
      await data.refresh();
      setMessage("Cuenta rechazada. Su acceso permanece deshabilitado.");
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "No se pudo rechazar la cuenta.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">GESTIÓN DE ACCESOS</span>
          <h1>{assignments ? "Roles y asignaciones" : pendingOnly ? "Asignaciones pendientes" : "Usuarios"}</h1>
          <p>
            {assignments
              ? "Buscá colaboradores de todos los locales y asignales la empresa, el local y su recibo privado."
              : pendingOnly
              ? "Revisá las cuentas nuevas y asignales su rol, local y reporte individual."
              : user?.role === "admin"
                ? "Usuarios de los espacios que creaste o tenés autorizados."
                : "Colaboradores y cuentas invitadas a tu espacio privado."}
          </p>
        </div>
        <button disabled={data.loading} onClick={() => void data.refresh()}>
          Actualizar
        </button>
      </div>
      <div className="assignment-search-controls">
        <div className="assignment-search-controls__input">
          <label htmlFor="user-search">Buscar por nombre, correo, empresa o local</label>
          <input
            id="user-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar colaborador…"
            autoComplete="off"
          />
        </div>
        {assignments && <>
          <div>
            <label htmlFor="assign-filter-local">Local</label>
            <select id="assign-filter-local" value={localFilter} onChange={event => setLocalFilter(event.target.value)}>
              <option value="todos">Todos los locales</option>
              {data.locals.map(local => <option key={local.id} value={local.id}>{local.name === "Torcuato" ? "Don Torcuato" : local.name}</option>)}
            </select>
          </div>
          <label className="assignment-search-controls__pending" htmlFor="assign-filter-pending">
            <input id="assign-filter-pending" type="checkbox" checked={onlyPending}
              onChange={event => setOnlyPending(event.target.checked)} />
            Solo pendientes
          </label>
        </>}
      </div>
      <p className="assignment-search-count" role="status">
        {data.loading ? "Buscando…" : `Mostrando ${rows.length} de ${data.users.length} cuentas autorizadas`}
      </p>
      {data.error && (
        <p role="alert" className="error-message">
          {data.error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {data.loading ? (
        <p role="status">Cargando usuarios…</p>
      ) : (
        <div className="table-scroll">
          <table className="users-table">
            <caption className="sr-only">
              Usuarios, roles y locales asignados
            </caption>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Local</th>
                <th>Planilla vinculada</th>
                <th>Estado</th>
                <th>Registro</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.user_id}>
                  <td>
                    <strong>{item.display_name}</strong>
                    <small>{item.email}</small>
                    {item.owner_public_id && (
                      <small>ID empresa: {item.owner_public_id}</small>
                    )}
                  </td>
                  <td>
                    {item.role ? (
                      roleLabels[item.role]
                    ) : (
                      <span className="status-badge pending">Sin asignar</span>
                    )}
                  </td>
                  <td>{localLabel(item)}</td>
                  <td>
                    {item.sheet_id ? (
                      <>
                        <span>{data.sheets.find((sheet) => sheet.id === item.sheet_id)?.name || "Planilla asignada"}</span>
                        {data.locals.find((local) => local.id === item.local_id)?.company_id && (
                          <small><Link href={`/empresas/empresa/?id=${data.locals.find((local) => local.id === item.local_id)!.company_id}`}>Abrir empresa y planillas</Link></small>
                        )}
                      </>
                    ) : item.role === "employee" ? "Sin asignar" : "No corresponde"}
                  </td>
                  <td>
                    <span className={`status-badge ${item.status}`}>
                      {
                        {
                          pending: "Pendiente",
                          approved: "Habilitado",
                          rejected: "Rechazado",
                        }[item.status]
                      }
                    </span>
                  </td>
                  <td>{displayDate(item.created_at)}</td>
                  <td>
                    {item.user_id !== user?.user_id &&
                    (!item.role ||
                      item.role === "employee" ||
                      item.role === "manager") ? (
                      <div className="row-actions">
                        <button
                          onClick={() => {
                            setMessage("");
                            setSelected(item);
                          }}
                        >
                          {needsAssignment(item) ? "Asignar rol y local" : "Editar asignación"}
                        </button>
                        {item.status === "pending" && (
                          <button onClick={() => setRejecting(item)}>
                            Rechazar
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="hint">
                        {item.user_id === user?.user_id
                          ? "Tu cuenta"
                          : "Administrado por la administración"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7}>
                    No hay usuarios que coincidan con esta búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <AssignmentModal
          key={selected.user_id}
          target={selected}
          users={data.users}
          locals={data.locals}
          companies={data.companies}
          organizations={data.organizations}
          sheets={data.sheets}
          allowUnlinkedAdminAssignment={user?.role === "admin"}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            window.dispatchEvent(new Event(USERS_CHANGED_EVENT));
            const refreshed = await data.refresh();
            setMessage(refreshed
              ? "Asignación guardada. La persona ya está habilitada; podés consultar su planilla desde esta tabla."
              : "La asignación se guardó, pero no pudimos actualizar la tabla. Pulsá Actualizar para consultar el estado guardado.");
          }}
        />
      )}
      {rejecting && (
        <RejectAccountModal
          target={rejecting}
          busy={busy}
          onClose={() => setRejecting(null)}
          onConfirm={() => void reject()}
        />
      )}
    </section>
  );
}

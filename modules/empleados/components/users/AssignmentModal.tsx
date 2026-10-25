"use client";
import { useEffect, useRef, useState } from "react";
import { accessApi } from "@/features/access/api";
import { roleLabels } from "@/utils/permissions";
import type { AppLocal, AppUser, Company } from "@/types/access";
import type { Role } from "@/types/report";
import type { SheetOption } from "@/hooks/use-management-data";
import Link from "next/link";
import { assignmentSelection, needsAssignment } from "@/utils/assignment-selection";
import { resolveAssignmentLocal } from "@/features/access/assignment-local";
import type { Organization } from "@/types/access";
export function AssignmentModal({
  target,
  users,
  locals,
  companies,
  organizations,
  sheets,
  allowUnlinkedAdminAssignment = false,
  onClose,
  onSaved,
}: {
  target: AppUser;
  users: AppUser[];
  locals: AppLocal[];
  companies: Company[];
  organizations: Organization[];
  sheets: SheetOption[];
  allowUnlinkedAdminAssignment?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [role, setRole] = useState<Role>(target.role || "employee");
  const [local, setLocal] = useState(target.local_id || "");
  const [sheet, setSheet] = useState(target.sheet_id || "");
  const [company, setCompany] = useState(target.manager_company_id || "");
  const [cycle, setCycle] = useState<AppLocal["cycle"]>("mensual");
  const mayLinkNewCollaborator = allowUnlinkedAdminAssignment && target.organization_id == null && target.status === "pending" && target.role == null && target.account_kind !== "owner";
  const selection = assignmentSelection(target, companies, locals, company, local, mayLinkNewCollaborator);
  const selectedCompany = selection.company;
  const selectedLocal = selection.local?.id || "";
  const edit = true;
  const [publish, setPublish] = useState(
    target.schedule_permissions?.publish ?? true,
  );
  const [comment, setComment] = useState(
    target.schedule_permissions?.comment ?? true,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const options: Role[] = ["employee", "manager"];
  const available = sheets.filter(
    (item) =>
      item.local === selectedLocal &&
      !users.some(
        (other) =>
          other.user_id !== target.user_id && other.sheet_id === item.id,
      ),
  );
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!selectedCompany) throw new Error("Elegí una empresa para esta persona.");
      if (selection.availableLocals.length && !selectedLocal)
        throw new Error("Elegí el local de esta empresa.");
      // The server authorizes and records the invitation before assigning a previously unlinked account.
      // No role or payroll access is granted until the assignment RPC succeeds.
      if (mayLinkNewCollaborator) await accessApi.invite(selectedCompany.organization_id, target.email);
      const destination = selectedLocal || await resolveAssignmentLocal(selectedCompany, cycle);
      if (role === "manager")
        await accessApi.assignManager(
          target.user_id,
          selectedCompany.id,
          edit,
          publish,
          comment,
          destination,
          available.some((item) => item.id === sheet) ? sheet : null,
        );
      else {
        await accessApi.assign(
          target.user_id,
          role,
          destination,
          available.some((item) => item.id === sheet) ? sheet : null,
        );
      }
      await onSaved();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar la asignación.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="assignment-dialog"
      aria-labelledby="assign-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="section-heading">
          <h2 id="assign-title">{needsAssignment(target) ? "Asignar rol y local" : "Editar asignación"}</h2>
          <button
            type="button"
            aria-label="Cerrar asignación"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p>
          <strong>{target.display_name}</strong>
          <br />
          {target.email}
        </p>
        {target.status === "approved" && !needsAssignment(target) && (
          <p role="status">Esta persona ya está habilitada y su asignación está guardada. Solo necesitás guardar si querés modificarla.</p>
        )}
        <label htmlFor="assign-role">Rol</label>
        <select
          id="assign-role"
          value={role}
          onChange={(event) => {
            setRole(event.target.value as Role);
          }}
          disabled={busy}
        >
          {options.map((value) => (
            <option key={value} value={value}>
              {roleLabels[value]}
            </option>
          ))}
        </select>
        {(role === "employee" || role === "manager") && (
          <>
            <label htmlFor="assign-company">Empresa asignada</label>
            <select
              id="assign-company"
              required
              value={selectedCompany?.id || ""}
              onChange={(e) => {
                setCompany(e.target.value);
                setLocal("");
                setSheet("");
              }}
              disabled={busy || selection.availableCompanies.length === 1}
            >
              <option value="">Elegí una empresa</option>
              {selection.availableCompanies
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {organizations.find((o) => o.id === c.organization_id)?.owner_name || organizations.find((o) => o.id === c.organization_id)?.name || "Empresa"} · {c.name}
                  </option>
                ))}
            </select>
            {!selection.availableCompanies.length && <p className="hint">No hay empresas autorizadas disponibles. Revisá las empresas y los permisos en <Link href="/empresas">Empresas</Link>.</p>}
            {mayLinkNewCollaborator && <p className="hint">Al guardar, esta cuenta pendiente quedará vinculada únicamente a la empresa seleccionada y al reporte individual que le asignes.</p>}
          </>
        )}
        {role === "manager" && (
          <>
            <fieldset className="manager-permissions">
              <legend>Permisos en Horarios</legend>
              <p>Comparte y edita los horarios con el dueño y todos los gerentes de su empresa. Su reporte de sueldo es individual y privado.</p>
              <label>
                <input
                  type="checkbox"
                  checked={publish}
                  disabled={busy || !edit}
                  onChange={(e) => setPublish(e.target.checked)}
                />{" "}
                Publicar para el dueño
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={comment}
                  disabled={busy}
                  onChange={(e) => setComment(e.target.checked)}
                />{" "}
                Escribir mensajes
              </label>
            </fieldset>
          </>
        )}
        {(role === "employee" || role === "manager") && selection.availableLocals.length > 0 && (
          <>
            <label htmlFor="assign-local">Local asignado</label>
            <select
              id="assign-local"
              required
              value={selectedLocal}
              onChange={(event) => {
                setLocal(event.target.value);
                setSheet("");
              }}
              disabled={busy || selection.availableLocals.length === 1}
            >
              <option value="">Elegí un local</option>
              {selection.availableLocals
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </>
        )}
        {(role === "employee" || role === "manager") && selectedCompany && !selection.availableLocals.length && (
          <>
            <p className="hint">Los reportes se organizarán directamente en {selectedCompany.name}. No necesitás crear una sucursal aparte.</p>
            <label htmlFor="assign-cycle">Período de los reportes</label>
            <select id="assign-cycle" value={cycle} disabled={busy} onChange={(event) => setCycle(event.target.value as AppLocal["cycle"])}>
              <option value="mensual">Mensual</option>
              <option value="semanal">Semanal</option>
            </select>
          </>
        )}
        {(role === "employee" || role === "manager") && (
          <>
            <label htmlFor="assign-sheet">Reporte individual</label>
            <select
              id="assign-sheet"
              value={sheet}
              onChange={(event) => setSheet(event.target.value)}
              disabled={busy || !selectedLocal}
            >
              <option value="">Crear una hoja para esta persona</option>
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <p className="hint">
              Solo podrá ver la imagen de esta hoja. No tendrá acceso a las
              hojas de otras personas.
            </p>
          </>
        )}
        {role === "owner" && (
          <p className="hint">
            El dueño podrá administrar los reportes y colaboradores del local
            asignado. Un local con otro dueño no puede reasignarse desde este
            formulario.
          </p>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={busy || !selectedCompany}>
            {busy ? "Guardando…" : "Guardar asignación"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

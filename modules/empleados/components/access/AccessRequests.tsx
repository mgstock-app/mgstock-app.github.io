"use client";
import { useCallback, useEffect, useState } from "react";
import { accessApi } from "@/features/access/api";
import { displayDate } from "@/utils/permissions";
import type { AccessRequest } from "@/types/access";
export function AccessRequests() {
  const [rows, setRows] = useState<AccessRequest[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setRows((await accessApi.requests()).filter((row) => row.requested_at));
      setMessage("");
    } catch (cause) {
      setRows([]);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "No se pudieron cargar las solicitudes.",
      );
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);
  async function review(id: string, approve: boolean) {
    setBusy(id);
    try {
      await accessApi.review(id, approve);
      await refresh();
      setMessage(
        approve
          ? "Permiso aprobado. Las 24 horas comienzan cuando el colaborador abra el reporte."
          : "Solicitud rechazada.",
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "No se pudo revisar la solicitud.",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="management-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ACCESO INDIVIDUAL</span>
          <h1>Solicitudes de acceso</h1>
          <p>
            Revisá las solicitudes para habilitar una nueva consulta del reporte.
          </p>
        </div>
        <button onClick={() => void refresh()}>Actualizar</button>
      </div>
      {message && <p role="status">{message}</p>}
      <div className="table-scroll">
        <table className="users-table">
          <thead>
            <tr>
              <th>Colaborador</th>
              <th>Local</th>
              <th>Solicitud</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.user_id}>
                <td>{row.display_name}</td>
                <td>{row.local_name}</td>
                <td>{displayDate(row.requested_at)}</td>
                <td>
                  {row.requested_at ? (
                    <div className="row-actions">
                      <button
                        disabled={busy === row.user_id}
                        onClick={() => void review(row.user_id, true)}
                      >
                        Habilitar 24 horas
                      </button>
                      <button
                        disabled={busy === row.user_id}
                        onClick={() => void review(row.user_id, false)}
                      >
                        Rechazar
                      </button>
                    </div>
                  ) : (
                    "Sin solicitud pendiente"
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4}>No hay solicitudes de acceso pendientes.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

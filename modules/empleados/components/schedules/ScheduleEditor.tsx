"use client";
import { useState } from "react";
import { schedulesApi } from "@/features/schedules/api";
import { emptyScheduleRows } from "@/utils/schedules";
import { formatHours, parseScheduleQuantity } from "@/utils/duration.js";
import { displayDate } from "@/utils/permissions";
import { ScheduleComments } from "./ScheduleComments";
import type { Schedule, ScheduleContext, ScheduleRow } from "@/types/schedules";
const fields = [
  ["worked", "Trabajadas"],
  ["off", "OFF / Franco"],
  ["holiday", "Feriados asistidos"],
  ["justified", "Ausencias justificadas"],
  ["unjustified", "Ausencias sin justificar"],
] as const;
export function ScheduleEditor({
  company,
  period,
  start,
  schedule,
  context,
  onSaved,
  onDirty,
  onBusy,
}: {
  company: string;
  period: Schedule["period"];
  start: string;
  schedule: Schedule | null;
  context: ScheduleContext;
  onSaved: () => Promise<void>;
  onDirty: (value: boolean) => void;
  onBusy: (value: boolean) => void;
}) {
  const [rows, setRows] = useState<ScheduleRow[]>(
    schedule?.rows || emptyScheduleRows(),
  );
  const [notes, setNotes] = useState(schedule?.notes || "");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function addRow() {
    if (rows.length >= 100) return;
    setRows(previous => [...previous, ...emptyScheduleRows(1)]);
    onDirty(true);
  }
  function removeRow(index: number) {
    if (rows.length <= 1) return;
    const row = rows[index];
    const filled = row.name.trim() || fields.some(([key]) =>
      parseScheduleQuantity(quantities[`${index}-${key}`] ?? String(row[key]), row.unit) !== 0);
    if (filled && !window.confirm(`¿Quitar la fila de ${row.name.trim() || `colaborador ${index + 1}`} de esta planilla? Se aplicará cuando guardes. Su cuenta y sus reportes no se eliminan.`)) return;
    setRows(previous => previous.filter((_, i) => i !== index));
    setQuantities(previous => {
      const next: Record<string, string> = {};
      rows.forEach((_, i) => {
        if (i === index) return;
        for (const [key] of fields) {
          const value = previous[`${i}-${key}`];
          if (value !== undefined) next[`${i > index ? i - 1 : i}-${key}`] = value;
        }
      });
      return next;
    });
    onDirty(true);
  }
  function change(index: number, patch: Partial<ScheduleRow>) {
    setRows((previous) =>
      previous.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
    onDirty(true);
  }
  async function save(publish: boolean) {
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const validatedRows = rows.map((row, index) => {
        const next = { ...row };
        for (const [key, label] of fields) {
          const value = parseScheduleQuantity(quantities[`${index}-${key}`] ?? String(row[key]), row.unit);
          if (Number.isNaN(value)) throw new Error(
            `${label}, colaborador ${index + 1}: ${row.unit === "horas" ? "usá horas:minutos (ej. 145:50), con minutos de 00 a 59" : "usá números enteros"}. El total debe estar entre 0 y 744.`);
          next[key] = value;
        }
        return next;
      });
      await schedulesApi.save(
        company,
        period,
        start,
        validatedRows,
        notes,
        publish,
        schedule?.version || 0,
      );
      onDirty(false);
      await onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar la planilla.",
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  const editable = context.permissions.edit && !busy;
  function total(row: ScheduleRow, index: number) {
    const values = fields.map(([key]) => parseScheduleQuantity(
      quantities[`${index}-${key}`] ?? String(row[key]), row.unit,
    ));
    if (values.some(Number.isNaN)) return "Revisá los valores";
    const sum = values.reduce((a, b) => a + b, 0);
    return row.unit === "horas" ? `${formatHours(sum)} hs` : `${sum} turnos`;
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Totales de los colaboradores</h2>
          <p>
            {schedule ? (
              <>
                <span
                  className={`status-badge ${schedule.status === "published" ? "approved" : "pending"}`}
                >
                  {schedule.status === "published"
                    ? "Publicado para el dueño"
                    : "Borrador"}
                </span>{" "}
                · Actualizado {displayDate(schedule.updated_at)}
              </>
            ) : (
              "Planilla nueva · agregá o quitá filas según tu equipo"
            )}
          </p>
        </div>
      </div>
      <div className="schedule-toolbar">
        <div><strong>{rows.filter(row => row.name.trim()).length} colaboradores cargados</strong><span>{rows.length} filas · hasta 100 por planilla</span></div>
        {context.permissions.edit && <button type="button" className="primary-button" disabled={!editable || rows.length >= 100} onClick={addRow}>＋ Agregar colaborador</button>}
      </div>
      <div className="schedule-guide"><span><strong>Horas</strong> Usá 145:50 o decimales: 1,5 = 1:30.</span><span><strong>Turnos</strong> Cargá números enteros.</span><span>El total incluye todas las columnas de asistencia.</span></div>
      <div className="table-scroll schedule-grid">
        <table className="users-table schedule-table">
          <caption className="sr-only">
            Totales de horarios por colaborador
          </caption>
          <thead>
            <tr>
              <th>N.º</th>
              <th>Colaborador</th>
              <th>Unidad</th>
              {fields.map(([key, label]) => (
                <th key={key}>{label}</th>
              ))}
              <th>Total</th>
              {context.permissions.edit && <th><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td><span className="schedule-row-number">{index + 1}</span></td>
                <td data-label="Colaborador">
                  <input
                    aria-label={`Colaborador ${index + 1}`}
                    list="schedule-collaborators"
                    maxLength={120}
                    placeholder="Nombre del colaborador"
                    value={row.name}
                    disabled={!editable}
                    onChange={(e) => change(index, { name: e.target.value })}
                  />
                </td>
                <td data-label="Unidad">
                  <select
                    aria-label={`Unidad del colaborador ${index + 1}`}
                    value={row.unit}
                    disabled={!editable}
                    onChange={(e) =>
                      change(index, {
                        unit: e.target.value as ScheduleRow["unit"],
                      })
                    }
                  >
                    <option value="horas">Horas</option>
                    <option value="turnos">Turnos</option>
                  </select>
                </td>
                {fields.map(([key, label]) => (
                  <td key={key} data-label={label}>
                    <input
                      type="text"
                      inputMode={row.unit === "horas" ? "text" : "numeric"}
                      placeholder={row.unit === "horas" ? "0:00" : "0"}
                      aria-label={`${label}, colaborador ${index + 1}, en ${row.unit}`}
                      value={quantities[`${index}-${key}`] ?? (row.unit === "horas" ? formatHours(row[key]) : String(row[key]))}
                      disabled={!editable}
                      onChange={(e) => {
                        setQuantities((previous) => ({ ...previous, [`${index}-${key}`]: e.target.value }));
                        onDirty(true);
                      }}
                    />
                  </td>
                ))}
                <td className="schedule-total" data-label="Total"><strong aria-label={`Total del colaborador ${index + 1}`}>{total(row, index)}</strong></td>
                {context.permissions.edit && <td className="schedule-actions"><button type="button" className="schedule-remove" aria-label={`Quitar fila ${index + 1}${row.name ? `: ${row.name}` : ""}`} title="Quitar fila de esta planilla" disabled={!editable || rows.length <= 1} onClick={() => removeRow(index)}>×</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Agregar o quitar filas se guarda junto con la planilla. No modifica cuentas ni reportes de sueldo.</p>
      <datalist id="schedule-collaborators">
        {context.collaborators.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
      <label htmlFor="schedule-notes">Observaciones para el dueño</label>
      <textarea
        id="schedule-notes"
        maxLength={4000}
        value={notes}
        disabled={!editable}
        onChange={(e) => {
          setNotes(e.target.value);
          onDirty(true);
        }}
      />
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        {context.permissions.edit && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(false)}
          >
            Guardar borrador
          </button>
        )}
        {context.permissions.publish && (
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void save(true)}
          >
            Publicar horarios para el dueño
          </button>
        )}
      </div>
      {schedule && (
        <ScheduleComments
          key={schedule.id}
          schedule={schedule.id}
          canComment={context.permissions.comment}
        />
      )}
    </>
  );
}

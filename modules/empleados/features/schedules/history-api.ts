import { rpc } from "@/features/access/api";
import type { HorarioLocal, HorarioSemana, HorarioFila, HojaArchivada } from "@/utils/schedule-history";

// Historial horarios: cada RPC vuelve a comprobar en la base quién puede ver (dueño, creadora, gerente del local)
// y quién puede marcar pagos o conectar la planilla (dueño y creadora).
export const horariosHistoryApi = {
  enVivo: (local: string) => rpc<{ desde: string; hasta: string; tablas: Record<"Resumen" | "Semana", HojaArchivada>; actualizado_at: string } | null>("rm_horarios_en_vivo", { p_local: local }),
  estadoArchivo: (local: string, desde: string) =>
    rpc<{manual:boolean; pdf:boolean; pendiente:boolean}>("rm_horarios_estado_archivo", {p_local:local,p_desde:desde}),
  archivarManual: (local: string, desde: string, actualizadoAt: string) =>
    rpc<{ok:boolean; archivada:boolean; archivo_id:string; semana:string}>("rm_horarios_archivar_manual", {p_local:local,p_desde:desde,p_actualizado_at:actualizadoAt}),
  tabla: (local: string, archivo: string, hoja: "Resumen" | "Semana") =>
    rpc<{ tabla: HojaArchivada | null; filas: HorarioFila[]; tiene_pdf: boolean }>("rm_horarios_tabla", { p_local: local, p_archivo: archivo, p_hoja: hoja }),
  archivo: (local: string, archivo: string, hoja: "Resumen" | "Semana") =>
    rpc<{ pdf: string }>("rm_horarios_archivo", { p_local: local, p_archivo: archivo, p_hoja: hoja }),
  locales: () => rpc<HorarioLocal[]>("rm_horarios_locales"),
  historial: (local: string) => rpc<HorarioSemana[]>("rm_horarios_historial", { p_local: local }),
  marcarPago: (local: string, desde: string, colaborador: string, pagado: boolean) =>
    rpc<{ ok: boolean; pagado: boolean }>("rm_horarios_marcar_pago", {
      p_local: local,
      p_desde: desde,
      p_colaborador: colaborador,
      p_pagado: pagado,
    }),
  generarCodigo: (local: string) => rpc<{ codigo: string; local_id: string }>("rm_horarios_generar_codigo", { p_local: local }),
};

// Una sola consulta por sesión para decidir si se muestra el acceso en los menús.
let localesVisibles: Promise<HorarioLocal[]> | null = null;
export function horariosHistoryLocales(): Promise<HorarioLocal[]> {
  if (!localesVisibles) {
    localesVisibles = horariosHistoryApi.locales().catch(() => {
      localesVisibles = null;
      return [];
    });
  }
  return localesVisibles;
}

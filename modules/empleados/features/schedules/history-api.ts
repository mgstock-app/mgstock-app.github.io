import { rpc } from "@/features/access/api";
import type { HorarioLocal, HorarioSemana } from "@/utils/schedule-history";

// Historial horarios: cada RPC vuelve a comprobar en la base quién puede ver (dueño, creadora, gerente del local)
// y quién puede marcar pagos o conectar la planilla (dueño y creadora).
export const horariosHistoryApi = {
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

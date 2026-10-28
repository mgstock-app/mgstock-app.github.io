import { summarizeReport } from "@/features/reports/payroll.js";
export interface PrivateReceiptPayload {
  sheet: Record<string, unknown>;
  show_holidays: boolean;
  show_vacations: boolean;
  expires_at: string;
  server_now: string;
}
export type PayrollRow = {
  key: string; label: string; type: "horas" | "turnos" | "dias" | "monto";
  quantity: number | null; rate: number | null; amount: number | null;
};
export type PayrollSummary = {
  name: string; mode: string; period: string; quantity: string; total: number; rows: PayrollRow[];
};
const significant = (row: PayrollRow) =>
  Math.abs(row.amount ?? 0) > 0 || Math.abs(row.quantity ?? 0) > 0;

/** Same calculations as the owner's PDF. No company/local name is ever requested. */
export function privateReceiptView(receipt: PrivateReceiptPayload) {
  const summary = summarizeReport(receipt.sheet, {
    id: "__private_receipt__",
    name: "",
    cycle: receipt.sheet.semDesde ? "semanal" : "mensual",
  }) as PayrollSummary;
  const rows = summary.rows
    .filter(row => row.key !== "fer" || receipt.show_holidays || significant(row))
    .filter(row => row.key !== "vac" || receipt.show_vacations || significant(row));
  const sum = rows.reduce((amount, row) => amount + (row.amount ?? 0), 0);
  return {
    summary,
    rows,
    matches: Number.isFinite(summary.total) && Math.abs(sum - summary.total) < .02,
  };
}

"use client";
import { Clock3, LockKeyhole, ReceiptText, Wallet } from "lucide-react";
import { formatHours } from "@/utils/duration.js";
import { privateReceiptView, type PrivateReceiptPayload, type PayrollRow } from "@/utils/private-receipt";
export type { PrivateReceiptPayload } from "@/utils/private-receipt";
import "./private-receipt-detail.css";

const pesos = new Intl.NumberFormat("es-AR", {
  style:"currency", currency:"ARS", minimumFractionDigits:2, maximumFractionDigits:2,
});
const nonzero = (row: PayrollRow) => Math.abs(row.amount ?? 0) > 0 || Math.abs(row.quantity ?? 0) > 0;
const countText = (row: PayrollRow) => row.quantity == null ? "—"
  : row.type === "horas" ? formatHours(row.quantity) + " hs"
    : row.type === "turnos" ? row.quantity + (row.quantity === 1 ? " turno" : " turnos")
      : row.type === "dias" ? row.quantity + (row.quantity === 1 ? " día" : " días") : "—";
const labelWithRate = (row: PayrollRow, all: PayrollRow[]) => {
  const standard = all.find(item => item.key === "trab")?.rate;
  if (!standard || row.rate == null) return row.label;
  const ratio = row.rate / standard;
  if (row.key === "extra" && Math.abs(ratio - 1.5) < .00001) return row.label + " (50%)";
  if (row.key === "fer" && Math.abs(ratio - 2) < .00001) return row.label + " (100%)";
  return row.label;
};
/** The only data in this component comes from rm_app_private_receipt_detail().
 * No local name, employer, bank account, alias, sheet ID or payment method is available.
 */
export function PrivateReceiptDetail({ receipt }: { receipt: PrivateReceiptPayload }) {
  const { summary, rows, matches } = privateReceiptView(receipt);
  const isHourly = summary.mode === "Por horas";
  return <article className="private-receipt" aria-label="Detalle de mi recibo informal">
    <header className="private-receipt__head">
      <div className="private-receipt__head-icon"><ReceiptText size={24}/></div>
      <div><span>RECIBO PERSONAL · SOLO LECTURA</span><h2>Recibo de sueldo</h2></div>
    </header>
    <div className="private-receipt__period"><span>Período liquidado</span><strong>{summary.period || "Período sin especificar"}</strong></div>
    <div className="private-receipt__who"><span>Colaborador</span><strong>{summary.name}</strong>
      <small>{isHourly ? "Liquidación por horas" : "Liquidación por turnos"}</small></div>
    <h3>Detalle {isHourly ? "de horas" : "de turnos"}</h3>
    <div className="private-receipt__table-wrap"><table className="private-receipt__table">
      <thead><tr><th scope="col">Concepto</th><th scope="col">Cantidad</th><th scope="col">Valor unitario</th><th scope="col">Importe</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.key}>
        <td>{labelWithRate(row, rows)}</td>
        <td>{countText(row)}</td>
        <td>{row.rate == null ? "—" : pesos.format(row.rate)}</td>
        <td className={row.amount != null && row.amount < 0 ? "private-receipt__deduction" : ""}>
          {row.amount == null ? "—" : pesos.format(row.amount)}
        </td>
      </tr>)}</tbody>
    </table></div>
    <div className="private-receipt__totals">
      <div><Clock3 size={19}/><span>{isHourly ? "Total de horas" : "Total de turnos / horas extra"}</span><strong>{summary.quantity}</strong></div>
      <div className="private-receipt__pay"><Wallet size={20}/><span>TOTAL A COBRAR</span><strong>{pesos.format(summary.total)}</strong></div>
    </div>
    {!matches && <p role="alert" className="private-receipt__warning">El detalle no coincide con el total. Consultá con el dueño antes del pago.</p>}
    <footer className="private-receipt__foot"><LockKeyhole size={15}/>
      <span>Comprobante informal y privado. No representa una constancia de pago ni requiere firma.
      Solo muestra los conceptos cargados y publicados para tu cuenta.</span>
    </footer>
  </article>;
}

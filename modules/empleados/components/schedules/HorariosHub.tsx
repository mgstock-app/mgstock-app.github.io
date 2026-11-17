"use client";
import { useState, type ReactNode } from "react";
import { useNavGestlok } from "@/components/gestlok/GestlokNav";
import { CalendarDays } from "lucide-react";
import { BranchScheduleLink } from "./BranchScheduleLink";
import { ScheduleHistory } from "./ScheduleHistory";
import { MunroWeeklySchedule } from "./MunroWeeklySchedule";

const miGustoCompany = "539ef513-a865-4f8d-b6ed-160af88a066c";
const branchNames: Record<string,string> = { munro: "Munro", dt: "Don Torcuato" };

export function HorariosHub({ locales = [], company, lead, children }: { locales?: string[]; company?: string; lead?: string; children?: ReactNode }) {
  const nav = useNavGestlok();
  const [selection, setSelection] = useState<{ context: string; local: string }>();
  const branches = company === miGustoCompany ? ["munro", "dt"] : locales;
  const context = JSON.stringify([company, branches, nav.local]);
  const selectedLocal = selection?.context === context ? selection.local : nav.local;
  const local = selectedLocal && branches.includes(selectedLocal) ? selectedLocal : branches[0];
  const munro = local === "munro";
  return (
    <section className="management-page schedules-page horarios-hub">
      <span className="eyebrow">ADMINISTRACIÓN DE EMPLEADOS</span>
      <h1><CalendarDays size={26} aria-hidden="true" /> {munro ? "Staff · Munro" : "Horarios"}</h1>
      <p className="horarios-hub__lead">{munro
        ? "Horarios semanales · lunes a domingo."
        : lead ?? "La planilla de Google Sheets del local y el historial de semanas, en un solo lugar."}</p>
      {children}
      {branches.length > 1 && (!nav.local || !branches.includes(nav.local)) && <div className="schedule-filters">
        <div>
          <label htmlFor="schedule-branch">Local</label>
          <select id="schedule-branch" value={local}
            onChange={event => setSelection({ context, local: event.target.value })}>
            {branches.map(id => <option key={id} value={id}>{branchNames[id] || (nav.local === id ? nav.localName : id)}</option>)}
          </select>
        </div>
      </div>}
      {munro ? <MunroWeeklySchedule /> : <>
        {local ? <BranchScheduleLink key={local} local={local} compact /> :
          company && <BranchScheduleLink key={company} company={company} compact />}
        <ScheduleHistory key={local || company} embebido localScope={local} />
      </>}
    </section>
  );
}

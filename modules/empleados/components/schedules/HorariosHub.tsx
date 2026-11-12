"use client";
import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { BranchScheduleLink } from "./BranchScheduleLink";
import { ScheduleHistory } from "./ScheduleHistory";
import { MunroWeeklySchedule } from "./MunroWeeklySchedule";

// Horarios en un solo lugar: la planilla de Google Sheets de cada local y, debajo, el historial de semanas
// (solo donde la base lo habilita; hoy Munro). Sin carpetas ni pantallas intermedias.
export function HorariosHub({ locales = [], company, lead, children }: { locales?: string[]; company?: string; lead?: string; children?: ReactNode }) {
  // Reemplazo exclusivo de Mi Gusto/Munro. Los enlaces y pantallas de los otros locales siguen como estaban.
  const munro = company === "539ef513-a865-4f8d-b6ed-160af88a066c" || locales.includes("munro");
  return (
    <section className="management-page schedules-page horarios-hub">
      <span className="eyebrow">ADMINISTRACIÓN DE EMPLEADOS</span>
      <h1><CalendarDays size={26} aria-hidden="true" /> Horarios</h1>
      <p className="horarios-hub__lead">{munro
        ? "Planilla semanal de colaboradores de Mi Gusto · Munro. El historial anterior se conserva sin cambios."
        : lead ?? "La planilla de Google Sheets del local y el historial de semanas, en un solo lugar."}</p>
      {children}
      {munro ? <>
        <MunroWeeklySchedule/>
        {/* La sucursal Torcuato conserva su planilla de Google Sheets original. */}
        {company ? <BranchScheduleLink key={company} company={company} compact excludeLocal="munro" /> :
          locales.filter(id=>id!=="munro").map(id=><BranchScheduleLink key={id} local={id} compact />)}
      </> : <>
        {company ? <BranchScheduleLink key={company} company={company} compact /> :
          locales.map(id=><BranchScheduleLink key={id} local={id} compact />)}
        <ScheduleHistory embebido />
      </>}
    </section>
  );
}

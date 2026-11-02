"use client";
import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { BranchScheduleLink } from "./BranchScheduleLink";
import { ScheduleHistory } from "./ScheduleHistory";

// Horarios en un solo lugar: la planilla de Google Sheets de cada local y, debajo, el historial de semanas
// (solo donde la base lo habilita; hoy Munro). Sin carpetas ni pantallas intermedias.
export function HorariosHub({ locales = [], company, lead, children }: { locales?: string[]; company?: string; lead?: string; children?: ReactNode }) {
  return (
    <section className="management-page schedules-page horarios-hub">
      <span className="eyebrow">ADMINISTRACIÓN DE EMPLEADOS</span>
      <h1><CalendarDays size={26} aria-hidden="true" /> Horarios</h1>
      <p className="horarios-hub__lead">{lead ?? "La planilla de Google Sheets del local y el historial de semanas, en un solo lugar."}</p>
      {children}
      {company ? <BranchScheduleLink key={company} company={company} compact /> : locales.map((id) => <BranchScheduleLink key={id} local={id} compact />)}
      <ScheduleHistory embebido />
    </section>
  );
}

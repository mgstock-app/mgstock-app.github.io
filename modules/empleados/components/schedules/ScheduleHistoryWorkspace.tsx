"use client";
import { Suspense, useState } from "react";
import { Menu } from "lucide-react";
import { OwnerSidebar } from "@/components/owner/OwnerSidebar";
import { AdminShell } from "@/components/admin/AdminShell";
import "@/components/owner/owner.css";
import { useAuth } from "@/components/auth/AuthProvider";
import { ScheduleHistory } from "./ScheduleHistory";

// Mismo marco que Horarios: creadora con su menú, dueño con el menú del dueño, gerente sin menú extra.
export function ScheduleHistoryWorkspace() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const content = (
    <Suspense fallback={<p className="empty-state">Cargando Historial horarios…</p>}>
      <ScheduleHistory />
    </Suspense>
  );
  if (user?.role === "admin") return <AdminShell>{content}</AdminShell>;
  if (user?.role !== "owner") return <main className="management-page schedules-page">{content}</main>;
  return (
    <div className="owner-home">
      <OwnerSidebar open={open} onClose={() => setOpen(false)} onOpen={() => setOpen(true)} currentPath="/historial-horarios" />
      <main className="owner-main">
        <header className="owner-header">
          <button className="owner-mobile" aria-label="Abrir menú" aria-controls="owner-navigation" aria-expanded={open} onClick={() => setOpen(!open)}><Menu /></button>
          <div><p className="owner-caption">TU ESPACIO DE TRABAJO</p></div>
        </header>
        {content}
      </main>
    </div>
  );
}

"use client";
import { AccessGate } from "@/components/auth/AccessGate";
import { useAuth } from "@/components/auth/AuthProvider";
import { EmployeeReport } from "@/components/reports/EmployeeReport";

export function PersonalReport() {
  const { user } = useAuth();
  return <AccessGate>
    {user && (user.role === "manager" || user.role === "employee") ? (
      user.sheet_id ? <EmployeeReport key={`${user.user_id}:${user.sheet_id}`} /> :
        <div className="empty-state"><h1>Mi reporte</h1><p>Tu dueño todavía debe vincular tu reporte individual desde Usuarios.</p></div>
    ) : <p className="empty-state">Esta carpeta es personal de cada colaborador o gerente.</p>}
  </AccessGate>;
}

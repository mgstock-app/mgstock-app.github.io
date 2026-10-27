import { Suspense } from "react";
import { AccessGate } from "@/components/auth/AccessGate";
import { SchedulesWorkspace } from "@/components/schedules/SchedulesWorkspace";
// Sin servidor: AccessGate filtra la pantalla y los RPC de horarios comprueban permisos en la base.
export default function SchedulesPage() {
  return (
    <Suspense fallback={<p className="empty-state">Comprobando permisos…</p>}>
      <AccessGate schedules>
        <SchedulesWorkspace />
      </AccessGate>
    </Suspense>
  );
}

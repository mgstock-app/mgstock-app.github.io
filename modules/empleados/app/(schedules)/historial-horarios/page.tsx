import { Suspense } from "react";
import { AccessGate } from "@/components/auth/AccessGate";
import { ScheduleHistoryWorkspace } from "@/components/schedules/ScheduleHistoryWorkspace";
// Historial horarios: AccessGate deja pasar a quien usa Horarios; la base decide qué locales ve cada uno.
export default function ScheduleHistoryPage() {
  return (
    <Suspense fallback={<p className="empty-state">Comprobando permisos…</p>}>
      <AccessGate schedules>
        <ScheduleHistoryWorkspace />
      </AccessGate>
    </Suspense>
  );
}

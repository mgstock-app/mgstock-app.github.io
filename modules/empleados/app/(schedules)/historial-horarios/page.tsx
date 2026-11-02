"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
// El historial ahora está dentro de Horarios (un solo lugar). Esta dirección queda para enlaces guardados.
export default function ScheduleHistoryPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/horarios");
  }, [router]);
  return <p className="empty-state">El historial ahora está dentro de Horarios…</p>;
}

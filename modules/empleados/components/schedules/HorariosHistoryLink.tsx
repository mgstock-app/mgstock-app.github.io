"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { horariosHistoryLocales } from "@/features/schedules/history-api";

// Solo aparece si la base dice que la persona ve al menos un local con historial (hoy: Munro).
export function useHorariosHistoryVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let active = true;
    void horariosHistoryLocales().then((locales) => {
      if (active) setVisible(locales.length > 0);
    });
    return () => {
      active = false;
    };
  }, []);
  return visible;
}

export function HorariosHistoryLink({ className = "schedule-history-link" }: { className?: string }) {
  const visible = useHorariosHistoryVisible();
  if (!visible) return null;
  return (
    <Link href="/historial-horarios" className={className}>
      <History size={18} aria-hidden="true" /> Historial horarios
    </Link>
  );
}

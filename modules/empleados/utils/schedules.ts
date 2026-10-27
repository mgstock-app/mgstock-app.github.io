import type { Schedule, ScheduleRow } from "@/types/schedules";
export function emptyScheduleRows(count = 10): ScheduleRow[] {
  return Array.from({ length: count }, () => ({
    name: "",
    unit: "horas",
    worked: 0,
    off: 0,
    holiday: 0,
    justified: 0,
    unjustified: 0,
  }));
}
export function todayArgentina() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((key) => parts.find((p) => p.type === key)!.value)
    .join("-");
}
export function periodStart(period: Schedule["period"], date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  if (period === "mensual") return date.slice(0, 7) + "-01";
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

/** Parse a duration, including totals greater than 24 hours. */
export function parseClockHours(value) {
  const match = /^(\d+):([0-5]\d)$/.exec(String(value).trim());
  if (!match) return NaN;
  const hours = Number(match[1]) + Number(match[2]) / 60;
  return Number.isFinite(hours) ? hours : NaN;
}

/** Keep legacy fractional-minute values intact instead of rounding stored data. */
export function formatHours(value) {
  if (value == null || value === "") return "";
  const number = Number(value);
  const minutes = Math.round(number * 60);
  if (!Number.isFinite(number) || number < 0) return String(value);
  if (Math.abs(number * 60 - minutes) > 0.000001)
    return String(number).replace(".", ",");
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export function parseScheduleQuantity(value, unit) {
  const text = String(value).trim();
  const number = unit === "horas" && text.includes(":")
    ? parseClockHours(text)
    : /^(\d+([.,]\d+)?)?$/.test(text) ? Number(text.replace(",", ".")) : NaN;
  return Number.isFinite(number) && number >= 0 && number <= 744 &&
    (unit === "horas" || Number.isInteger(number)) ? number : NaN;
}

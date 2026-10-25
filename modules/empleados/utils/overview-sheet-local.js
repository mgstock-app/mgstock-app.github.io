/**
 * Resolve a sheet's local for the read-only administrator overview.
 * Historical Torcuato sheets lack the data.local field.
 */
export function resolveOverviewSheetLocal(row, allowedLocalIds) {
  const explicit = row.data?.local;
  if (typeof explicit === "string" && explicit.length > 0) {
    return allowedLocalIds.includes(explicit) ? explicit : null;
  }

  for (const id of allowedLocalIds) {
    if (row.path.startsWith("hojas/" + id + "-")) return id;
  }
  if (allowedLocalIds.includes("dt") && /^hojas\/(?:enc|staff)[0-9]+$/.test(row.path)) {
    return "dt";
  }
  return null;
}

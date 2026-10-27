/** Only render Sheets editor URLs returned by the authenticated branch-link RPC. */
export function visibleBranchScheduleLinks(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(row =>
    row &&
    typeof row.url === "string" &&
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+\/edit(?:[?#].*)?$/.test(row.url)
  );
}


/** Copy only a validated Sheets URL, using the browser's permission-aware clipboard. */
export async function copyBranchScheduleLink(url, clipboard) {
  if (!visibleBranchScheduleLinks([{url}]).length) throw new Error("Enlace de Google Sheets inválido");
  if (!clipboard?.writeText) throw new Error("Portapapeles no disponible");
  await clipboard.writeText(url);
}

// Pending rows are returned only by the same server-authorized RPC as active links.
export function visibleBranchScheduleCards(rows) {
 if (!Array.isArray(rows)) return [];
 return rows.filter(row => visibleBranchScheduleLinks([row]).length > 0 ||
  (row && typeof row.local_id === "string" && row.local_id.length > 0 &&
   typeof row.local_name === "string" && row.url === null));
}

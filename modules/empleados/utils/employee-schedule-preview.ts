/** Open a Google Sheet in its viewer interface, not its editor.
 * This is presentation only: Google Drive must separately grant the employee
 * the Lector role, not Editor. A URL alone cannot enforce an external ACL.
 */
export function employeeSheetPreview(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.hostname !== "docs.google.com") return null;
    const match = /^\/spreadsheets\/d\/([A-Za-z0-9_-]+)\/(?:edit|preview|htmlview)\/?$/.exec(u.pathname);
    if (!match) return null;
    let gid = u.searchParams.get("gid") || "";
    if (!gid && u.hash.startsWith("#gid=")) gid = u.hash.slice(5).split("&")[0];
    if (gid && !/^\d+$/.test(gid)) return null;
    const destination = new URL("https://docs.google.com/spreadsheets/d/" + match[1] + "/preview");
    if (gid) destination.searchParams.set("gid", gid);
    return destination.toString();
  } catch {
    return null;
  }
}

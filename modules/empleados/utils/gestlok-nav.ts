// Menú de GESTLOK dentro de Administración de empleados: la app principal (misma dirección) guarda en
// localStorage («gestlok:nav») qué menú ve la persona. Acá solo se leen nombres y secciones para armar enlaces de
// vuelta; GESTLOK vuelve a comprobar los permisos al abrir cada sección. Nada de esto da acceso a datos.
export type NavItem = { go: string; label: string; folder: boolean };
export type NavGestlok = { local: string | null; localName: string; dock: Array<[string, string]>; side: NavItem[] };

export const CLAVE_NAV = "gestlok:nav";
const CLAVE = /^[A-Za-z0-9_-]{1,80}$/;
const DOCK = ["home", "business", "staff", "avisos", "pagos", "stock", "locales", "more"];
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function navPorDefecto(): NavGestlok {
  return { local: null, localName: "", dock: [["home", "Inicio"], ["staff", "Colaboradores"], ["more", "Más"]], side: [] };
}

// Devuelve el menú guardado solo si es de esta misma cuenta y tiene la forma esperada.
export function leerNavGestlok(raw: string | null | undefined, uid: string | null | undefined): NavGestlok | null {
  if (!raw || !uid) return null;
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  if (o.v !== 1 || o.uid !== uid) return null;
  const local = typeof o.local === "string" && CLAVE.test(o.local) ? o.local : null;
  const dock = (Array.isArray(o.dock) ? o.dock : [])
    .filter((t): t is [string, string] => Array.isArray(t) && DOCK.includes(t[0]) && typeof t[1] === "string" && t[1].trim() !== "")
    .map(([k, l]) => [k, l.trim().slice(0, 30)] as [string, string])
    .slice(0, 6);
  if (!dock.length) return null;
  if (!dock.some(([k]) => k === "staff")) dock.splice(Math.max(0, dock.length - 1), 0, ["staff", "Colaboradores"]);
  if (!dock.some(([k]) => k === "more")) dock.push(["more", "Más"]);
  const side = (Array.isArray(o.side) ? o.side : [])
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .filter((x) => typeof x.go === "string" && CLAVE.test(x.go) && texto(x.label, 40) !== "")
    .map((x) => ({ go: x.go as string, label: texto(x.label, 40), folder: x.folder === true }))
    .slice(0, 40);
  return { local, localName: local ? texto(o.localName, 60) : "", dock, side: local ? side : [] };
}

// Enlace a una sección del local en GESTLOK (sin local: el inicio de GESTLOK).
export function enlaceVista(home: string, nav: NavGestlok, go: string): string {
  if (!nav.local || !CLAVE.test(go)) return home;
  return `${home}?gl_ir_local=${encodeURIComponent(nav.local)}&gl_ir=${encodeURIComponent(go)}`;
}

// Cada botón de la barra de abajo, igual que en GESTLOK. «Colaboradores» es esta misma sección y «Más» abre la hoja.
export function enlaceDock(home: string, nav: NavGestlok, clave: string): string | null {
  switch (clave) {
    case "home":
      return nav.local ? enlaceVista(home, nav, "inicio") : home;
    case "locales":
      return home;
    case "business":
      return `${home}?gl_hub=business`;
    case "avisos":
      return nav.local ? enlaceVista(home, nav, "avisos") : `${home}?gl_hub=avisos`;
    case "pagos":
      return enlaceVista(home, nav, "cierre-online");
    case "stock":
      return enlaceVista(home, nav, "stock");
    default:
      return null;
  }
}

// Secciones del local para el menú lateral (PC) y la hoja «Más» (sin repetir las que ya están en la barra).
export function seccionesLocal(nav: NavGestlok, sinLasDeLaBarra = false): NavItem[] {
  if (!sinLasDeLaBarra) return nav.side;
  const enBarra = new Set(nav.dock.map(([k]) => ({ home: "inicio", pagos: "cierre-online", stock: "stock", avisos: "avisos" } as Record<string, string>)[k]).filter(Boolean));
  return nav.side.filter((s) => !enBarra.has(s.go));
}

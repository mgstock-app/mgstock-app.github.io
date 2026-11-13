"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Bell, Bike, Boxes, CalendarClock, ClipboardList, House, Menu, MessageSquare, Package, ShoppingCart, Store, Truck, UsersRound, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CLAVE_NAV, enlaceDock, enlaceVista, leerNavGestlok, navPorDefecto, seccionesLocal, type NavGestlok } from "@/utils/gestlok-nav";

// Menú de GESTLOK dentro de Administración de empleados, para no sentir que se sale de la app:
// en el celular, la misma barra de abajo (Inicio, Pagos Online, Stock Local, Colaboradores, Más);
// en la PC, las secciones del local en el menú lateral. Los enlaces vuelven a GESTLOK, que comprueba permisos.
const HOME = process.env.NEXT_PUBLIC_GESTLOK_HOME || "/";
const leer = () => {
  try {
    return window.localStorage.getItem(CLAVE_NAV);
  } catch {
    return null;
  }
};
const suscribir = (aviso: () => void) => {
  window.addEventListener("storage", aviso);
  return () => window.removeEventListener("storage", aviso);
};

export function useNavGestlok(): NavGestlok {
  const { user } = useAuth();
  const raw = useSyncExternalStore(suscribir, leer, () => null);
  const uid = user?.user_id;
  return useMemo(() => leerNavGestlok(raw, uid) ?? navPorDefecto(), [raw, uid]);
}

const ICONOS: Record<string, typeof House> = {
  home: House, inicio: House, locales: Store, business: Store, staff: UsersRound, avisos: Bell, pagos: ClipboardList,
  "cierre-online": ClipboardList, stock: Package, proveedores: Truck, "pedidos-online": ShoppingCart, "tienda-online": Store,
  chat: MessageSquare, vencimientos: CalendarClock, motos: Bike, more: Menu,
};
const Icono = ({ clave, size = 20 }: { clave: string; size?: number }) => {
  const I = ICONOS[clave] ?? Boxes;
  return <I size={size} aria-hidden="true" />;
};

export type SeccionModulo = { id: string; label: string; actual?: boolean; onSelect?: () => void; href?: string; icon?: ReactNode };

// Barra de abajo (solo celular, como en GESTLOK). «Colaboradores» marca que estás en Administración de empleados.
export function GestlokDock({ secciones = [], titulo = "Administración de empleados" }: { secciones?: SeccionModulo[]; titulo?: string }) {
  const nav = useNavGestlok();
  const pathname = usePathname();
  const enHorarios = /(?:^|\/)horarios\/?$/.test(pathname || "");
  const [abierta, setAbierta] = useState(false);
  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierta(false);
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abierta]);
  const extra = seccionesLocal(nav, true);
  return (
    <>
      <nav className="gl-module-dock gl-gestlok-dock" aria-label="Menú de GESTLOK">
        {nav.dock.map(([clave, label]) => {
          if (clave === "more")
            return (
              <button key={clave} type="button" aria-haspopup="dialog" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
                <Icono clave="more" />{label}
              </button>
            );
          if (clave === "staff" && nav.local === "munro")
            return enHorarios ? (
              <button key={clave} type="button" aria-current="page" aria-label="Staff · Horarios de Munro"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                <Icono clave="staff" />Staff
              </button>
            ) : (
              <a key={clave} href="/empleados/horarios/" aria-label="Staff · abrir Horarios de Munro">
                <Icono clave="staff" />Staff
              </a>
            );
          if (clave === "staff")
            return (
              <button key={clave} type="button" aria-current="page" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                <Icono clave="staff" />{label}
              </button>
            );
          return (
            <a key={clave} href={enlaceDock(HOME, nav, clave) ?? HOME}>
              <Icono clave={clave} />{label}
            </a>
          );
        })}
      </nav>
      {abierta && (
        <div className="gl-gestlok-sheet">
          <button type="button" className="gl-gestlok-sheet__scrim" aria-label="Cerrar más opciones" onClick={() => setAbierta(false)} />
          <section className="gl-gestlok-sheet__panel" role="dialog" aria-modal="true" aria-label="Más opciones de GESTLOK">
            <header>
              <strong>Más opciones</strong>
              <button type="button" aria-label="Cerrar" onClick={() => setAbierta(false)}><X size={22} aria-hidden="true" /></button>
            </header>
            {secciones.length > 0 && (
              <>
                <p className="gl-gestlok-sheet__grupo">{titulo}</p>
                <div className="gl-gestlok-sheet__links">
                  {secciones.map((s) =>
                    s.href ? (
                      <a key={s.id} href={s.href} aria-current={s.actual ? "page" : undefined}>{s.icon}{s.label}</a>
                    ) : (
                      <button key={s.id} type="button" aria-current={s.actual ? "page" : undefined} onClick={() => { setAbierta(false); s.onSelect?.(); }}>
                        {s.icon}{s.label}
                      </button>
                    ),
                  )}
                </div>
              </>
            )}
            <p className="gl-gestlok-sheet__grupo">{nav.local ? `GESTLOK · ${nav.localName || "tu local"}` : "GESTLOK"}</p>
            <div className="gl-gestlok-sheet__links">
              {!nav.local && <a href={HOME}><Icono clave="home" />Inicio de GESTLOK</a>}
              {extra.map((s) => (
                <a key={s.go} href={enlaceVista(HOME, nav, s.go)}><Icono clave={s.go} />{s.label}</a>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

// Menú lateral (PC y menú desplegable): las secciones del local de GESTLOK, como en la app principal.
export function GestlokLocalNav({ labelClassName, className = "gl-gestlok-localnav" }: { labelClassName: string; className?: string }) {
  const nav = useNavGestlok();
  const items = nav.local ? nav.side : [{ go: "inicio", label: "Inicio de GESTLOK", folder: false }];
  return (
    <nav className={className} aria-label={nav.local ? `GESTLOK · ${nav.localName || "tu local"}` : "GESTLOK"}>
      <p className="gl-gestlok-localnav__titulo">{nav.local ? `GESTLOK · ${nav.localName || "tu local"}` : "GESTLOK"}</p>
      {items.map((s) => (
        <a key={s.go} href={nav.local ? enlaceVista(HOME, nav, s.go) : HOME} title={s.label} className={s.folder ? "gl-gestlok-localnav__sub" : undefined}>
          <Icono clave={s.go} size={18} /><span className={labelClassName}>{s.label}</span>
        </a>
      ))}
    </nav>
  );
}

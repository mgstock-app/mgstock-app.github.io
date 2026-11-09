"use client";
// ZAYRO · Tabla de diseño aplicada a la tienda pública.
// Los cambios (editar un texto, ocultar o agregar un bloque) se guardan en gestlok_design_overrides
// (página 'zayro:tienda') y los ve cualquier visitante. Solo pueden diseñar la dueña de ZAYRO
// (camilab.lopez99@gmail.com) o la Administradora General, con su sesión de GESTLOK abierta.
// Todo es texto: nunca se inserta HTML.
import { cloneElement, Fragment, useCallback, useEffect, useMemo, useRef, useState,
  type MouseEvent, type ReactElement, type ReactNode } from "react";
import { getConfig, hasStoredSession, publicRpc, sessionClient, type SupaClient } from "./store-config";

export type DesignItem = { anchor: string; kind: "text" | "hide" | "add"; value: string };
type Selection = { key: string; block: boolean; parent: string };
type Mode = "" | "text" | "add";

const LABELS: Record<string, string> = {
  "sec.topbar": "Barra superior", "sec.hero": "Banner principal", "sec.benefits": "Beneficios",
  "sec.cats": "Categorías", "sec.catalog": "Productos", "sec.promos": "Banners inferiores",
  "sec.about": "Sobre ZAYRO", "sec.footer": "Pie de página", "sec.nav": "Menú",
  "hero.script": "Título del banner", "hero.sub": "Subtítulo del banner", "hero.cta1": "Texto «Descubrí»",
  "hero.cta2": "Texto «nuestra colección»", "hero.button": "Botón del banner",
  "catalog.title": "Título de productos", "about.title1": "Título de Sobre ZAYRO",
  "about.title2": "Final del título de Sobre ZAYRO", "about.text": "Texto de Sobre ZAYRO",
};
const label = (k: string) => LABELS[k] || k.replace(/[._-]/g, " ");

function DesignBlock({ k, text }: { k: string; text: string }) {
  const [title, ...rest] = text.split("\n");
  // Se arma con <span> para poder ir dentro de títulos y párrafos sin romper el HTML.
  return (
    <span className="zayro-zd-block" data-zd-block={k} role="note">
      <strong>{title}</strong>
      {rest.filter(line => line.trim()).map((line, i) => <span className="zayro-zd-line" key={i}>{line}</span>)}
    </span>
  );
}

export function useStoreDesign() {
  const [items, setItems] = useState<DesignItem[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [on, setOn] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [mode, setMode] = useState<Mode>("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const client = useRef<SupaClient | null>(null);
  const defaults = useRef(new Map<string, string>());

  useEffect(() => {
    let active = true;
    const wants = new URLSearchParams(window.location.search).get("diseno") === "1";
    if (wants) {
      // El aviso para abrir el diseño no queda en la dirección de la tienda.
      const url = new URL(window.location.href);
      url.searchParams.delete("diseno");
      window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
    }
    getConfig().then(async config => {
      publicRpc<DesignItem[]>(config, "gestlok_zayro_public_design")
        .then(data => { if (active && Array.isArray(data)) setItems(data.filter(x => x && typeof x.anchor === "string")); })
        .catch(() => { /* sin diseño guardado: se ve el original */ });
      if (!hasStoredSession()) { if (active && wants) setNotice("login"); return; }
      const c = await sessionClient(config).catch(() => null);
      if (!c) { if (active && wants) setNotice("login"); return; }
      const { data, error } = await c.rpc("gestlok_zayro_design_can_edit");
      if (!active) return;
      if (!error && data === true) {
        client.current = c; setCanEdit(true);
        if (wants) setOn(true);
      } else if (wants) setNotice("denied");
    }).catch(() => { if (active && wants) setNotice("login"); });
    return () => { active = false; };
  }, []);

  const textMap = useMemo(() => new Map(items.filter(i => i.kind === "text").map(i => [i.anchor, i.value])), [items]);
  const hiddenSet = useMemo(() => new Set(items.filter(i => i.kind === "hide").map(i => i.anchor)), [items]);
  const addMap = useMemo(() => new Map(items.filter(i => i.kind === "add").map(i => [i.anchor, i.value])), [items]);

  const t = useCallback((k: string, def: string) => {
    defaults.current.set(k, def);
    return textMap.get(k) ?? def;
  }, [textMap]);

  const z = useCallback((k: string, node: ReactElement<{ className?: string }>): ReactNode => {
    const hidden = hiddenSet.has(k);
    const add = addMap.get(k);
    const block = add ? <DesignBlock k={k} text={add} /> : null;
    if (hidden && !(on && showHidden)) return block ? <Fragment key={node.key ?? k}>{block}</Fragment> : null;
    const className = [node.props.className, hidden ? "zayro-zd-hidden" : "",
      on && selected && !selected.block && selected.key === k ? "zayro-zd-selected" : ""].filter(Boolean).join(" ");
    const el = cloneElement(node as ReactElement<Record<string, unknown>>, { "data-zd": k, className: className || undefined });
    return block ? <Fragment key={node.key ?? k}>{el}{block}</Fragment> : el;
  }, [hiddenSet, addMap, on, showHidden, selected]);

  const select = (next: Selection | null) => {
    setSelected(next); setMode(""); setMessage("");
    setDraft(next ? (next.block ? addMap.get(next.key) || "" : textMap.get(next.key) ?? defaults.current.get(next.key) ?? "") : "");
    if (next?.block) setMode("add");
  };

  // Con el modo diseño activo, tocar la tienda elige un elemento en vez de usarlo.
  const onClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!on) return;
    const target = e.target as HTMLElement;
    if (target.closest(".zayro-zd-ui")) return;
    e.preventDefault(); e.stopPropagation();
    const blockEl = target.closest<HTMLElement>("[data-zd-block]");
    if (blockEl) { select({ key: blockEl.dataset.zdBlock || "", block: true, parent: "" }); return; }
    let el = target.closest<HTMLElement>("[data-zd]");
    if (el && selected && !selected.block && selected.key === el.dataset.zd) {
      el = el.parentElement?.closest<HTMLElement>("[data-zd]") || el;
    }
    if (!el) { select(null); return; }
    select({ key: el.dataset.zd || "", block: false, parent: el.parentElement?.closest<HTMLElement>("[data-zd]")?.dataset.zd || "" });
  };

  const run = async (fn: string, args: Record<string, unknown>, ok: string) => {
    if (!client.current || busy) return false;
    setBusy(true); setMessage("");
    try {
      const { data, error } = await client.current.rpc(fn, args);
      if (error) throw Error(error.message || "No se pudo guardar");
      const anchor = args.p_anchor as string | null, kind = args.p_kind as string | null;
      setItems(prev => {
        let next = prev;
        if (fn === "gestlok_zayro_design_remove") return next.filter(i => !((anchor === null || i.anchor === anchor) && (kind === null || i.kind === kind)));
        const row = data as DesignItem;
        next = next.filter(i => !(i.anchor === row.anchor && i.kind === row.kind));
        return [...next, row];
      });
      setMessage(ok);
      return true;
    } catch (err) {
      setMessage("No se pudo guardar: " + ((err as Error)?.message || "revisá la conexión."));
      return false;
    } finally { setBusy(false); }
  };

  const save = (anchor: string, kind: DesignItem["kind"], value: string, ok: string) =>
    run("gestlok_zayro_design_save", { p_anchor: anchor, p_kind: kind, p_value: value, p_original: defaults.current.get(anchor) || "" }, ok);
  const remove = (anchor: string | null, kind: DesignItem["kind"] | null, ok: string) =>
    run("gestlok_zayro_design_remove", { p_anchor: anchor, p_kind: kind }, ok);

  const exit = () => { setOn(false); setSelected(null); setMode(""); setShowHidden(false); setMessage(""); };

  let ui: ReactNode = null;
  if (canEdit) {
    const sel = selected;
    const editable = !!sel && !sel.block && defaults.current.has(sel.key);
    const overridden = !!sel && textMap.has(sel.key);
    const isHidden = !!sel && hiddenSet.has(sel.key);
    const hasBlock = !!sel && addMap.has(sel.key);
    ui = (
      <>
        <button type="button" className={"zayro-zd-ui zayro-zd-toggle" + (on ? " on" : "")} aria-pressed={on}
          onClick={() => { if (on) exit(); else { setOn(true); setMessage(""); } }}>{on ? "Salir del modo diseño" : "✎ Diseñar"}</button>
        {on && <div className="zayro-zd-ui zayro-zd-bar" role="dialog" aria-label="Modo diseño de la tienda">
          {!sel ? <>
            <p><b>Modo diseño</b> Tocá un texto o una sección para editarlo, ocultarlo o agregar un bloque debajo. Tocá de nuevo para elegir la sección que lo contiene. Los cambios se ven al instante en la tienda.</p>
            <div className="zayro-zd-row">
              <button type="button" onClick={() => setShowHidden(v => !v)}>{showHidden ? "No mostrar lo oculto" : "Mostrar lo oculto"}</button>
              {items.length > 0 && <button type="button" disabled={busy} onClick={() => {
                if (window.confirm("¿Volver al diseño original? Se borran todos los cambios de diseño de la tienda.")) void remove(null, null, "Se restableció el diseño original.");
              }}>Restablecer diseño original</button>}
              <button type="button" onClick={exit}>Salir</button>
            </div>
          </> : <>
            <p><b>{sel.block ? "Bloque agregado" : label(sel.key)}</b>{isHidden ? " · oculto" : ""}</p>
            {(mode === "text" || mode === "add") && <textarea value={draft} maxLength={2000} rows={mode === "add" ? 4 : 3} autoFocus
              placeholder={mode === "add" ? "Primera línea: título\nDespués, el texto del bloque" : ""}
              onChange={e => setDraft(e.target.value)} aria-label={mode === "add" ? "Texto del bloque" : "Nuevo texto"} />}
            <div className="zayro-zd-row">
              {mode === "text" ? <>
                <button type="button" className="primary" disabled={busy || !draft.trim()} onClick={async () => {
                  const def = defaults.current.get(sel.key) || "";
                  const ok = draft.trim() === def ? await remove(sel.key, "text", "Volvió al texto original.") : await save(sel.key, "text", draft, "Texto guardado.");
                  if (ok) setMode("");
                }}>Guardar texto</button>
                <button type="button" onClick={() => setMode("")}>Cancelar</button>
              </> : mode === "add" ? <>
                <button type="button" className="primary" disabled={busy || !draft.trim()} onClick={async () => {
                  if (await save(sel.key, "add", draft, "Bloque guardado.")) { setMode(""); if (sel.block) select(null); }
                }}>Guardar bloque</button>
                {(sel.block || hasBlock) && <button type="button" disabled={busy} onClick={async () => {
                  if (await remove(sel.key, "add", "Bloque borrado.")) select(null);
                }}>Borrar bloque</button>}
                <button type="button" onClick={() => sel.block ? select(null) : setMode("")}>Cancelar</button>
              </> : <>
                {editable && <button type="button" onClick={() => { setDraft(textMap.get(sel.key) ?? defaults.current.get(sel.key) ?? ""); setMode("text"); }}>Editar texto</button>}
                {overridden && <button type="button" disabled={busy} onClick={() => void remove(sel.key, "text", "Volvió al texto original.")}>Volver al texto original</button>}
                <button type="button" disabled={busy} onClick={() => isHidden ? void remove(sel.key, "hide", "Se volvió a mostrar.") :
                  void save(sel.key, "hide", "", "Oculto en la tienda. Lo ves con «Mostrar lo oculto».")}>{isHidden ? "Volver a mostrar" : "Ocultar"}</button>
                <button type="button" onClick={() => { setDraft(addMap.get(sel.key) || ""); setMode("add"); }}>{hasBlock ? "Editar bloque de abajo" : "Agregar bloque debajo"}</button>
                {sel.parent && <button type="button" onClick={() => select({ key: sel.parent, block: false,
                  parent: document.querySelector<HTMLElement>('[data-zd="' + sel.parent + '"]')?.parentElement?.closest<HTMLElement>("[data-zd]")?.dataset.zd || "" })}>Elegir la sección</button>}
                <button type="button" onClick={() => select(null)}>Listo</button>
              </>}
            </div>
          </>}
          {message && <p className="zayro-zd-msg" role="status">{message}</p>}
        </div>}
      </>
    );
  } else if (notice) {
    ui = (
      <div className="zayro-zd-ui zayro-zd-notice" role="status">
        <p>{notice === "denied" ? "Esta cuenta no puede diseñar la tienda ZAYRO." :
          "Para diseñar la tienda, ingresá a GESTLOK con la cuenta de ZAYRO y volvé a abrir este enlace."}</p>
        <div className="zayro-zd-row">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- GESTLOK se abre con carga completa (sesión y scripts propios). */}
          {notice === "login" && <a href="/">Ingresar a GESTLOK</a>}
          <button type="button" onClick={() => setNotice("")}>Cerrar</button>
        </div>
      </div>
    );
  }

  return { t, z, on, onClickCapture, ui };
}

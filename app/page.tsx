import markup from "@/lib/stock/markup.json";
import { StockRuntime } from "@/components/stock-runtime";
import { GestLokIntro } from "@/components/gestlok-intro";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function Home() {
  return (
    <>
      <div id="stock-root" dangerouslySetInnerHTML={{ __html: markup }} />
      <GestLokIntro />
      <a className="gestlok-demo-entry" href={`${basePath}/?demo=1`}>Explorar demo interactiva (datos ficticios)</a>
      <StockRuntime />
      <nav className="stock-legal-nav" aria-label="Información legal de GestLok">
        <a href={`${basePath}/privacidad.html`}>Privacidad</a>
        <a href={`${basePath}/terminos.html`}>Condiciones de uso</a>
        <a href={`${basePath}/almacenamiento.html`}>Cookies y almacenamiento</a>
      </nav>
      <style>{`
        .gestlok-demo-entry { display:none; position:fixed; left:50%; bottom:58px; transform:translateX(-50%); z-index:56; background:#126c9c; color:white; padding:11px 16px; border-radius:12px; text-align:center; font:600 13px system-ui,sans-serif; max-width:calc(100vw - 24px); text-decoration:none; }\n        html.auth-on .gestlok-demo-entry { display:block; }\n        .stock-legal-nav { display:none; position:fixed; left:12px; bottom:78px; z-index:55; flex-wrap:wrap; gap:12px; padding:7px 10px; max-width:calc(100vw - 24px);
          border:1px solid #d7dfe9; border-radius:9px; background:rgba(255,255,255,.97);
          box-shadow:0 3px 14px #17243a22; font:500 11px/1.5 system-ui,sans-serif; }
        .stock-legal-nav a { color:#25476b; text-decoration:underline; text-underline-offset:2px; }
        html.auth-on .stock-legal-nav { display:flex; left:50%; bottom:10px; transform:translateX(-50%); justify-content:center; }
        @media(max-width:420px) { .stock-legal-nav { gap:7px; font-size:10px; } }
      `}</style>
    </>
  );
}

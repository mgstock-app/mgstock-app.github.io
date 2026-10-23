import markup from "@/lib/stock/markup.json";
import { StockRuntime } from "@/components/stock-runtime";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function Home() {
  return (
    <>
      <div id="stock-root" dangerouslySetInnerHTML={{ __html: markup }} />
      <StockRuntime />
      <nav className="stock-legal-nav" aria-label="Información legal de GestLok">
        <a href={`${basePath}/privacidad.html`}>Privacidad</a>
        <a href={`${basePath}/terminos.html`}>Condiciones de uso</a>
        <a href={`${basePath}/almacenamiento.html`}>Cookies y almacenamiento</a>
      </nav>
      <style>{`
        .stock-legal-nav { position:fixed; left:12px; bottom:78px; z-index:55;
          display:flex; flex-wrap:wrap; gap:12px; padding:7px 10px; max-width:calc(100vw - 24px);
          border:1px solid #d7dfe9; border-radius:9px; background:rgba(255,255,255,.97);
          box-shadow:0 3px 14px #17243a22; font:500 11px/1.5 system-ui,sans-serif; }
        .stock-legal-nav a { color:#25476b; text-decoration:underline; text-underline-offset:2px; }
        html.auth-on .stock-legal-nav { left:50%; bottom:10px; transform:translateX(-50%); justify-content:center; }
        @media(max-width:420px) { .stock-legal-nav { gap:7px; font-size:10px; } }
      `}</style>
    </>
  );
}

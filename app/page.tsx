import type { Metadata } from "next";
import { GestlokHome } from "@/components/gestlok-home";
import "./inicio-publico.css";

// Inicio publicitario de gestlok.com.ar. La app (ingreso y paneles) vive en /login/.
export const metadata: Metadata = {
  title: "GESTLOK Chat | Pedidos por chat para tu comercio, las 24 horas",
  description: "GESTLOK Chat: tus clientes piden solos por chat, con tu carta y tus promos. Confirmás desde tu panel, sugiere bebida o postre y pide la reseña en Google.",
  alternates: { canonical: "/" },
};

// Siguen yendo directo a /login/: los enlaces de la app que llegan a la raíz (Google,
// confirmación de email, recuperación de contraseña, invitaciones con ?… o #…), la app
// instalada y los «Volver a GESTLOK» de las micro apps (Empleados, Caja…), que apuntan a «/».
// Desde /conocer/ y /demo/ (páginas públicas) se vuelve al inicio publicitario, no a la app.
const REDIRIGIR_A_LA_APP = "(function(){try{var h=location.hash||'';var nuestro=!h||/^#(inicio|como-funciona|demo|beneficios|micro-apps|contacto)?$/.test(h);" +
  "var instalada=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;" +
  "var r='';try{var u=new URL(document.referrer);if(u.origin===location.origin)r=u.pathname;}catch(e){}" +
  "var desdeApp=!!r&&r!=='/'&&!/^\\/(conocer\\/?|demo\\/?|[a-z-]+\\.html)$/.test(r);" +
  "if(location.search||!nuestro||instalada||desdeApp){location.replace('/login/'+location.search+h);}}catch(e){}})();";

export default function Home() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: REDIRIGIR_A_LA_APP }} />
      <GestlokHome />
    </>
  );
}

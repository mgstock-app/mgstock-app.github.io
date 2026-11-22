import type { Metadata } from "next";
import { GestlokHome } from "@/components/gestlok-home";
import "./inicio-publico.css";

// Inicio publicitario de gestlok.com.ar. La app (ingreso y paneles) vive en /login/.
export const metadata: Metadata = {
  title: "GESTLOK | Micro apps para comercios",
  description: "GESTLOK: tu negocio, en orden. Micro apps para comercios: atención por chat, caja, stock, precios, personal y más, desde el celular o la computadora.",
  alternates: { canonical: "/" },
};

// Enlaces de la app que llegan a la raíz (Google, confirmación de email, recuperación de
// contraseña, invitaciones con ?… o #…) y la app instalada siguen yendo directo a /login/.
const REDIRIGIR_A_LA_APP = "(function(){try{var h=location.hash||'';var nuestro=/^#(inicio|micro-apps|contacto)?$/.test(h);" +
  "var instalada=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;" +
  "if(location.search||!nuestro||instalada){location.replace('/login/'+location.search+h);}}catch(e){}})();";

export default function Home() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: REDIRIGIR_A_LA_APP }} />
      <GestlokHome />
    </>
  );
}

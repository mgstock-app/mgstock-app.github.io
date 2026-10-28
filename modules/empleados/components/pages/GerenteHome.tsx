"use client";
import { useState } from "react";
import Link from "next/link";
import { ClipboardList, FileSpreadsheet, House, Menu, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ManagerLegajos } from "@/components/legajos/ManagerLegajos";
import "./gerente-home.css";

export function GerenteHome() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [section, setSection] = useState<"legajos" | "horarios">("legajos");
  const firstName = user?.display_name?.split(" ")[0] || "Gerente";
  return <div className="gl-gerente">
    <aside className={"gl-gerente__sidebar" + (menuOpen?" is-open":"")} aria-label="Menú del gerente">
      <div className="gl-gerente__brand"><span>G</span><div><strong>GESTLOK</strong><small>ORGANIZÁ · CONTROLÁ · HACÉ CRECER</small></div></div>
      <div className="gl-gerente__local-label">TU LOCAL · ADMINISTRACIÓN DE EMPLEADOS</div>
      <nav>
        <button type="button" className={section==="legajos"?"active":""} onClick={()=>{setSection("legajos");setMenuOpen(false)}}><House size={19}/> Administrar empleados</button>
        <button type="button" className={section==="horarios"?"active":""} onClick={()=>{setSection("horarios");setMenuOpen(false)}}><FileSpreadsheet size={19}/> Sector de Google</button>
      </nav>
      <p className="gl-gerente__security"><ShieldCheck size={16}/> Solo colaboradores de tus locales autorizados.</p>
    </aside>
    {menuOpen&&<button type="button" className="gl-gerente__scrim" aria-label="Cerrar menú" onClick={()=>setMenuOpen(false)}/>}
    <main className="gl-gerente__main">
      <header className="gl-gerente__header">
        <button type="button" className="gl-gerente__menu" aria-label={menuOpen?"Cerrar menú":"Abrir menú"} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X size={22}/>:<Menu size={22}/>}</button>
        <div><strong>GEST<span>LOK</span></strong><small>ORGANIZÁ · CONTROLÁ · HACÉ CRECER</small></div>
        <span className="gl-gerente__user">Hola, {firstName}<small>Gerente</small></span>
      </header>
      <div className="gl-gerente__content">
        {section==="legajos" ? <ManagerLegajos/> :
          <section className="gl-gerente__google">
            <h1><FileSpreadsheet size={25}/> Sector de Google</h1>
            <p>Las planillas de Google Sheets se encuentran dentro de cada local, bajo su lista de colaboradores. También podés abrir la carpeta de Horarios.</p>
            <Link href="/horarios" className="gl-gerente__google-link"><ClipboardList size={19}/> Abrir Google Sheets y horarios</Link>
            <button type="button" onClick={()=>setSection("legajos")}>Volver a los legajos</button>
          </section>}
      </div>
    </main>
  </div>;
}

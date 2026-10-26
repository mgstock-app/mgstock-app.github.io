"use client";
import Link from "next/link";
export function GerenteHome() {
  return (
    <section className="management-page">
      <h1>Administración de empleados</h1>
      <section className="organization-home">
        <div>
          <h2><Link href="/horarios">📁 Horarios</Link></h2>
          <p>Planilla de turnos de tu local. Podés abrirla, cambiar el enlace, agregarlo o quitarlo.</p>
        </div>
      </section>
    </section>
  );
}

"use client";
import { useEffect, useState } from "react";

// Mostrar la presentación una sola vez por pestaña/sesión de navegación.
// Evita repetirla cuando Next remonta Inicio al volver de una micro app.
const KEY = "gestlok:intro-shown";
export function GestLokIntro() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(KEY) === "1") return;
      window.sessionStorage.setItem(KEY, "1");
    } catch {
      // Si el almacenamiento está bloqueado, no interrumpir la navegación.
      return;
    }
    setVisible(true);
  }, []);
  if (!visible) return null;
  return (
    <div className="gl-intro" aria-hidden="true">
      <span className="gl-intro-ring gl-intro-ring-one" />
      <span className="gl-intro-ring gl-intro-ring-two" />
      <div className="gl-intro-content">
        <div className="gl-intro-title">GESTLOK</div>
        <p className="gl-intro-tagline">Todo tu negocio, en orden.</p>
        <div className="gl-intro-progress"><span /></div>
      </div>
    </div>
  );
}

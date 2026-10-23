"use client";

import { useEffect, useState } from "react";

// Una presentación visual, no un bloqueo de autenticación ni una carga de datos.
// La animación se oculta por CSS aun si el JavaScript tarda en iniciar.
const REPLAY_AFTER_BACKGROUND_MS = 45_000;

export function GestLokIntro() {
  const [opening, setOpening] = useState(0);

  useEffect(() => {
    let backgroundSince: number | null = null;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        backgroundSince = Date.now();
      } else if (backgroundSince !== null) {
        if (Date.now() - backgroundSince >= REPLAY_AFTER_BACKGROUND_MS) {
          // Las PWAs pueden reanudarse sin recargar: volver a mostrar la intro
          // solo tras una ausencia prolongada, sin interrumpir cambios breves de app.
          setOpening((current) => current + 1);
        }
        backgroundSince = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return (
    <div key={opening} className="gl-intro" aria-hidden="true">
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

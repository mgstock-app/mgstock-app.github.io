"use client";

// La presentación se reproduce solamente al cargar la aplicación desde cero.
// Regresar desde otra app no interrumpe un conteo.
export function GestLokIntro() {
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

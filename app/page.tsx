/** Inicio canónico: el acceso a GESTLOK se hace en /login/.
 * Redirección cliente compatible con export estático de GitHub Pages,
 * sin alterar /chat/ ni los demás módulos del sitio. */
export default function RootRedirect() {
  return (
    <main style={{minHeight:"100dvh",display:"grid",placeItems:"center",fontFamily:"system-ui,sans-serif",padding:"24px"}}>
      <div style={{textAlign:"center"}}>
        <h1>GESTLOK</h1>
        <p>Ingresá a tu cuenta para continuar.</p>
        <a href="/login/">Ir a iniciar sesión</a>
      </div>
      <script dangerouslySetInnerHTML={{__html: "location.replace('/login/' + location.search + location.hash);"}} />
    </main>
  );
}

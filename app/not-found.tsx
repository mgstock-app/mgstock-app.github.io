"use client";
import {useEffect,useState} from "react";
import Link from "next/link";

// GitHub Pages es estático. Las sucursales registradas después del despliegue
// llegan por el 404 y se resuelven con la misma sesión y validación de slug.
export default function NotFound(){
 const [redirecting,setRedirecting]=useState(false);
 useEffect(()=>{
  const slug=/^\/gestlok-wai-([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(window.location.pathname)?.[1];
  if(slug&&slug.length>=3&&slug.length<=60){
   setRedirecting(true);
   window.location.replace("/chat/wai/?local="+encodeURIComponent(slug));
  }
 },[]);
 return <main style={{minHeight:"70vh",display:"grid",placeItems:"center",padding:24}}>
  <section style={{textAlign:"center"}}><h1>{redirecting?"Abriendo GESTLOK WAI…":"Página no encontrada"}</h1>
   {!redirecting&&<p>Revisá el enlace o <Link href="/">volvé a GESTLOK</Link>.</p>}
  </section>
 </main>;
}

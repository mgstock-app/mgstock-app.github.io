"use client";
import { useCallback, useEffect, useState } from "react";
import { Link2, RefreshCcw } from "lucide-react";
import { rpc } from "@/features/access/api";
import type { Persona } from "@/features/schedules/munro-model";
import "./munro-employee-links.css";

type Cuenta={usuario_id:string;nombre:string;email:string;colaborador_id:number|null};
export function MunroEmployeeLinks({personas}:{personas:Persona[]}){
 const [cuentas,setCuentas]=useState<Cuenta[]>([]);
 const [elecciones,setElecciones]=useState<Record<string,string>>({});
 const [cargando,setCargando]=useState(true);
 const [guardando,setGuardando]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [mensaje,setMensaje]=useState("");
 const cargar=useCallback(async()=>{
  setCargando(true);setError("");
  try{
   const lista=await rpc<Cuenta[]>("rm_munro_horarios_cuentas_listar");
   setCuentas(lista);
   setElecciones(Object.fromEntries(lista.map(c=>[c.usuario_id,c.colaborador_id===null?"":String(c.colaborador_id)])));
  }catch{setError("No fue posible consultar las cuentas de colaboradores de Munro.");}
  finally{setCargando(false);}
 },[]);
 useEffect(()=>{void cargar();},[cargar]);
 const guardar=async(c:Cuenta)=>{
  const raw=elecciones[c.usuario_id]??"";
  const id=raw===""?null:Number(raw);
  if(raw!==""&&(id===null||!Number.isInteger(id)||!personas.some(p=>p.id===id))){setError("Seleccioná un colaborador válido.");return;}
  setGuardando(c.usuario_id);setError("");setMensaje("");
  try{
   await rpc("rm_munro_horarios_cuentas_vincular",{p_usuario:c.usuario_id,p_colaborador:id});
   setMensaje("Vinculación guardada. El colaborador ya puede consultar su resumen personal.");
   await cargar();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar la vinculación.");}
  finally{setGuardando(null);}
 };
 return <details className="mel" aria-label="Vincular cuentas a horarios individuales">
  <summary><Link2 size={17} aria-hidden="true"/> Vincular colaboradores a sus cuentas</summary>
  <div className="mel-contenido">
   <p>Elegí qué ficha de Staff corresponde a cada cuenta aprobada de Munro. Hasta vincularla, la persona no ve datos de horarios. Cada cuenta podrá consultar <strong>solo su resumen</strong>.</p>
   <button type="button" className="mel-actualizar" disabled={cargando||Boolean(guardando)}
    onClick={()=>void cargar()}><RefreshCcw size={15}/> Actualizar cuentas</button>
   {error&&<p role="alert" className="mel-error">{error}</p>}
   {mensaje&&<p role="status" className="mel-exito">{mensaje}</p>}
   {cargando?<p role="status">Cargando cuentas…</p>:
    cuentas.length===0?<p>No hay cuentas de colaboradores aprobadas para Munro.</p>:
    <div className="mel-lista">{cuentas.map(c=><div className="mel-cuenta" key={c.usuario_id}>
     <div className="mel-identidad"><strong>{c.nombre||"Colaborador"}</strong><small>{c.email}</small></div>
     <label>Ficha de Staff
      <select value={elecciones[c.usuario_id]??""} onChange={e=>setElecciones(prev=>({...prev,[c.usuario_id]:e.target.value}))}
       disabled={Boolean(guardando)} aria-label={"Ficha de Staff de "+(c.nombre||c.email)}>
       <option value="">Sin vincular</option>
       {personas.filter(p=>p.nombre.trim()).map(p=><option key={p.id} value={p.id}>{p.nombre} · {p.modalidad==="hora"?"Por hora":"Por turno"}</option>)}
      </select>
     </label>
     <button type="button" disabled={Boolean(guardando)||(elecciones[c.usuario_id]??"")===(c.colaborador_id===null?"":String(c.colaborador_id))}
      onClick={()=>void guardar(c)}>{guardando===c.usuario_id?"Guardando…":"Guardar vínculo"}</button>
    </div>)}</div>}
  </div>
 </details>;
}

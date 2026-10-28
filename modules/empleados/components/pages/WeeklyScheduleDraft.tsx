"use client";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

type Shift = { name: string; days: string[] };
const days = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const empty = (): Shift[] => [{name:"",days:Array(7).fill("")}];
export function WeeklyScheduleDraft() {
  const { user } = useAuth();
  const key = `gestlok:weekly-draft:${user?.user_id ?? "unknown"}`;
  const [rows,setRows] = useState<Shift[]>(() => {
    if (typeof window === "undefined") return empty();
    try {
      const stored = window.localStorage.getItem(key);
      if (!stored) return empty();
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every((r) => typeof r?.name === "string" && Array.isArray(r.days) && r.days.length === 7 && r.days.every((d: unknown) => typeof d === "string"))) return parsed;
    } catch { return empty(); }
    return empty();
  });
  const [editing,setEditing] = useState(false);
  const [message,setMessage] = useState("");
  const update = (i:number, d:number, value:string) => setRows(prev => prev.map((r,j) => j===i ? {...r,days:r.days.map((v,k)=>k===d?value:v)} : r));
  const canEdit = user?.role === "manager" || user?.role === "owner" || user?.role === "admin";
  return <div>
    <p style={{fontSize:13,color:"#52666c"}}>Plantilla semanal · Turnos futuros · Mañana / Tarde / Franco</p>
    <div style={{overflowX:"auto",border:"1px solid #dbe6e9",borderRadius:12}}>
      <table style={{borderCollapse:"collapse",width:"100%",minWidth:690}}>
        <thead><tr><th style={{padding:10,background:"#073844",color:"white"}}>Colaborador</th>{days.map(d=><th key={d} style={{padding:10,background:"#073844",color:"white"}}>{d}</th>)}</tr></thead>
        <tbody>{rows.map((r,i)=><tr key={i}><td style={{padding:6}}>{editing?<input aria-label={`Nombre ${i+1}`} value={r.name} onChange={e=>setRows(prev=>prev.map((v,j)=>j===i?{...v,name:e.target.value}:v))} style={{width:110}}/>:(r.name||"Sin asignar")}</td>{r.days.map((v,d)=><td key={d} style={{padding:6,background:v.toLowerCase().includes("franco")?"#fce6e6":v.toLowerCase().includes("mañana")?"#dff4eb":v.toLowerCase().includes("tarde")?"#e3edff":"#f6fafb"}}>{editing?<input aria-label={`${days[d]} de ${r.name||"colaborador"}`} value={v} placeholder="Horario / Franco" onChange={e=>update(i,d,e.target.value)} style={{width:100}}/>:(v||"—")}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
      {canEdit && !editing && <button type="button" onClick={()=>setEditing(true)}>Modificar</button>}
      {canEdit && editing && <>
        <button type="button" onClick={()=>setRows(prev=>[...prev,{name:"",days:Array(7).fill("")}])}>Agregar colaborador</button>
        <button type="button" onClick={()=>{try{window.localStorage.setItem(key,JSON.stringify(rows));setEditing(false);setMessage("Borrador guardado en este navegador. No está publicado para el equipo.");}catch{setMessage("No se pudo guardar.");}}}>Guardar borrador</button>
      </>}
    </div>
    <p role="status" style={{fontSize:13,color:"#52666c"}}>{message||"Vista de diseño: los datos aún no se comparten entre usuarios ni sucursales."}</p>
  </div>;
}

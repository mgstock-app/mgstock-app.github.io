"use client";
import { useEffect, useState } from "react";
import { CalendarDays, RefreshCcw } from "lucide-react";
import { rpc } from "@/features/access/api";
import { diasSemana, evaluarDia, fechaCorta, fechasFeriadoColaborador, formatoHoras, resumenLiquidacion, type Modalidad, type SemanaHorarios } from "@/features/schedules/munro-model";
import "./employee-munro-weekly-summary.css";

type SemanaPersonal={semana:string;datos:SemanaHorarios;modalidad:Modalidad;nombre:string;feriados:string[];finalizada:boolean};
type Respuesta={vinculado:boolean;semanas:SemanaPersonal[]};
const titulo=(f:string)=>fechaCorta(f)+" al "+fechaCorta(diasSemana(f)[6]);
const cantidad=(modalidad:Modalidad,valor:number)=>modalidad==="hora"?formatoHoras(valor)+" h":valor+" "+(valor===1?"turno":"turnos");
const franja=(e?:string,s?:string)=>e||s?(e||"—")+" a "+(s||"—"):"—";

export function EmployeeMunroWeeklySummary(){
 const [data,setData]=useState<Respuesta|null>(null);
 const [semana,setSemana]=useState("");
 const [cargando,setCargando]=useState(true);
 const [error,setError]=useState("");
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let activo=true;
  rpc<Respuesta>("rm_munro_horarios_mi_resumen").then(r=>{
   if(!activo)return;
   setData(r);
   setSemana(actual=>r.semanas?.some(s=>s.semana===actual)?actual:"");
   setError("");
  }).catch(()=>{if(activo)setError("No pudimos consultar tu resumen personal. Reintentá o avisá al encargado.");})
   .finally(()=>{if(activo)setCargando(false);});
  return()=>{activo=false};
 },[revision]);
 const actual=data?.semanas?.find(s=>s.semana===semana);
 const dias=actual?diasSemana(actual.semana):[];
 const calculo=actual?resumenLiquidacion(actual.modalidad,actual.datos,actual.semana,actual.feriados):null;
 const feriados=actual?fechasFeriadoColaborador(actual.datos,actual.semana,actual.feriados):[];
 return <section className="ems" aria-label="Mi resumen semanal personal">
  <div className="ems-encabezado">
   <div><h2><CalendarDays size={20} aria-hidden="true"/> Mi resumen semanal</h2>
     <p>Solo lectura · tus horarios y tu liquidación en horas o turnos.</p></div>
   <button type="button" className="ems-actualizar" disabled={cargando}
    onClick={()=>{setCargando(true);setRevision(n=>n+1);}} aria-label="Actualizar mi resumen semanal">
    <RefreshCcw size={17}/>
   </button>
  </div>
  {cargando?<p role="status">Cargando tu resumen…</p>:
   error?<p role="alert">{error}</p>:
   !data?.vinculado?<p className="ems-aviso">Tu cuenta todavía no está vinculada a tu ficha de horarios de Munro. Solicitale al gerente que la vincule desde Staff. No se muestran horarios de otras personas.</p>:
   !data.semanas.length?<p>Por ahora no hay semanas cargadas en tu ficha de horarios.</p>:
   actual&&calculo?<>
    <button type="button" className="ems-volver" onClick={()=>setSemana("")}>← Volver a semanas</button>
    <h3 className="ems-semana-titulo">Semana {titulo(actual.semana)}</h3>
    <p className="ems-nombre">Colaborador: <strong>{actual.nombre}</strong></p>
    <div className="ems-tabla-scroll">
     <table className="ems-dias">
      <thead><tr><th scope="col">Día</th><th scope="col">Mañana</th><th scope="col">Noche</th><th scope="col">Trabajado</th><th scope="col">Estado</th></tr></thead>
      <tbody>{dias.map((fecha,i)=>{
       const d=actual.datos[fecha]||{};
       const jornada=evaluarDia(d,actual.finalizada);
       const estado=[
        d.descanso==="off"?"OFF":d.descanso==="medio_off"?"Medio OFF":"",
        d.vacaciones_dia?"Vacaciones":"",
        feriados.includes(fecha)?"Feriado":""
       ].filter(Boolean).join(" · ");
       const trabajado=actual.modalidad==="hora"?formatoHoras(jornada.horas)+" h":jornada.turnos+" t";
       return <tr key={fecha}>
        <th scope="row">{["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"][i]} {fechaCorta(fecha)}</th>
        <td>{franja(d.tm_e,d.tm_s)}</td><td>{franja(d.tt_e,d.tt_s)}</td>
        <td>{jornada.errores.length?"Revisar":trabajado}</td>
        <td>{estado||"—"}</td>
       </tr>;
      })}</tbody>
     </table>
    </div>
    <dl className="ems-liquidacion">
     <div><dt>{actual.modalidad==="hora"?"Horas trabajadas":"Turnos trabajados"}</dt><dd>{cantidad(actual.modalidad,calculo.trabajados)}</dd></div>
     <div><dt>OFF</dt><dd>{cantidad(actual.modalidad,calculo.off)}</dd></div>
     {calculo.vacacionesDias.length>0&&<div><dt>Vacaciones</dt><dd>{cantidad(actual.modalidad,calculo.vacaciones)}</dd></div>}
     {feriados.length>0&&<div><dt>Adicional feriado</dt><dd>{cantidad(actual.modalidad,calculo.extraFeriado)}</dd></div>}
     <div className="ems-total"><dt>Total final a liquidar</dt><dd>{calculo.total===null||calculo.errores.length||calculo.pendientes?"Pendiente":<strong>{cantidad(actual.modalidad,calculo.total)}</strong>}</dd></div>
     {calculo.observaciones&&<div><dt>Observaciones</dt><dd>{calculo.observaciones}</dd></div>}
    </dl>
   </>:<div className="ems-semanas" aria-label="Semanas de mi resumen">
    <p>Elegí una semana para consultar tus horarios.</p>
    {data.semanas.map(s=><button type="button" key={s.semana} className="ems-semana-card"
      onClick={()=>setSemana(s.semana)} aria-label={"Ver semana "+titulo(s.semana)}>
      <span>Semana {titulo(s.semana)}</span>
      <small>{s.finalizada?"Finalizada":"En curso"}</small>
    </button>)}
   </div>}
 </section>;
}

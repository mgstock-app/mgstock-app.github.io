"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Save } from "lucide-react";
import { rpc } from "@/features/access/api";
import { ScheduleHistory } from "./ScheduleHistory";
import {
 diasSemana,evaluarDia,fechaCorta,formatoHoras,revisarSemana,resumenPersona,semanaActual,
 sumarDias,type Estado,type Persona,type Planilla,type Registro,type SemanaHorarios,
} from "@/features/schedules/munro-model";
import "./munro-weekly.css";

type Borrador = Persona & {datos:SemanaHorarios;version:number};
type Pestaña = "semana"|"historial"|"resumen";
const ESTADOS: readonly Estado[]=["activo","refuerzo","inactivo"];
const CAMPOS = [
 ["tm_e","Entrada TM"],["tm_s","Salida TM"],["tt_e","Entrada TT"],["tt_s","Salida TT"]
] as const;
const DIAS=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const aviso=(e:unknown)=>e instanceof Error?e.message:"No se pudo actualizar Horarios. Intentá nuevamente.";
const formatoTurnos=(n:number)=>n+" "+(n===1?"turno":"turnos");
const semanaLabel=(s:string)=>fechaCorta(s)+" al "+fechaCorta(sumarDias(s,6));
const limiteFuturo=()=>semanaActual();

export function MunroWeeklySchedule(){
 const [semana,setSemana]=useState(()=>semanaActual());
 const [planilla,setPlanilla]=useState<Planilla|null>(null);
 const [filas,setFilas]=useState<Borrador[]>([]);
 const [pendientes,setPendientes]=useState<number[]>([]);
 const [pestana,setPestana]=useState<Pestaña>("semana");
 const [diaSeleccionado,setDiaSeleccionado]=useState<number>(0);
 const [editando,setEditando]=useState(false);
 const [cargando,setCargando]=useState(true);
 const [guardando,setGuardando]=useState(false);
 const [error,setError]=useState("");
 const [mensaje,setMensaje]=useState("");
 const [agregando,setAgregando]=useState(false);
 const [nombreNuevo,setNombreNuevo]=useState("");
 const [momento,setMomento]=useState(()=>new Date());
 const puedeEditar=planilla?.puede_editar===true;
 const dias=useMemo(()=>diasSemana(semana),[semana]);
 const enRevision=revisarSemana(semana,momento);

 const cargar=useCallback(async()=>{
   setCargando(true);setError("");
   try{
     const p=await rpc<Planilla>("rm_munro_horarios_obtener",{p_semana:semana});
     const actual=p.personas.map(persona=>{
       const registro=p.planillas.find(x=>x.id===persona.id);
       return {...persona,datos:registro?.datos||{},version:registro?.version||0};
     });
     setPlanilla(p);setFilas(actual);setPendientes([]);setEditando(false);
   }catch(e){setError(aviso(e));}
   finally{setCargando(false);}
 },[semana]);
 useEffect(()=>{let active=true;queueMicrotask(()=>{if(active)void cargar();});return()=>{active=false;};},[cargar]);
 useEffect(()=>{
   const timer=window.setInterval(()=>setMomento(new Date()),30000);
   return()=>window.clearInterval(timer);
 },[]);
 useEffect(()=>{
   const onBeforeUnload=(event:BeforeUnloadEvent)=>{
     if(pendientes.length){event.preventDefault();event.returnValue="";}
   };
   window.addEventListener("beforeunload",onBeforeUnload);
   return()=>window.removeEventListener("beforeunload",onBeforeUnload);
 },[pendientes.length]);
 const cambiar=(id:number,updater:(anterior:Borrador)=>Borrador)=>{
   if(!editando||!puedeEditar)return;
   setFilas(actual=>actual.map(f=>f.id===id?updater(f):f));
   setPendientes(actual=>actual.includes(id)?actual:[...actual,id]);
   setMensaje("");
 };
 const cambiarDia=(id:number,dia:string,campo:string,valor:string|boolean)=>{
   cambiar(id,f=>({...f,datos:{...f.datos,[dia]:{...(f.datos[dia]||{}),[campo]:valor}}}));
 };
 const seleccionarSemana=(siguiente:string)=>{
   if(pendientes.length&&!window.confirm("Hay cambios sin guardar. ¿Descartarlos y cambiar de semana?"))return;
   setSemana(siguiente);setDiaSeleccionado(0);setMensaje("");
 };
 const guardar=async()=>{
   if(!puedeEditar||!editando||guardando)return;
   if(!pendientes.length){setEditando(false);return;}
   // Los turnos imposibles se rechazan siempre. Durante la semana una entrada sola sí se guarda.
   for(const f of filas.filter(f=>pendientes.includes(f.id))){
     if(!f.nombre.trim()&&Object.keys(f.datos).length){
       setError("Ingresá el nombre antes de cargar los horarios.");return;
     }
     for(const fecha of dias){
       const r=evaluarDia(f.datos[fecha]||{},enRevision);
       if(r.errores.length){setError((f.nombre||"Colaborador "+f.id)+", "+fechaCorta(fecha)+": "+r.errores[0]);return;}
     }
   }
   setError("");setGuardando(true);
   try{
     // Escritura con versión de cada colaborador: no pisa cambios desde otro dispositivo.
     for(const f of filas.filter(f=>pendientes.includes(f.id))){
       await rpc("rm_munro_horarios_guardar",{
         p_persona:f.id,p_semana:semana,p_nombre:f.nombre,
         p_estado:f.estado,p_datos:f.datos,p_version:f.version
       });
     }
     await cargar();setMensaje("Horarios guardados correctamente.");
   }catch(e){
     setError(aviso(e)+" Si se guardó alguna fila, actualizá antes de seguir.");
     // No limpiar el borrador automáticamente si falló alguna escritura.
   }finally{setGuardando(false);}
 };
 const agregar=async()=>{
   if(!nombreNuevo.trim()||guardando)return;
   setGuardando(true);setError("");
   try{
     await rpc("rm_munro_horarios_agregar",{p_nombre:nombreNuevo.trim()});
     setNombreNuevo("");setAgregando(false);
     await cargar();setMensaje("Colaborador por hora agregado.");
   }catch(e){setError(aviso(e));}
   finally{setGuardando(false);}
 };
 const registros=useMemo(()=>Object.values(
   (planilla?.historial||[]).reduce<Record<string,Registro[]>>((m,r)=>{
     (m[r.semana]??=[]).push(r);return m;
   },{})
 ),[planilla?.historial]);
 const filasResumen=filas.filter(f=>f.nombre.trim()).map(f=>({
   ...f,resumen:resumenPersona(f.modalidad,f.datos,semana,momento)
 }));
 const totalPorHora=filasResumen.filter(f=>f.modalidad==="hora").reduce((a,f)=>a+f.resumen.computados,0);
 const totalTurnos=filasResumen.filter(f=>f.modalidad==="turno").reduce((a,f)=>a+f.resumen.computados,0);
 const totalEnRevision=filasResumen.filter(f=>f.resumen.errores>0).length;
 const cabecera=(f:Borrador)=>f.nombre.trim()||("Colaborador "+f.id+" · "+(f.modalidad==="turno"?"por turno":"por hora"));
 const datosDia=(f:Borrador,dia:string)=>f.datos[dia]||{};
 const estadoBotones=(f:Borrador)=><div className="mhs-estado" role="group" aria-label={"Estado de "+cabecera(f)}>
   {ESTADOS.map(estado=><button key={estado} type="button"
     disabled={!editando||!puedeEditar||guardando} aria-pressed={f.estado===estado}
     onClick={()=>cambiar(f.id,anterior=>({...anterior,estado}))}>
     {estado==="activo"?"Activo":estado==="refuerzo"?"Refuerzo":"Inactivo"}
   </button>)}
 </div>;
 const inputsDia=(f:Borrador,dia:string)=> {
   const d=datosDia(f,dia),verificar=evaluarDia(d,enRevision);
   return <div className={"mhs-cuatro"+(verificar.errores.length?" mhs-error":"")}>
     {CAMPOS.map(([campo,label])=><label key={campo}>
       <span>{label}</span>
       <input aria-label={label+" · "+cabecera(f)+" · "+fechaCorta(dia)} type="time" step={60}
         disabled={!editando||!puedeEditar||guardando}
         aria-invalid={verificar.campos.includes(campo)}
         value={d[campo]||""} onChange={e=>cambiarDia(f.id,dia,campo,e.target.value)}/>
     </label>)}
     <label className="mhs-feriado"><input type="checkbox" checked={d.feriado===true}
       disabled={!editando||!puedeEditar||guardando} onChange={e=>cambiarDia(f.id,dia,"feriado",e.target.checked)}/>
       Feriado</label>
     {verificar.errores.length>0&&<small className="mhs-revisar">{verificar.errores.join(" ")}</small>}
   </div>;
 };
 return <section className="mhs" aria-label="Planilla semanal de colaboradores de Munro">
   <nav className="mhs-pestanas" aria-label="Vistas de Horarios">
     {([["semana","Semana actual"],["historial","Historial"],["resumen","Resumen semanal"]] as const)
       .map(([id,label])=><button key={id} type="button" aria-current={pestana===id?"page":undefined}
         onClick={()=>{if(pendientes.length&&!window.confirm("Hay cambios sin guardar. ¿Descartarlos?"))return;
           if(pendientes.length){void cargar();}setPestana(id);}}>{label}</button>)}
   </nav>
   {error&&<p className="mhs-alerta" role="alert">{error}</p>}
   {mensaje&&<p className="mhs-exito" role="status">{mensaje}</p>}
   {cargando&&<p role="status">Cargando Horarios de Munro…</p>}
   {!cargando&&planilla&&<>
     {pestana!=="historial"&&<div className="mhs-toolbar">
       <div className="mhs-semana">
         <button type="button" aria-label="Semana anterior" onClick={()=>seleccionarSemana(sumarDias(semana,-7))}><ChevronLeft size={18}/></button>
         <span><CalendarDays size={18}/> Semana del {semanaLabel(semana)}</span>
         <button type="button" aria-label="Semana siguiente" disabled={semana>=limiteFuturo()}
           onClick={()=>seleccionarSemana(sumarDias(semana,7))}><ChevronRight size={18}/></button>
       </div>
       {pestana==="semana"&&puedeEditar&&<div className="mhs-acciones">
         {!editando?<button type="button" onClick={()=>setEditando(true)}><Pencil size={17}/> Modificar</button>:
           <><button type="button" onClick={()=>{if(pendientes.length&&!window.confirm("¿Descartar los cambios?"))return;void cargar();}}>Cancelar</button>
             <button className="mhs-primario" type="button" disabled={guardando} onClick={()=>void guardar()}><Save size={17}/>{guardando?"Guardando…":"Guardar"}</button></>}
       </div>}
     </div>}
     {enRevision&&pestana==="semana"&&<p className="mhs-alerta" role="status">
       Revisión semanal desde el domingo a las 23:30 (hora argentina): completá los turnos pendientes antes del historial.
     </p>}
     {pestana==="semana"&&<>
       <p className="mhs-ayuda">Tres colaboradores por turno y cinco por hora. Cargá los nombres y horarios cuando quieras.
         Durante la semana podés guardar una entrada sin salida. Los días feriados se identifican por separado.</p>
       <div className="mhs-movil-dias" role="group" aria-label="Día a mostrar">
         {dias.map((dia,i)=><button key={dia} type="button" aria-pressed={diaSeleccionado===i}
            onClick={()=>setDiaSeleccionado(i)}><b>{DIAS[i]}</b><span>{fechaCorta(dia)}</span></button>)}
       </div>
       <div className="mhs-tabla-wrap">
         <table className="mhs-tabla">
           <thead><tr><th scope="col">Colaborador</th>{dias.map((dia,i)=><th key={dia} scope="col">{DIAS[i]}<small>{fechaCorta(dia)}</small></th>)}<th scope="col">Total semanal</th></tr></thead>
           <tbody>{filas.map(f=>{
             const r=resumenPersona(f.modalidad,f.datos,semana,momento);
             return <tr key={f.id} className={f.estado==="inactivo"?"mhs-inactivo":""}>
               <th scope="row"><div className="mhs-colaborador">
                 <span className="mhs-modalidad">{f.modalidad==="turno"?"Por turno":"Por hora"}</span>
                 {editando&&puedeEditar?<input type="text" maxLength={80} placeholder={"Nombre · "+cabecera(f)}
                   value={f.nombre} disabled={guardando} onChange={e=>cambiar(f.id,prev=>({...prev,nombre:e.target.value}))}
                   aria-label={"Nombre del colaborador "+f.id}/>:<strong>{cabecera(f)}</strong>}
                 {estadoBotones(f)}
               </div></th>
               {dias.map(dia=><td key={dia}>{inputsDia(f,dia)}</td>)}
               <td className="mhs-total">
                 <b>{r.errores? "Revisar":f.modalidad==="hora"?formatoHoras(r.computados)+" h":formatoTurnos(r.computados)}</b>
                 {r.pendientes>0&&<small>{r.pendientes} pendientes</small>}
               </td>
             </tr>;
           })}</tbody>
         </table>
       </div>
       <div className="mhs-movil-lista">{filas.map(f=>{
         const dia=dias[diaSeleccionado],r=resumenPersona(f.modalidad,f.datos,semana,momento);
         return <article className="mhs-card" key={f.id}>
           <header><div><span className="mhs-modalidad">{f.modalidad==="hora"?"Por hora":"Por turno"}</span>
             {editando&&puedeEditar?<input value={f.nombre} placeholder={"Nombre · Colaborador "+f.id}
               onChange={e=>cambiar(f.id,prev=>({...prev,nombre:e.target.value}))}/>:
               <h3>{cabecera(f)}</h3>}</div>
             <strong>{r.errores?"Revisar":f.modalidad==="hora"?formatoHoras(r.computados)+" h":formatoTurnos(r.computados)}</strong>
           </header>
           {estadoBotones(f)}
           {inputsDia(f,dia)}
         </article>;
       })}</div>
       {puedeEditar&&<div className="mhs-agregar">
         {!agregando?<button type="button" onClick={()=>setAgregando(true)}><Plus size={17}/> Agregar colaborador por hora</button>:
         <form onSubmit={e=>{e.preventDefault();void agregar();}}>
           <label>Nombre del nuevo colaborador (siempre por hora)
             <input value={nombreNuevo} maxLength={80} onChange={e=>setNombreNuevo(e.target.value)} required/></label>
           <button type="submit" disabled={guardando}>Agregar</button>
           <button type="button" onClick={()=>{setAgregando(false);setNombreNuevo("");}}>Cancelar</button>
         </form>}
       </div>}
     </>}
     {pestana==="resumen"&&<div className="mhs-resumen">
       <div className="mhs-resumen-totales">
         <div><small>Colaboradores</small><strong>{filasResumen.length}</strong></div>
         <div><small>Horas computadas</small><strong>{formatoHoras(totalPorHora)} h</strong></div>
         <div><small>Turnos computados</small><strong>{totalTurnos}</strong></div>
         <div><small>Pendientes de revisión</small><strong>{totalEnRevision}</strong></div>
       </div>
       {(["turno","hora"] as const).map(modalidad=><section key={modalidad}>
         <h3>{modalidad==="turno"?"Colaboradores por turno":"Colaboradores por hora"}</h3>
         <div className="mhs-resumen-desbordar"><table>
           <thead><tr><th>Colaborador</th><th>{modalidad==="turno"?"Trabajados":"Horas normales"}</th>
             <th>{modalidad==="turno"?"Extra por feriado":"Horas feriado"}</th>
             <th>Total computado</th><th>Estado</th></tr></thead>
           <tbody>{filasResumen.filter(f=>f.modalidad===modalidad).map(f=><tr key={f.id}>
             <td>{f.nombre}</td><td>{modalidad==="turno"?f.resumen.turnos:formatoHoras(f.resumen.horas)}</td>
             <td>{modalidad==="turno"?"+"+f.resumen.extraFeriado:formatoHoras(f.resumen.horasFeriado)}</td>
             <td><strong>{f.resumen.errores?"Revisar":modalidad==="turno"?formatoTurnos(f.resumen.computados):formatoHoras(f.resumen.computados)+" h"}</strong></td>
             <td>{f.resumen.errores?"Revisar":f.resumen.pendientes?"Incompleto":f.estado}</td>
           </tr>)}</tbody>
         </table></div>
       </section>)}
       <p>Los turnos feriados cuentan doble: 2 turnos trabajados en feriado + 2 extra = 4 turnos computados.
          Los importes de sueldos se configurarán en otra etapa.</p>
       <section className="mhs-historial-resumen">
         <h3>Historial de resúmenes</h3>
         {registros.length===0?<p>Todavía no hay semanas anteriores en esta planilla.</p>:
           registros.slice(0,8).map(grupo=>{
             const fecha=grupo[0].semana;
             const a=grupo.filter(r=>r.modalidad==="hora").reduce((n,r)=>n+resumenPersona(r.modalidad,r.datos,fecha,momento).computados,0);
             const t=grupo.filter(r=>r.modalidad==="turno").reduce((n,r)=>n+resumenPersona(r.modalidad,r.datos,fecha,momento).computados,0);
             return <div className="mhs-archivo-resumen" key={fecha}>
               <div><strong>Semana {semanaLabel(fecha)}</strong><small>{grupo.length} colaboradores · {formatoHoras(a)} horas · {t} turnos</small></div>
               <button type="button" onClick={()=>{seleccionarSemana(fecha);setPestana("resumen");}}>Ver detalle</button>
             </div>;
           })}
       </section>
     </div>}
     {pestana==="historial"&&<div className="mhs-historial">
       <h2>Historial de la nueva planilla</h2>
       {registros.length===0?<p>Todavía no hay semanas cerradas con la nueva planilla.</p>:
       registros.map(grupo=>{
         const inicio=grupo[0].semana;
         const completos=grupo.every(r=>resumenPersona(r.modalidad,r.datos,inicio,momento).completo);
         return <details key={inicio}>
           <summary>Semana {semanaLabel(inicio)} · {grupo.length} colaboradores · {completos?"Cerrada":"Revisar horarios"}</summary>
           <div className="mhs-resumen-desbordar"><table>
             <thead><tr><th>Colaborador</th><th>Modalidad</th><th>Trabajado</th><th>Adicional feriado</th><th>Total</th></tr></thead>
             <tbody>{grupo.map(r=>{
               const c=resumenPersona(r.modalidad,r.datos,inicio,momento);
               return <tr key={r.id}><td>{r.nombre}</td><td>{r.modalidad==="turno"?"Turnos":"Horas"}</td>
                 <td>{r.modalidad==="turno"?c.turnos:formatoHoras(c.horas)}</td>
                 <td>{r.modalidad==="turno"?c.extraFeriado:formatoHoras(c.horasFeriado)}</td>
                 <td>{c.completo?(r.modalidad==="turno"?formatoTurnos(c.computados):formatoHoras(c.computados)+" h"):"Pendiente"}</td>
               </tr>;
             })}</tbody>
           </table></div>
         </details>;
       })}
       <h2>Historial anterior conservado</h2>
       <p>Se conservan intactas las semanas y los archivos anteriores de Google Sheets, incluidos sus controles de pago.</p>
       <ScheduleHistory embebido soloArchivo />
     </div>}
   </>}
 </section>;
}

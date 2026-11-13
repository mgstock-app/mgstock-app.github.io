"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Save } from "lucide-react";
import { rpc } from "@/features/access/api";
import { ScheduleHistory } from "./ScheduleHistory";
import {
 diasSemana,evaluarDia,fechaAR,fechaCorta,feriadoHabilitado,vacacionesHabilitadas,formatoHoras,revisarSemana,resumenPersona,resumenLiquidacion,semanaActual,
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
 const [feriados,setFeriados]=useState<string[]>([]);
 const [reintento,setReintento]=useState(0);
 const revisiones=useRef<Record<number,number>>({});
 const guardadoEnCurso=useRef(false);
 const intentoAutomatico=useRef("");

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
     revisiones.current={};intentoAutomatico.current="";
     setFeriados(p.feriados||[]);
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
     if(pendientes.length||guardando){event.preventDefault();event.returnValue="";}
   };
   window.addEventListener("beforeunload",onBeforeUnload);
   return()=>window.removeEventListener("beforeunload",onBeforeUnload);
 },[pendientes.length,guardando]);
 // Sincronización entre dispositivos cada 15 segundos, sin pisar un borrador abierto.
 useEffect(()=>{
   if(editando||pendientes.length)return;
   let activo=true;
   const timer=window.setInterval(async()=>{
     try{
       const p=await rpc<Planilla>("rm_munro_horarios_obtener",{p_semana:semana});
       if(!activo)return;
       setPlanilla(p);
       setFilas(p.personas.map(persona=>{
         const r=p.planillas.find(x=>x.id===persona.id);
         return {...persona,datos:r?.datos||{},version:r?.version||0};
       }));
       setFeriados(p.feriados||[]);
     }catch{/* Mantener los datos actuales hasta recuperar la conexión. */}
   },15000);
   return()=>{activo=false;window.clearInterval(timer);};
 },[semana,editando,pendientes.length]);
 const cambiar=(id:number,updater:(anterior:Borrador)=>Borrador)=>{
   if(!editando||!puedeEditar)return;
   revisiones.current[id]=(revisiones.current[id]||0)+1;
   setFilas(actual=>actual.map(f=>f.id===id?updater(f):f));
   setPendientes(actual=>actual.includes(id)?actual:[...actual,id]);
   setMensaje("");setError("");
 };
 const cambiarDia=(id:number,dia:string,campo:string,valor:string|boolean)=>{
   cambiar(id,f=>({...f,datos:{...f.datos,[dia]:{...(f.datos[dia]||{}),[campo]:valor}}}));
 };
 const cambiarOpcion=(f:Borrador,tipo:"feriado"|"vacaciones",habilitar:boolean)=>{
   const indicador=tipo==="feriado"?"feriados_habilitados":"vacaciones_habilitadas";
   const marca=tipo==="feriado"?"feriado":"vacaciones_dia";
   cambiar(f.id,prev=>{
     const datos={...prev.datos};
     for(const fecha of dias){
       // Al desactivar, borrar marcas invisibles para que el resumen no las siga sumando.
       if(!habilitar)datos[fecha]={...(datos[fecha]||{}),[marca]:false};
       // Mantener la selección histórica si esta semana ya tenía un feriado global.
       else if(tipo==="feriado"&&prev.datos[semana]?.feriados_habilitados===undefined
         &&feriados.includes(fecha))datos[fecha]={...(datos[fecha]||{}),feriado:true};
     }
     const ajustes={...(datos[semana]||{}),[indicador]:habilitar};
     if(tipo==="vacaciones"&&!habilitar)ajustes.vacaciones=f.modalidad==="hora"?"0:00":"0";
     datos[semana]=ajustes;
     return {...prev,datos};
   });
 };
 const cambiarEstado=(f:Borrador,estado:Estado)=>{
   cambiar(f.id,prev=>{
     const fecha=estado==="inactivo"?(prev.inactivo_desde||fechaAR(new Date())):null;
     return {...prev,estado,inactivo_desde:fecha,
       datos:{...prev.datos,[semana]:{...(prev.datos[semana]||{}),inactivo_desde:fecha||""}}};
   });
 };
 const cambiarInactivoDesde=(f:Borrador,fecha:string)=>{
   cambiar(f.id,prev=>({...prev,inactivo_desde:fecha||null,
     datos:{...prev.datos,[semana]:{...(prev.datos[semana]||{}),inactivo_desde:fecha}}}));
 };
 const seleccionarSemana=(siguiente:string)=>{
  if(pendientes.length||guardando){
   setError("Hay cambios pendientes de guardado. Revisá el estado antes de cambiar de semana.");
   return;
  }
  setSemana(siguiente);setDiaSeleccionado(0);setMensaje("");
 };
 const guardar=useCallback(async(automatico=false)=>{
  if(!puedeEditar||!editando||guardadoEnCurso.current)return;
  const objetivos=filas.filter(f=>pendientes.includes(f.id));
  if(!objetivos.length){if(!automatico)setEditando(false);return;}
  const validos:Borrador[]=[];
  let primerError="";
  // Cada colaborador se valida de forma independiente, sin detener a otros.
  for(const f of objetivos){
   let fallo="";
   if(f.estado==="inactivo"&&(!f.inactivo_desde||f.inactivo_desde>fechaAR(new Date())))
    fallo="Completá una fecha válida en Inactivo desde para "+(f.nombre||"el colaborador")+".";
   else if(!f.nombre.trim()&&Object.keys(f.datos).length)
    fallo="Ingresá el nombre antes de cargar los horarios.";
   else{
    for(const fecha of dias){
     const r=evaluarDia(f.datos[fecha]||{},enRevision);
     if(r.errores.length){fallo=(f.nombre||"Colaborador "+f.id)+", "+fechaCorta(fecha)+": "+r.errores[0];break;}
    }
    if(!fallo){
     const r=resumenLiquidacion(f.modalidad,f.datos,semana,feriados);
     if(r.errores.length)fallo=(f.nombre||"Colaborador "+f.id)+": "+r.errores[0];
    }
   }
   if(fallo){if(!primerError)primerError=fallo;}
   else validos.push(f);
  }
  if(!validos.length){
   if(primerError)setError(primerError+" · No guardado hasta corregirlo.");
   return;
  }
  guardadoEnCurso.current=true;
  setGuardando(true);setError(primerError?primerError+" · Falta guardar esta fila.":"");
  let huboFallo=false;
  try{
   for(const f of validos){
    const revision=revisiones.current[f.id]||0;
    try{
     const resultado=await rpc<{ok:boolean;version:number;id:number}>("rm_munro_horarios_guardar",{
      p_persona:f.id,p_semana:semana,p_nombre:f.nombre,
      p_estado:f.estado,p_datos:f.datos,p_version:f.version
     });
     if(!resultado?.ok||!Number.isInteger(resultado.version))throw new Error("No se confirmó el guardado.");
     setFilas(actual=>actual.map(fila=>fila.id===f.id?{...fila,version:resultado.version}:fila));
     // Si siguieron escribiendo mientras guardaba, la nueva edición sigue pendiente.
     setPendientes(actual=>revisiones.current[f.id]===revision?actual.filter(id=>id!==f.id):actual);
    }catch(e){
     huboFallo=true;setError(aviso(e)+" · Cambios pendientes. Revisá tu conexión y reintentá.");
     break;
    }
   }
   if(!huboFallo&&!primerError)setMensaje("Guardado automáticamente.");
   else if(!huboFallo)setMensaje("Los otros colaboradores se guardaron automáticamente.");
  }finally{
   guardadoEnCurso.current=false;
   setGuardando(false);
  }
 },[puedeEditar,editando,filas,pendientes,dias,enRevision,semana,feriados]);
 // Debounce de 900 ms sin recargar, borrar el borrador ni sacar el foco.
 useEffect(()=>{
  if(!editando||!puedeEditar||!pendientes.length||guardando)return;
  const firma=semana+"|"+pendientes.map(id=>id+":"+(revisiones.current[id]||0)).join("|")+"|"+reintento;
  if(firma===intentoAutomatico.current)return;
  const timer=window.setTimeout(()=>{
   intentoAutomatico.current=firma;
   void guardar(true);
  },900);
  return()=>window.clearTimeout(timer);
 },[editando,puedeEditar,pendientes,filas,guardando,semana,reintento,guardar]);
 useEffect(()=>{
  const volver=()=>{intentoAutomatico.current="";setReintento(n=>n+1);};
  window.addEventListener("online",volver);
  return()=>window.removeEventListener("online",volver);
 },[]);
 const agregar=async()=>{
   if(!nombreNuevo.trim()||guardando)return;
   if(pendientes.length){setError("Revisá primero los horarios pendientes de guardado.");return;}
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
   ...f,resumen:resumenLiquidacion(f.modalidad,f.datos,semana,feriados,momento)
 }));
 const totalPorHora=filasResumen.filter(f=>f.modalidad==="hora"&&f.resumen.total!==null)
   .reduce((a,f)=>a+(f.resumen.total||0),0);
 const totalTurnos=filasResumen.filter(f=>f.modalidad==="turno"&&f.resumen.total!==null)
   .reduce((a,f)=>a+(f.resumen.total||0),0);
 const faltantes=filas.filter(f=>f.estado!=="inactivo"&&(
   !f.nombre.trim() || dias.some(fecha=>evaluarDia(f.datos[fecha]||{},true).errores.length>0)
 )).map(f=>f.nombre||"Colaborador "+f.id);
 const totalEnRevision=filasResumen.filter(f=>f.resumen.errores.length>0||f.resumen.pendientes>0).length;
 const cabecera=(f:Borrador)=>f.nombre.trim()||("Colaborador "+f.id+" · "+(f.modalidad==="turno"?"por turno":"por hora"));
 const datosDia=(f:Borrador,dia:string)=>f.datos[dia]||{};
 const estadoBotones=(f:Borrador)=><div className="mhs-opciones-colaborador">
   <div className="mhs-estado" role="group" aria-label={"Estado de "+cabecera(f)}>
     {ESTADOS.map(estado=><button key={estado} type="button"
       disabled={!editando||!puedeEditar} aria-pressed={f.estado===estado}
       className={"mhs-estado-"+estado} onClick={()=>cambiarEstado(f,estado)}>
       <span className="mhs-luz-estado" aria-hidden="true"/>
       {estado==="activo"?"Activo":estado==="refuerzo"?"Refuerzo":"Inactivo"}
     </button>)}
   </div>
   {f.estado==="inactivo"&&<label className="mhs-inactivo-desde">
     <span>Inactivo desde</span>
     <input type="date" aria-label={"Inactivo desde · "+cabecera(f)}
       max={fechaAR(new Date())} value={f.inactivo_desde||""}
       disabled={!editando||!puedeEditar}
       onChange={e=>cambiarInactivoDesde(f,e.target.value)}/>
     {!f.inactivo_desde&&<small>Fecha pendiente de completar</small>}
   </label>}
   <div className="mhs-extra-opciones" role="group" aria-label={"Opciones de "+cabecera(f)}>
     <label><input type="checkbox"
       aria-label={"Habilitar feriado · "+cabecera(f)}
       checked={feriadoHabilitado(f.datos,semana,feriados)}
       disabled={!editando||!puedeEditar}
       onChange={e=>cambiarOpcion(f,"feriado",e.target.checked)}/> Feriado</label>
     <label><input type="checkbox"
       aria-label={"Habilitar vacaciones · "+cabecera(f)}
       checked={vacacionesHabilitadas(f.datos,semana)}
       disabled={!editando||!puedeEditar}
       onChange={e=>cambiarOpcion(f,"vacaciones",e.target.checked)}/> Vacaciones</label>
   </div>
 </div>;
 const inputsDia=(f:Borrador,dia:string)=> {
   const d=datosDia(f,dia),verificar=evaluarDia(d,enRevision);
   return <div className={"mhs-cuatro"+(verificar.errores.length?" mhs-error":"")}>
     {CAMPOS.map(([campo,label])=><label key={campo}>
       <span>{label}</span>
       <input aria-label={label+" · "+cabecera(f)+" · "+fechaCorta(dia)} type="time" step={60}
         disabled={!editando||!puedeEditar}
         aria-invalid={verificar.campos.includes(campo)}
         value={d[campo]||""} onChange={e=>cambiarDia(f.id,dia,campo,e.target.value)}/>
     </label>)}
     {feriadoHabilitado(f.datos,semana,feriados)&&
       <label className="mhs-dia-extra"><input type="checkbox"
         aria-label={"Feriado · "+cabecera(f)+" · "+fechaCorta(dia)}
         checked={d.feriado===true||(f.datos[semana]?.feriados_habilitados===undefined&&feriados.includes(dia))}
         disabled={!editando||!puedeEditar}
         onChange={e=>cambiarDia(f.id,dia,"feriado",e.target.checked)}/>Feriado</label>}
     {vacacionesHabilitadas(f.datos,semana)&&
       <label className="mhs-dia-extra"><input type="checkbox"
         aria-label={"Vacaciones · "+cabecera(f)+" · "+fechaCorta(dia)}
         checked={d.vacaciones_dia===true}
         disabled={!editando||!puedeEditar}
         onChange={e=>cambiarDia(f.id,dia,"vacaciones_dia",e.target.checked)}/>Vacaciones</label>}
     {verificar.errores.length>0&&<small className="mhs-revisar">{verificar.errores.join(" ")}</small>}
   </div>;
 };
 return <section className="mhs" aria-label="Planilla semanal de colaboradores de Munro">
   <nav className="mhs-pestanas" aria-label="Vistas de Horarios">
     {([["semana","Semana actual"],["historial","Historial"],["resumen","Resumen semanal"]] as const)
       .map(([id,label])=><button key={id} type="button" aria-current={pestana===id?"page":undefined}
         onClick={()=>setPestana(id)}>{label}</button>)}
   </nav>
   {error&&<p className="mhs-alerta" role="alert">{error}</p>}
   {guardando&&<p role="status" className="mhs-ayuda">Guardando cambios automáticamente…</p>}
   {pendientes.length>0&&!guardando&&editando&&<p role="status" className="mhs-ayuda">Cambios pendientes · se guardan automáticamente al completar la carga.</p>}
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
       {(pestana==="semana"||pestana==="resumen")&&puedeEditar&&<div className="mhs-acciones">
         {!editando?<button type="button" onClick={()=>setEditando(true)}><Pencil size={17}/> Modificar</button>:
           <><button type="button" disabled={guardando} onClick={()=>{if(pendientes.length){setError("Hay cambios pendientes; no se pueden descartar sin revisarlos.");return;}setEditando(false);}}>Finalizar edición</button>
             <button className="mhs-primario" type="button" disabled={guardando||!pendientes.length} onClick={()=>void guardar(false)}><Save size={17}/> Guardar ahora</button></>}
       </div>}
     </div>}
     {enRevision&&(pestana==="semana"||pestana==="resumen")&&<p className="mhs-alerta" role="status">
       Revisión semanal desde el domingo a las 23:40 (hora argentina).
       {faltantes.length>0?" Pendientes: "+faltantes.join(", ")+".":" Todos los turnos están revisados."}
     </p>}
     {pestana==="semana"&&<>
       <p className="mhs-ayuda">Tres colaboradores por turno y cinco por hora. Cargá los nombres y horarios cuando quieras.
         Cada entrada o cambio se guarda automáticamente, aunque todavía falte completar una salida durante la semana. Los feriados y vacaciones se marcan por colaborador.</p>
       <div className="mhs-movil-dias" role="group" aria-label="Día a mostrar">
         {dias.map((dia,i)=><button key={dia} type="button" aria-pressed={diaSeleccionado===i}
            onClick={()=>setDiaSeleccionado(i)}><b>{DIAS[i]}</b><span>{fechaCorta(dia)}</span></button>)}
       </div>
       <div className="mhs-tabla-wrap">
         <table className="mhs-tabla">
           <thead><tr><th scope="col">Colaborador</th>{dias.map((dia,i)=><th key={dia} scope="col">{DIAS[i]}<small>{fechaCorta(dia)}</small></th>)}<th scope="col">Total semanal</th></tr></thead>
           <tbody>{filas.map(f=>{
             const r=resumenPersona(f.modalidad,f.datos,semana,momento,feriados);
             return <tr key={f.id} className={f.estado==="inactivo"?"mhs-inactivo":""}>
               <th scope="row"><div className="mhs-colaborador">
                 <span className="mhs-modalidad">{f.modalidad==="turno"?"Por turno":"Por hora"}</span>
                 {editando&&puedeEditar?<input type="text" maxLength={80} placeholder={"Nombre · "+cabecera(f)}
                   value={f.nombre} onChange={e=>cambiar(f.id,prev=>({...prev,nombre:e.target.value}))}
                   aria-label={"Nombre del colaborador "+f.id}/>:<strong>{cabecera(f)}</strong>}
                 {estadoBotones(f)}
               </div></th>
               {dias.map(dia=><td key={dia}>{inputsDia(f,dia)}</td>)}
               <td className="mhs-total">
                 <b>{r.errores? "Revisar":f.modalidad==="hora"?formatoHoras(r.horas+r.horasFeriado)+" h":formatoTurnos(r.turnos)}</b>
                 {r.pendientes>0&&<small>{r.pendientes} pendientes</small>}
               </td>
             </tr>;
           })}</tbody>
         </table>
       </div>
       <div className="mhs-movil-lista">{filas.map(f=>{
         const dia=dias[diaSeleccionado],r=resumenPersona(f.modalidad,f.datos,semana,momento,feriados);
         return <article className="mhs-card" key={f.id}>
           <header><div><span className="mhs-modalidad">{f.modalidad==="hora"?"Por hora":"Por turno"}</span>
             {editando&&puedeEditar?<input value={f.nombre} placeholder={"Nombre · Colaborador "+f.id}
               onChange={e=>cambiar(f.id,prev=>({...prev,nombre:e.target.value}))}/>:
               <h3>{cabecera(f)}</h3>}</div>
             <strong>{r.errores?"Revisar":f.modalidad==="hora"?formatoHoras(r.horas+r.horasFeriado)+" h":formatoTurnos(r.turnos)}</strong>
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
       <section className="mhs-feriados-semana" aria-label="Feriados y vacaciones por colaborador">
         <div className="mhs-feriados-cabeza">
           <strong>Feriados y vacaciones por colaborador</strong>
           <small>Activá la opción debajo de su estado en Semana actual y marcá los días correspondientes. El resumen se completa automáticamente.</small>
         </div>
       </section>
       <div className="mhs-resumen-totales">
         <div><small>Colaboradores con nombre</small><strong>{filasResumen.length}</strong></div>
         <div><small>Total de horas a liquidar</small><strong>{formatoHoras(totalPorHora)} h</strong></div>
         <div><small>Total de turnos a liquidar</small><strong>{totalTurnos}</strong></div>
         <div><small>Registros por revisar</small><strong>{totalEnRevision}</strong></div>
       </div>
       <div className="mhs-resumen-desbordar">
         <table className="mhs-liquidacion">
           <thead><tr>
             <th scope="col">Colaborador</th><th scope="col">Cobra por</th>
             <th scope="col">Trabajado</th><th scope="col">OFF</th>
             <th scope="col">Vacaciones</th><th scope="col">Feriado</th>
             <th scope="col">Total a liquidar</th><th scope="col">Observaciones</th>
           </tr></thead>
           <tbody>{filasResumen.map(f=>{
             const r=f.resumen, porHora=f.modalidad==="hora";
             const convertir=(n:number)=>porHora?formatoHoras(n):String(n);
             return <tr key={f.id}>
               <th scope="row">{f.nombre}</th>
               <td>{porHora?"Hora":"Turno"}</td>
               <td>{convertir(r.trabajados)}</td>
               <td><input aria-label={"OFF de "+f.nombre} value={f.datos[semana]?.off??(porHora?"4:30":"1")}
                 disabled={!editando||!puedeEditar} inputMode="text"
                 onChange={e=>cambiarDia(f.id,semana,"off",e.target.value)}/></td>
               <td>{vacacionesHabilitadas(f.datos,semana)
                 ?<input aria-label={"Vacaciones de "+f.nombre} value={f.datos[semana]?.vacaciones??(porHora?"0:00":"0")}
                   disabled={!editando||!puedeEditar} inputMode="text"
                   onChange={e=>cambiarDia(f.id,semana,"vacaciones",e.target.value)}/>
                 :<span className="mhs-sin-extra" title="Vacaciones no activadas">—</span>}</td>
               <td>{convertir(r.extraFeriado)}</td>
               <td className="mhs-total-liquidacion">
                 {r.errores.length>0
                   ?<span className="mhs-liquidacion-error">Revisar</span>
                   :r.pendientes>0?"Pendiente":r.total===null?"Revisar":<strong>{convertir(r.total)}</strong>}
               </td>
               <td>
                 <small className="mhs-nota-auto">{r.observaciones||"—"}</small>
                 {editando&&puedeEditar&&<input aria-label={"Observación manual de "+f.nombre}
                   placeholder="Aclaración opcional" maxLength={200}
                   value={f.datos[semana]?.observaciones||""}
                   onChange={e=>cambiarDia(f.id,semana,"observaciones",e.target.value)}/>}
               </td>
             </tr>;
           })}</tbody>
         </table>
       </div>
       {filasResumen.length===0&&<p>Primero completá los nombres en Semana actual. El resumen se calculará automáticamente.</p>}
       <p>Criterio de liquidación: Trabajado + OFF + Vacaciones + adicional de Feriado.
         OFF inicial: 1 turno o 4:30 horas (modificable). Vacaciones y feriados son opcionales.
         El feriado suma exclusivamente lo trabajado en los días seleccionados. Las horas se muestran como horas:minutos, no como dinero.</p>
       <section className="mhs-historial-resumen">
         <h3>Historial de resúmenes</h3>
         {registros.length===0?<p>Todavía no hay semanas anteriores en esta planilla.</p>:
           registros.slice(0,8).map(grupo=>{
             const fecha=grupo[0].semana,festivos=planilla.feriados_historial?.[fecha]||[];
             const a=grupo.filter(r=>r.modalidad==="hora").reduce((n,r)=>n+(resumenLiquidacion(r.modalidad,r.datos,fecha,festivos,momento).total||0),0);
             const t=grupo.filter(r=>r.modalidad==="turno").reduce((n,r)=>n+(resumenLiquidacion(r.modalidad,r.datos,fecha,festivos,momento).total||0),0);
             return <div className="mhs-archivo-resumen" key={fecha}>
               <div><strong>Semana {semanaLabel(fecha)}</strong>
                 <small>{grupo.length} colaboradores · {formatoHoras(a)} horas · {t} turnos</small></div>
               <button type="button" onClick={()=>seleccionarSemana(fecha)}>Ver detalle</button>
             </div>;
           })}
       </section>
     </div>}
     {pestana==="historial"&&<div className="mhs-historial">
       <h2>Historial de la nueva planilla</h2>
       {registros.length===0?<p>Todavía no hay semanas anteriores guardadas en esta planilla.</p>:
       registros.map(grupo=>{
         const inicio=grupo[0].semana,festivos=planilla.feriados_historial?.[inicio]||[];
         const completo=grupo.every(r=>{
           const x=resumenLiquidacion(r.modalidad,r.datos,inicio,festivos,momento);
           return x.total!==null&&x.pendientes===0;
         });
         return <details key={inicio}>
           <summary>Semana {semanaLabel(inicio)} · {grupo.length} colaboradores · {completo?"Cerrada":"Revisar antes de liquidar"}</summary>
           <div className="mhs-resumen-desbordar"><table>
             <thead><tr><th>Colaborador</th><th>Cobra por</th><th>Trabajado</th><th>OFF</th>
               <th>Vacaciones</th><th>Feriado extra</th><th>Total a liquidar</th><th>Observaciones</th></tr></thead>
             <tbody>{grupo.map(r=>{
               const c=resumenLiquidacion(r.modalidad,r.datos,inicio,festivos,momento);
               const fmt=(n:number)=>r.modalidad==="turno"?String(n):formatoHoras(n);
               return <tr key={r.id}><td>{r.nombre}</td><td>{r.modalidad==="turno"?"Turno":"Hora"}</td>
                 <td>{fmt(c.trabajados)}</td><td>{fmt(c.off)}</td><td>{fmt(c.vacaciones)}</td>
                 <td>{fmt(c.extraFeriado)}</td><td>{c.total===null||c.pendientes?"Revisar":fmt(c.total)}</td>
                 <td>{c.observaciones||"—"}</td>
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

"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Save, CheckCircle2 } from "lucide-react";
import { rpc } from "@/features/access/api";
import { ScheduleHistory } from "./ScheduleHistory";
import {
 diasSemana,evaluarDia,fechaAR,fechaCorta,fechasFeriadoColaborador,feriadoHabilitado,vacacionesHabilitadas,formatoHoras,revisarSemana,resumenPersona,resumenLiquidacion,semanaActual,
 sumarDias,type Estado,type Modalidad,type Persona,type Planilla,type Registro,type SemanaHorarios,
} from "@/features/schedules/munro-model";
import "./munro-weekly.css";
import "./munro-weekly-polish.css";
import "./munro-weekly-matrix.css";

type Borrador = Persona & {datos:SemanaHorarios;version:number};
type Pestaña = "semana"|"resumen";
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
 const [cerrandoSemana,setCerrandoSemana]=useState(false);
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

 const semanaCerrada=planilla?.semana_cerrada===true;
 const puedeEditar=planilla?.puede_editar===true&&!semanaCerrada;
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
 const cambiarDescanso=(f:Borrador,dia:string,valor:"off"|"medio_off")=>{
   const actual=f.datos[dia]||{};
   const nuevo=actual.descanso===valor?"":valor;
   const hayMañana=Boolean(actual.tm_e||actual.tm_s);
   const hayTarde=Boolean(actual.tt_e||actual.tt_s);
   // Nunca borrar horas existentes de manera implícita.
   if(nuevo==="off"&&(hayMañana||hayTarde)){
     setError("Borrá las entradas y salidas antes de marcar OFF completo.");
     return;
   }
   if(nuevo==="medio_off"&&hayMañana&&hayTarde){
     setError("Medio OFF permite una sola franja: quitá primero el turno que no se trabajó.");
     return;
   }
   if(nuevo&&actual.vacaciones_dia){
     setError("No podés combinar OFF o Medio OFF con Vacaciones en el mismo día.");
     return;
   }
   cambiarDia(f.id,dia,"descanso",nuevo);
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
  if(pendientes.length||guardando||cerrandoSemana){
   setError("Hay cambios pendientes o un cierre en curso. Revisá el estado antes de cambiar de semana.");
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
 const finalizarSemana=async()=>{
   if(!puedeEditar||semanaCerrada||cerrandoSemana||guardadoEnCurso.current||guardando)return;
   if(pendientes.length){
     setError("Primero esperá a que se guarden todos los cambios; después finalizá la semana.");
     return;
   }
   if(semana>semanaActual()){
     setError("No se puede finalizar una semana futura.");
     return;
   }
   const hasSaved=planilla?.planillas.some(r=>r.nombre.trim());
   if(!hasSaved){
     setError("No hay horarios guardados esta semana. Completá una planilla antes del cierre.");
     return;
   }
   if(!window.confirm("¿Finalizar la semana del "+semanaLabel(semana)+"? Se guardará una copia definitiva en Historial, ya no se podrá modificar y se abrirá la siguiente semana vacía, conservando los colaboradores activos. Esta acción no se puede deshacer."))return;
   setCerrandoSemana(true);setError("");setMensaje("");
   try{
     const resultado=await rpc<{ok:boolean;siguiente_semana:string;archivado:boolean}>("rm_munro_horarios_finalizar_semana",{p_semana:semana});
     if(!resultado?.ok||!resultado.archivado||resultado.siguiente_semana!==sumarDias(semana,7))
       throw new Error("El servidor no confirmó el cierre de la semana.");
     // Al cambiar la fecha se recarga la planilla vacía desde el servidor.
     // Nunca copiar datos ni horarios de la semana finalizada.
     revisiones.current={};intentoAutomatico.current="";
     setPlanilla(null);setFilas([]);setPendientes([]);setEditando(false);
     setDiaSeleccionado(0);setPestana("semana");setCargando(true);
     setSemana(resultado.siguiente_semana);
     setMensaje("Semana finalizada y enviada a Historial. Se abrió la siguiente semana con los colaboradores activos y sin horarios.");
   }catch(e){setError(aviso(e));}
   finally{setCerrandoSemana(false);}
 };
 const registros=useMemo(()=>Object.values(
   (planilla?.historial||[]).reduce<Record<string,Registro[]>>((m,r)=>{
     (m[r.semana]??=[]).push(r);return m;
   },{})
 ).sort((a,b)=>b[0].semana.localeCompare(a[0].semana)),[planilla?.historial]);
 const filasResumen=filas.filter(f=>f.nombre.trim()).map(f=>({
   ...f,resumen:resumenLiquidacion(f.modalidad,f.datos,semana,feriados,momento)
 }));
 const faltantes=filas.filter(f=>f.estado!=="inactivo"&&(
   !f.nombre.trim() || dias.some(fecha=>evaluarDia(f.datos[fecha]||{},true).errores.length>0)
 )).map(f=>f.nombre||"Colaborador "+f.id);
 // Resumen individual: la misma tabla diaria y la misma liquidación para la
 // semana abierta (editable, con guardado automático) y para el Historial.
 const cantidad=(modalidad:Modalidad,n:number)=>modalidad==="hora"?formatoHoras(n)+" h":formatoTurnos(n);
 const tablaDias=(modalidad:Modalidad,datos:SemanaHorarios,inicio:string,festivos:string[],exigir:boolean)=>{
   const conFeriado=fechasFeriadoColaborador(datos,inicio,festivos);
   const franja=(entrada?:string,salida?:string)=>entrada||salida?(entrada||"—")+" a "+(salida||"—"):"—";
   return <div className="mhs-resumen-desbordar"><table className="mhs-dias">
     <thead><tr><th scope="col">Día</th><th scope="col">Mañana</th>
       <th scope="col">Noche</th><th scope="col">Trabajado</th><th scope="col">Estado</th></tr></thead>
     <tbody>{diasSemana(inicio).map((dia,i)=>{
       const d=datos[dia]||{};
       const jornada=evaluarDia(d,exigir);
       const marcas=[
         d.descanso==="off"?"OFF":d.descanso==="medio_off"?"Medio OFF":"",
         d.vacaciones_dia?"Vacaciones":"",
         conFeriado.includes(dia)?"Feriado":"",
       ].filter(Boolean).join(" · ");
       const trabajado=modalidad==="turno"?jornada.turnos+" t.":formatoHoras(jornada.horas)+" h";
       return <tr key={dia}>
         <th scope="row">{DIAS[i]} {fechaCorta(dia)}</th>
         <td>{franja(d.tm_e,d.tm_s)}</td><td>{franja(d.tt_e,d.tt_s)}</td>
         <td>{jornada.errores.length?"—":trabajado}</td>
         <td>{jornada.errores.length?jornada.errores.join(" "):marcas||"—"}</td>
       </tr>;
     })}</tbody>
   </table></div>;
 };
 const liquidacion=(modalidad:Modalidad,r:ReturnType<typeof resumenLiquidacion>,
   off:ReactNode,vacaciones:ReactNode,nota:ReactNode)=>{
   const porHora=modalidad==="hora";
   return <section className="mhs-liquidacion" aria-label="Resumen de liquidación">
     <h4 className="mhs-liq-titulo">Resumen de liquidación</h4>
     <dl>
     <div><dt>{porHora?"Horas trabajadas":"Turnos trabajados"}</dt><dd>{cantidad(modalidad,r.trabajados)}</dd></div>
     <div><dt>OFF pagos</dt><dd>{off}</dd></div>
     {vacaciones!==null&&<div><dt>Vacaciones</dt><dd>{vacaciones}</dd></div>}
     <div><dt>Feriados correspondientes</dt><dd>{cantidad(modalidad,r.extraFeriado)}
       {r.feriadosTrabajados.length>0&&<small> · {r.feriadosTrabajados.map(fechaCorta).join(", ")}</small>}</dd></div>
     <div className="mhs-liq-total"><dt>Total final a liquidar</dt>
       <dd className="mhs-total-liquidacion">{r.errores.length>0
         ?<span className="mhs-liquidacion-error">Revisar</span>
         :r.pendientes>0?"Pendiente":r.total===null?"Revisar":<strong>{cantidad(modalidad,r.total)}</strong>}</dd></div>
     {(r.observaciones||nota)&&<div className="mhs-liq-nota"><dt>Observaciones</dt>
       <dd><small className="mhs-nota-auto">{r.observaciones||"—"}</small>{nota}</dd></div>}
     </dl>
   </section>;
 };
 const cabecera=(f:Borrador)=>f.nombre.trim()||("Colaborador "+f.id+" · "+(f.modalidad==="turno"?"por turno":"por hora"));
 const datosDia=(f:Borrador,dia:string)=>f.datos[dia]||{};
 const estadoBotones=(f:Borrador)=><div className="mhs-opciones-colaborador">
   <div className={"mhs-estado mhs-estado-"+f.estado}>
     <span className="mhs-luz-estado" aria-hidden="true"/>
     {editando&&puedeEditar
       ?<select aria-label={"Estado de "+cabecera(f)} value={f.estado}
         onChange={e=>cambiarEstado(f,e.target.value as Estado)}>
         {ESTADOS.map(estado=><option key={estado} value={estado}>
           {estado==="activo"?"Activo":estado==="refuerzo"?"Refuerzo":"Inactivo"}
         </option>)}
       </select>
       :<span className="mhs-estado-seleccionado">
         {f.estado==="activo"?"Activo":f.estado==="refuerzo"?"Refuerzo":"Inactivo"}
       </span>}
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
 const resumenCorto=(f:Borrador,r:ReturnType<typeof resumenPersona>)=>
   r.errores?"Total semanal: revisar":f.modalidad==="hora"
     ?"Total semanal: "+formatoHoras(r.horas+r.horasFeriado)+" h"
     :"Total semanal: "+formatoTurnos(r.turnos);
 const inputsDia=(f:Borrador,dia:string)=> {
   const d=datosDia(f,dia),verificar=evaluarDia(d,enRevision);
   const conMañana=Boolean(d.tm_e||d.tm_s),conTarde=Boolean(d.tt_e||d.tt_s);
   const conHorario=conMañana||conTarde;
   return <div className={"mhs-cuatro"+(verificar.errores.length?" mhs-error":"")}>
     {(editando&&puedeEditar||Boolean(d.descanso))&&
       <div className="mhs-descansos" role="group" aria-label={"Descanso · "+cabecera(f)+" · "+fechaCorta(dia)}>
         {(["off","medio_off"] as const).map(valor=>
           (editando&&puedeEditar||d.descanso===valor)&&<button key={valor} type="button"
             className={"mhs-descanso-boton"+(d.descanso===valor?" mhs-descanso-elegido":"")}
             aria-pressed={d.descanso===valor} disabled={!editando||!puedeEditar}
             onClick={()=>cambiarDescanso(f,dia,valor)}>
             {valor==="off"?"OFF":"Medio OFF"}
           </button>)}
       </div>}
     {CAMPOS.map(([campo,label])=><label key={campo}>
       <span>{label}</span>
       <input aria-label={label+" · "+cabecera(f)+" · "+fechaCorta(dia)} type="time" step={60}
         disabled={!editando||!puedeEditar||d.descanso==="off"||
           (d.descanso==="medio_off"&&
             (campo.startsWith("tm_")?conTarde:conMañana))}
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
     {f.modalidad==="hora"&&
       <div className="mhs-horas-dia" aria-label={"Horas del día · "+cabecera(f)+" · "+fechaCorta(dia)}>
         {verificar.errores.length?"Horas del día: revisar":verificar.horas>0
           ?"Horas del día: "+formatoHoras(verificar.horas)+" h"
           :d.descanso==="off"?"Horas del día: 0 h · OFF"
           :conHorario?"Horas del día: pendiente":"Horas del día: —"}
       </div>}
     {verificar.errores.length>0&&<small className="mhs-revisar">{verificar.errores.join(" ")}</small>}
   </div>;
 };
 return <section className="mhs" aria-label="Planilla semanal de colaboradores de Munro">
   <nav className="mhs-pestanas" aria-label="Vistas de Horarios">
     {([["semana","Semana actual"],["resumen","Resumen semanal"]] as const)
       .map(([id,label])=><button key={id} type="button" aria-current={pestana===id?"page":undefined}
         onClick={()=>setPestana(id)}>{label}</button>)}
   </nav>
   {error&&<p className="mhs-alerta" role="alert">{error}</p>}
   {guardando&&<p role="status" className="mhs-ayuda">Guardando cambios automáticamente…</p>}
   {cerrandoSemana&&<p role="status" className="mhs-ayuda">Archivando la semana y preparando la planilla siguiente…</p>}
   {pendientes.length>0&&!guardando&&editando&&<p role="status" className="mhs-ayuda">Cambios pendientes · se guardan automáticamente al completar la carga.</p>}
   {mensaje&&!pendientes.length&&<p className="mhs-exito" role="status">{mensaje}</p>}
   {cargando&&<p role="status">Cargando Horarios de Munro…</p>}
   {!cargando&&planilla&&<>
     <div className="mhs-toolbar">
       <div className="mhs-semana">
         <button type="button" aria-label="Semana anterior" onClick={()=>seleccionarSemana(sumarDias(semana,-7))}><ChevronLeft size={18}/></button>
         <span><CalendarDays size={18}/> Semana del {semanaLabel(semana)}</span>
         <button type="button" aria-label="Semana siguiente" disabled={semana>=limiteFuturo()}
           onClick={()=>seleccionarSemana(sumarDias(semana,7))}><ChevronRight size={18}/></button>
       </div>
       {planilla.puede_editar&&<div className="mhs-acciones">
         {pestana==="semana"&&!semanaCerrada&&<button type="button" className="mhs-cierre-semanal" disabled={guardando||cerrandoSemana||pendientes.length>0||semana>semanaActual()}
           onClick={()=>void finalizarSemana()}><CheckCircle2 size={18}/> Semana finalizada</button>}
         {semanaCerrada?<span className="mhs-cerrada-chip"><CheckCircle2 size={17}/> Semana finalizada · solo lectura</span>:
         !editando?<button type="button" onClick={()=>setEditando(true)}><Pencil size={17}/> Modificar</button>:
           <><button type="button" disabled={guardando} onClick={()=>{if(pendientes.length){setError("Hay cambios pendientes; no se pueden descartar sin revisarlos.");return;}setEditando(false);}}>Finalizar edición</button>
             <button className="mhs-primario" type="button" disabled={guardando||!pendientes.length} onClick={()=>void guardar(false)}><Save size={17}/> Guardar ahora</button></>
         }
       </div>}
     </div>
     {enRevision&&<p className="mhs-alerta" role="status">
       Revisión semanal desde el domingo a las 23:40 (hora argentina).
       {faltantes.length>0?" Pendientes: "+faltantes.join(", ")+".":" Todos los turnos están revisados."}
     </p>}
     {pestana==="semana"&&<>
       {semanaCerrada&&<p className="mhs-exito" role="status">Esta semana ya está archivada en Historial. No se puede editar.</p>}
       <details className="mhs-ayuda-detalle"><summary>Cómo cargar los horarios</summary><p className="mhs-ayuda">Tres colaboradores por turno y cinco por hora. Cargá los nombres y horarios cuando quieras.
         Cada entrada o cambio se guarda automáticamente. OFF indica franco completo sin horarios;
         Medio OFF permite trabajar solo una franja. Los totales muestran únicamente horas y turnos realmente cargados.
         El ajuste de OFF remunerado se mantiene separado en Resumen semanal.</p></details>
       <div className="mhs-movil-dias" role="group" aria-label="Día a mostrar">
         {dias.map((dia,i)=><button key={dia} type="button" aria-pressed={diaSeleccionado===i}
            onClick={()=>setDiaSeleccionado(i)}><b>{DIAS[i]}</b><span>{fechaCorta(dia)}</span></button>)}
       </div>
       <div className="mhs-tabla-navegacion" aria-label="Semana completa visible">
         <strong>Semana completa · lunes a domingo</strong>
         <span>Cuatro filas por colaborador · siete días visibles.</span>
       </div>
       <div className="mhs-tabla-wrap" role="region" aria-label="Horarios de lunes a domingo, semana completa visible; desplazamiento vertical">
         <table className="mhs-tabla">
           <colgroup>
             <col style={{width:"30%"}}/>
             {dias.map(dia=><col key={dia} style={{width:"10%"}}/>)}
           </colgroup>
           <thead><tr><th scope="col">Colaborador</th>{dias.map((dia,i)=><th key={dia} scope="col">{DIAS[i]}<small>{fechaCorta(dia)}</small></th>)}</tr></thead>
           <tbody>{filas.map(f=>{
             const r=resumenPersona(f.modalidad,f.datos,semana,momento,feriados);
             return <tr key={f.id} className={f.estado==="inactivo"?"mhs-inactivo":""}>
               <th scope="row"><div className="mhs-matriz-colaborador"><div className="mhs-colaborador">
                 <span className="mhs-modalidad">{f.modalidad==="turno"?"Por turno":"Por hora"}</span>
                 {editando&&puedeEditar?<input type="text" maxLength={80} placeholder={"Nombre · "+cabecera(f)}
                   value={f.nombre} onChange={e=>cambiar(f.id,prev=>({...prev,nombre:e.target.value}))}
                   aria-label={"Nombre del colaborador "+f.id}/>:<strong>{cabecera(f)}</strong>}
                 <span className="mhs-total-nombre">{resumenCorto(f,r)}</span>
                 {r.pendientes>0&&<small className="mhs-pendientes">{r.pendientes} horarios pendientes</small>}
                 {estadoBotones(f)}
               </div>
                 <div className="mhs-matriz-etiquetas" aria-hidden="true">
                   {CAMPOS.map(([campo,label])=><span key={campo}>{label}</span>)}
                 </div>
               </div></th>
               {dias.map(dia=><td key={dia}>{inputsDia(f,dia)}</td>)}
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
             <span className="mhs-total-nombre">{resumenCorto(f,r)}</span>
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
       <section className="mhs-feriados-semana" aria-label="Resumen individual por colaborador">
         <div className="mhs-feriados-cabeza">
           <strong>Resumen individual por colaborador</strong>
           <small>Cada tabla se arma sola con los horarios cargados en Semana actual. Feriados y vacaciones se activan debajo del estado de cada colaborador.</small>
         </div>
       </section>
       {filasResumen.map(f=>{
         const r=f.resumen, porHora=f.modalidad==="hora";
         return <details className="mhs-colab" key={f.id} open>
           <summary><span className="mhs-colab-nombre">{f.nombre}</span>
             <span className="mhs-modalidad">{porHora?"Por hora":"Por turno"}</span></summary>
           {tablaDias(f.modalidad,f.datos,semana,feriados,enRevision)}
           {liquidacion(f.modalidad,r,
             <input aria-label={"OFF de "+f.nombre} value={f.datos[semana]?.off??(porHora?"4:30":"1")}
               disabled={!editando||!puedeEditar} inputMode="text"
               onChange={e=>cambiarDia(f.id,semana,"off",e.target.value)}/>,
             vacacionesHabilitadas(f.datos,semana)
               ?<input aria-label={"Vacaciones de "+f.nombre} value={f.datos[semana]?.vacaciones??(porHora?"0:00":"0")}
                 disabled={!editando||!puedeEditar} inputMode="text"
                 onChange={e=>cambiarDia(f.id,semana,"vacaciones",e.target.value)}/>:null,
             editando&&puedeEditar?<input aria-label={"Observación manual de "+f.nombre}
               placeholder="Aclaración opcional" maxLength={200}
               value={f.datos[semana]?.observaciones||""}
               onChange={e=>cambiarDia(f.id,semana,"observaciones",e.target.value)}/>:null)}
         </details>;
       })}
       {filasResumen.length===0&&<p>Primero completá los nombres en Semana actual. El resumen se calculará automáticamente.</p>}
       <p>Criterio de liquidación: Trabajado + OFF pagos + Vacaciones + adicional de Feriado.
         OFF inicial: 1 turno o 4:30 horas (modificable). Vacaciones y feriados son opcionales.
         El feriado suma exclusivamente lo trabajado en los días seleccionados.</p>
       <section className="mhs-historial" aria-labelledby="mhs-historial-titulo">
       <h2 id="mhs-historial-titulo">Historial</h2>
       <p>Elegí una semana para ver el resumen y consultar las entradas y salidas de cada día.</p>
       {registros.length===0?<p>Todavía no hay semanas anteriores guardadas en esta planilla.</p>:
       registros.map(grupo=>{
         const inicio=grupo[0].semana,festivos=planilla.feriados_historial?.[inicio]||[];
         const cerrado=planilla.cierres?.includes(inicio)===true;
         const completo=grupo.every(r=>{
           const x=resumenLiquidacion(r.modalidad,r.datos,inicio,festivos,momento);
           return x.total!==null&&x.pendientes===0;
         });
         return <details key={inicio}>
           <summary>Semana {semanaLabel(inicio)} · {inicio.slice(0,4)} · {grupo.length} colaboradores · {cerrado?"Finalizada":completo?"Anterior · completa":"Revisar antes de liquidar"}</summary>
           <div className="mhs-archivo-contenido">
           <h3>Resumen de la semana · por colaborador</h3>
           {grupo.map(r=>{
             const c=resumenLiquidacion(r.modalidad,r.datos,inicio,festivos,momento);
             return <details className="mhs-colab mhs-archivo-persona" key={r.id}>
               <summary><span className="mhs-colab-nombre">{r.nombre}</span>
                 <span className="mhs-modalidad">{r.modalidad==="hora"?"Por hora":"Por turno"}</span></summary>
               {tablaDias(r.modalidad,r.datos,inicio,festivos,true)}
               {liquidacion(r.modalidad,c,cantidad(r.modalidad,c.off),
                 vacacionesHabilitadas(r.datos,inicio)?cantidad(r.modalidad,c.vacaciones):null,null)}
             </details>;
           })}
           </div>
         </details>;
       })}
       <details className="mhs-archivo-anterior">
         <summary>Historial anterior conservado</summary>
         <div className="mhs-archivo-contenido">
           <ScheduleHistory embebido soloArchivo />
         </div>
       </details>
       </section>
     </div>}
   </>}
 </section>;
}

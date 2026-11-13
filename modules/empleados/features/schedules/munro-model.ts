// Mi Gusto Munro · cálculos de Horarios (sin montos, independientes de Recibos).
// Las horas y los turnos se cuentan por separado para evitar liquidaciones ambiguas.
export type Modalidad = "hora" | "turno";
export type Estado = "activo" | "refuerzo" | "inactivo";
export type CampoHora = "tm_e" | "tm_s" | "tt_e" | "tt_s";
export type DiaHorarios = Partial<Record<CampoHora,string>> & { feriado?:boolean; vacaciones_dia?:boolean; off?:string; vacaciones?:string; observaciones?:string };
export type SemanaHorarios = Record<string,DiaHorarios>;
export type Persona = {id:number; nombre:string; modalidad:Modalidad; estado:Estado};
export type Registro = {id:number; semana:string; datos:SemanaHorarios; nombre:string; modalidad:Modalidad; version:number};
export type Planilla = {semana:string; personas:Persona[]; planillas:Registro[]; historial:Registro[]; puede_editar:boolean; feriados?:string[]; feriados_version?:number; feriados_historial?:Record<string,string[]>};
const FORMATO=/^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const minutos=(hora?:string)=>hora&&FORMATO.test(hora)?Number(hora.slice(0,2))*60+Number(hora.slice(3)):null;
export function fechaAR(now=new Date()):string {
 const v=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
 const p=Object.fromEntries(v.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
 return p.year+"-"+p.month+"-"+p.day;
}
export function sumarDias(iso:string,n:number):string {
 const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);
}
export function lunesDe(iso:string):string {
 const d=new Date(iso+"T12:00:00Z").getUTCDay();
 return sumarDias(iso,-((d+6)%7));
}
export function semanaActual(now=new Date()):string{return lunesDe(fechaAR(now));}
export function diasSemana(semana:string):string[]{return Array.from({length:7},(_,i)=>sumarDias(semana,i));}
export function revisarSemana(semana:string,now=new Date()):boolean{
 const actual=semanaActual(now);
 if(semana<actual)return true;
 if(semana!==actual)return false;
 if(new Date(fechaAR(now)+"T12:00:00Z").getUTCDay()!==0)return false;
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
   timeZone:"America/Argentina/Buenos_Aires",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
 }).formatToParts(now).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
 return Number(p.hour)*60+Number(p.minute)>=1420;
}
export function evaluarDia(dia:DiaHorarios={},exigirCompleto=false){
 const errores:string[]=[];
 const campoError:CampoHora[]=[];
 let horas=0,turnos=0;
 const bloques:[CampoHora,CampoHora,string,boolean][]=[
   ["tm_e","tm_s","mañana",false],["tt_e","tt_s","tarde",true]
 ];
 const completos:{inicio:number;fin:number}[]=[];
 for(const [ie,is,nombre,cruza] of bloques){
   const e=dia[ie]||"",s=dia[is]||"";
   if(!e&&!s)continue;
   if((e&&!FORMATO.test(e))||(s&&!FORMATO.test(s))){
     errores.push("Hora incorrecta en el turno "+nombre+".");campoError.push(ie,is);continue;
   }
   if(!e||!s){
     if(exigirCompleto){errores.push("Completá el turno "+nombre+".");campoError.push(ie,is);}
     continue;
   }
   const inicio=minutos(e)!;let fin=minutos(s)!;
   if(cruza&&fin<=inicio)fin+=1440;
   if(fin<=inicio||fin-inicio>960){
     errores.push("Revisá la entrada y la salida del turno "+nombre+".");campoError.push(ie,is);continue;
   }
   completos.push({inicio,fin});horas+=fin-inicio;turnos+=1;
 }
 if(completos.length===2&&(completos[1].inicio<completos[0].fin||completos[1].fin>completos[0].inicio+1440)){
   errores.push("Los turnos están superpuestos o fuera de orden.");
   campoError.push("tm_s","tt_e");
 }
 if(dia.vacaciones_dia===true&&(["tm_e","tm_s","tt_e","tt_s"] as CampoHora[]).some(k=>Boolean(dia[k]))){
   errores.push("Un día de vacaciones no puede tener turnos trabajados.");
   campoError.push("tm_e","tm_s","tt_e","tt_s");
 }
 const feriado=dia.feriado===true;
 return {errores,campos:[...new Set(campoError)],horas:errores.length?0:horas,
   turnos:errores.length?0:turnos,feriado};
}
export function resumenPersona(modalidad:Modalidad,datos:SemanaHorarios,semana:string,now=new Date(),feriados:string[]=[]){
 const completos=revisarSemana(semana,now);
 let horas=0,horasFeriado=0,turnos=0,extraFeriado=0,errores=0,pendientes=0,dias=0;
 for(const fecha of diasSemana(semana)){
   const d=datos?.[fecha]||{};
   const r=evaluarDia(d,completos);
   if(r.errores.length)errores+=r.errores.length;
   if(!completos&&(["tm_e","tm_s","tt_e","tt_s"] as CampoHora[]).some(k=>Boolean(d[k]))&&
      ((Boolean(d.tm_e)!==Boolean(d.tm_s))||(Boolean(d.tt_e)!==Boolean(d.tt_s))))pendientes++;
   const esFeriado=feriados.includes(fecha)||r.feriado;
   if(r.horas>0){dias++; if(esFeriado)horasFeriado+=r.horas;else horas+=r.horas;}
   if(r.turnos>0){turnos+=r.turnos;if(esFeriado)extraFeriado+=r.turnos;}
 }
 return {modalidad,horas,horasFeriado,turnos,extraFeriado,
   computados:modalidad==="turno"?turnos+extraFeriado:horas+horasFeriado*2,
   errores,pendientes,dias,completo:errores===0&&pendientes===0};
}
export function formatoHoras(m:number):string{return Math.floor(m/60)+":"+String(m%60).padStart(2,"0");}
export function fechaCorta(iso:string):string{return iso.slice(8,10)+"/"+iso.slice(5,7);}

/** Liquidación en cantidades (turnos o minutos), nunca pesos.
 * Trabajado incluye días feriados. El adicional solo contempla lo efectivamente trabajado.
 * OFF/vacaciones son ajustes semanales manuales auditados por versión.
 */
export function resumenLiquidacion(
 modalidad:Modalidad, datos:SemanaHorarios, semana:string, feriados:string[]=[], now=new Date()
){
 const base=resumenPersona(modalidad,datos,semana,now,feriados);
 const ajustes=datos?.[semana]||{};
 const porHora=modalidad==="hora";
 const esperadoOFF=porHora?"4:30":"1";
 const offTexto=ajustes.off??esperadoOFF;
 const vacacionesTexto=ajustes.vacaciones??(porHora?"0:00":"0");
 const parse=(valor:string)=>{
   if(porHora){
     if(!/^\d{1,3}:[0-5]\d$/.test(valor))return null;
     const [h,m]=valor.split(":").map(Number);
     return h<=168?h*60+m:null;
   }
   return /^\d{1,2}$/.test(valor)&&Number(valor)<=14?Number(valor):null;
 };
 const off=parse(offTexto),vacaciones=parse(vacacionesTexto);
 const trabajados=porHora?base.horas+base.horasFeriado:base.turnos;
 const extraFeriado=porHora?base.horasFeriado:base.extraFeriado;
 const vacacionesDias=diasSemana(semana).filter(d=>datos?.[d]?.vacaciones_dia===true);
 const feriadosTrabajados=feriados.filter(d=>{
   const v=evaluarDia(datos?.[d]||{},false);
   return v.horas>0&&v.errores.length===0;
 });
 const errores=[
   ...(base.errores?["Hay turnos por revisar."]:[]),
   ...(off===null?["OFF incorrecto."]:[]),
   ...(vacaciones===null?["Vacaciones incorrectas."]:[]),
   ...(vacaciones!==null&&vacaciones>0&&!vacacionesDias.length?["Marcá los días de vacaciones."]:[])
 ];
 const automatica=[
   ...feriadosTrabajados.map(d=>"Feriado: "+fechaCorta(d)),
   ...(vacacionesDias.length?["Vacaciones: "+vacacionesDias.map(fechaCorta).join(", ")]:[])
 ];
 const manual=(ajustes.observaciones||"").trim();
 return {
   modalidad,trabajados,off:off??0,offTexto,vacaciones:vacaciones??0,vacacionesTexto,
   extraFeriado,feriadosTrabajados,vacacionesDias,
   observaciones:[...automatica,...(manual?[manual]:[])].join(" · "),
   errores,pendientes:base.pendientes,
   total:errores.length?null:trabajados+(off??0)+(vacaciones??0)+extraFeriado
 };
}

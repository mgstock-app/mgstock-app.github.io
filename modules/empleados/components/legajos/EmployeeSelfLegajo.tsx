"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ClipboardList, CheckCircle2, Save, Loader2 } from "lucide-react";
import { rpc } from "@/features/access/api";
import "./employee-self-legajo.css";

type OwnLegajo={
  id:string;first_name:string;last_name:string;phone:string;payment_alias:string;
  started_on:string|null;needs_completion:boolean;local_id:string;
};
type FormValues={first_name:string;last_name:string;phone:string;payment_alias:string;started_on:string};
const fields=(profile:OwnLegajo):FormValues=>({
  first_name:profile.first_name==="Colaborador"?"":profile.first_name,
  last_name:profile.last_name==="Pendiente"?"":profile.last_name,
  phone:profile.phone||"",
  payment_alias:profile.payment_alias||"",
  started_on:profile.started_on||"",
});
export function EmployeeSelfLegajo({userId,localId}:{userId:string;localId:string|null}){
  const [profile,setProfile]=useState<OwnLegajo|null>(null);
  const [values,setValues]=useState<FormValues|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState(false);
  const [editing,setEditing]=useState(false);
  useEffect(()=>{
    let alive=true;
    rpc<OwnLegajo|null>("rm_app_staff_self_profile")
      .then(value=>{
        if(!alive)return;
        if(value&&value.local_id===localId){
          setProfile(value);setValues(fields(value));setEditing(value.needs_completion);
        }
        setError("");
      }).catch(()=>{
        if(alive)setError("No se pudo consultar tu legajo. Revisá la conexión e intentá nuevamente.");
      }).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[userId,localId]);
  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!values||saving)return;
    setSaving(true);setError("");setSuccess(false);
    try{
      const data=await rpc<OwnLegajo>("rm_app_staff_self_profile_save",{
        p_first_name:values.first_name.trim(),
        p_last_name:values.last_name.trim(),
        p_phone:values.phone.trim(),
        p_payment_alias:values.payment_alias.trim(),
        p_started_on:values.started_on||null,
      });
      if(data.id!==profile?.id||data.local_id!==localId)throw Error("El servidor devolvió un legajo distinto.");
      setProfile(data);setValues(fields(data));setEditing(false);setSuccess(true);
    }catch(cause){
      setError(cause instanceof Error?cause.message:"No se pudo guardar el legajo.");
    }finally{setSaving(false);}
  }
  if(loading)return <section className="esl-card" id="mi-legajo" aria-label="Mi legajo"><p>Cargando mi legajo…</p></section>;
  if(!profile) return error
    ?<section className="esl-card" id="mi-legajo"><p role="alert">{error}</p></section>
    :null; // Un colaborador anterior sin legajo invitado conserva su acceso habitual.
  const value=values;
  return <section className="esl-card" id="mi-legajo" aria-label="Mi legajo personal">
    <div className="esl-head">
      <div><span className="esl-eyebrow"><ClipboardList size={17}/> MI LEGAJO</span>
        <h2>{profile.needs_completion?"Completá tus datos personales":"Mi legajo personal"}</h2>
        <p>{profile.needs_completion
          ?"Antes de empezar, completá tus datos. La fecha de ingreso es opcional."
          :"Tus datos están guardados. Podés corregirlos cuando lo necesites."}</p>
      </div>
      {!editing&&<button type="button" className="esl-edit" onClick={()=>{setEditing(true);setSuccess(false);}}>Editar mis datos</button>}
    </div>
    {success&&<p className="esl-success" role="status"><CheckCircle2 size={17}/> Legajo guardado correctamente.</p>}
    {error&&<p className="esl-error" role="alert">{error}</p>}
    {editing&&value ? <form className="esl-form" onSubmit={e=>void save(e)}>
      <div className="esl-grid">
        <label>Nombre<input required maxLength={100} autoComplete="given-name" value={value.first_name} onChange={e=>setValues(v=>v&&({...v,first_name:e.target.value}))}/></label>
        <label>Apellido<input required maxLength={100} autoComplete="family-name" value={value.last_name} onChange={e=>setValues(v=>v&&({...v,last_name:e.target.value}))}/></label>
        <label>Teléfono<input type="tel" inputMode="tel" required minLength={8} maxLength={35} autoComplete="tel" value={value.phone} placeholder="Ej. 11 1234-5678" onChange={e=>setValues(v=>v&&({...v,phone:e.target.value}))}/></label>
        <label>Alias para transferencias<input required maxLength={120} autoComplete="off" value={value.payment_alias} placeholder="Tu alias bancario" onChange={e=>setValues(v=>v&&({...v,payment_alias:e.target.value}))}/></label>
        <label>Fecha de ingreso <small>(opcional)</small><input type="date" value={value.started_on} onChange={e=>setValues(v=>v&&({...v,started_on:e.target.value}))}/></label>
      </div>
      <div className="esl-actions">
        <button className="esl-save" type="submit" disabled={saving}>{saving?<Loader2 size={18}/>:<Save size={18}/>} {saving?"Guardando…":"Guardar mi legajo"}</button>
        {!profile.needs_completion&&<button type="button" disabled={saving} onClick={()=>{setEditing(false);setValues(fields(profile));setError("");}}>Cancelar</button>}
      </div>
      <p className="esl-privacy">Tus datos quedan vinculados únicamente a tu cuenta y tu sucursal. El estado laboral, las fechas de refuerzo y los recibos los administra la empresa.</p>
    </form> : <dl className="esl-summary">
      <div><dt>Nombre</dt><dd>{profile.first_name} {profile.last_name}</dd></div>
      <div><dt>Teléfono</dt><dd>{profile.phone}</dd></div>
      <div><dt>Alias</dt><dd>{profile.payment_alias}</dd></div>
      <div><dt>Fecha de ingreso</dt><dd>{profile.started_on?profile.started_on.split("-").reverse().join("/"):"No informada"}</dd></div>
    </dl>}
  </section>;
}

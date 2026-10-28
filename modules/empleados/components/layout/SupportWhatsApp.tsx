"use client";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useGestlokCompany } from "@/components/gestlok/GestlokContext";
import { createClient } from "@/lib/supabase/browser";
import "./support-whatsapp.css";

const validPhone = (s:string)=>/^[1-9][0-9]{7,14}$/.test(s);
export function SupportWhatsApp() {
  const {user} = useAuth();
  const company = useGestlokCompany();
  const [number,setNumber] = useState("");
  const uid = user?.user_id || "";
  useEffect(()=>{
    if (!uid || user?.status!=="approved") return;
    let alive=true;
    const load=async()=>{
      try{
        const {data,error}=await createClient().from("gestlok_support_settings")
          .select("whatsapp").eq("id","global").single();
        if(!alive)return;
        const phone=String(data?.whatsapp||"");
        setNumber(!error&&validPhone(phone)?phone:"");
      }catch{if(alive)setNumber("");}
    };
    queueMicrotask(()=>void load());
    const timer=window.setInterval(()=>{if(!document.hidden)void load();},120000);
    const visible=()=>{if(!document.hidden)void load();};
    document.addEventListener("visibilitychange",visible);
    return()=>{alive=false;clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
  },[uid,user?.status]);
  if (!uid || user?.status!=="approved" || !validPhone(number)) return null;
  const role=user.role==="owner"?"dueño/a":user.role==="employee"?"colaborador/a":
    user.role==="manager"||user.gestlok_gerente?.local_ids?.length?"gerente":"usuario/a";
  const localIds=user.gestlok_gerente?.local_ids || [];
  const local=user.local_name || (localIds.length===1?(localIds[0]==="dt"?"Don Torcuato":localIds[0]):"");
  const companyName=company?.company_name || "mi empresa";
  const text="Hola, necesito ayuda con GESTLOK en Administración de empleados."+
    " Mi rol es "+role+(local?" del local "+local:"")+" de "+companyName+".";
  const href="https://wa.me/"+number+"?text="+encodeURIComponent(text);
  return <a className="gestlok-help" href={href} target="_blank" rel="noopener noreferrer"
    aria-label="Abrir soporte GESTLOK por WhatsApp">
    <span className="gestlok-help__icon"><MessageCircle size={19} aria-hidden="true"/></span>
    <span>Soporte</span>
  </a>;
}

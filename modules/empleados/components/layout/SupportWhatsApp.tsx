"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useGestlokCompany } from "@/components/gestlok/GestlokContext";
import { createClient } from "@/lib/supabase/browser";
import "./support-whatsapp.css";

const validPhone = (s:string)=>/^[1-9][0-9]{7,14}$/.test(s);
const BUBBLE_KEY = "gestlok:support-bubble-position-v1";
const clip = (n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function SupportWhatsApp() {
  const {user} = useAuth();
  const company = useGestlokCompany();
  const [number,setNumber] = useState("");
  const bubbleRef=useRef<HTMLAnchorElement>(null);
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
  // Posición por dispositivo. El botón mantiene su enlace si se toca, pero
  // arrastrarlo nunca abre WhatsApp ni modifica el contexto del local.
  useEffect(()=>{
    const el=bubbleRef.current;
    if(!el)return;
    const margin=12;
    let pointer:{id:number;x:number;y:number;left:number;top:number;moved:boolean}|null=null;
    let blockClick=false,placed=false;
    const bounds=()=>{
      const r=el.getBoundingClientRect();
      return {minX:margin,minY:margin,
        maxX:Math.max(margin,window.innerWidth-r.width-margin),
        maxY:Math.max(margin,window.innerHeight-r.height-margin)};
    };
    const place=(x:number,y:number)=>{
      const b=bounds();
      el.style.left=clip(x,b.minX,b.maxX)+"px";
      el.style.top=clip(y,b.minY,b.maxY)+"px";
      el.style.right="auto";el.style.bottom="auto";placed=true;
    };
    const save=()=>{
      if(!placed)return;
      const rect=el.getBoundingClientRect(),b=bounds();
      const x=clip((rect.left-b.minX)/Math.max(1,b.maxX-b.minX),0,1);
      const y=clip((rect.top-b.minY)/Math.max(1,b.maxY-b.minY),0,1);
      try{localStorage.setItem(BUBBLE_KEY,JSON.stringify({v:1,x,y}));}catch{}
    };
    const restore=()=>{
      try{
        const p=JSON.parse(localStorage.getItem(BUBBLE_KEY)||"null");
        if(p?.v!==1||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
           p.x<0||p.x>1||p.y<0||p.y>1)return;
        const b=bounds();
        place(b.minX+p.x*(b.maxX-b.minX),b.minY+p.y*(b.maxY-b.minY));
      }catch{}
    };
    const down=(e:PointerEvent)=>{
      if(e.pointerType==="mouse"&&e.button!==0)return;
      const r=el.getBoundingClientRect();
      pointer={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};
      blockClick=false;
      try{el.setPointerCapture?.(e.pointerId);}catch{}
    };
    const move=(e:PointerEvent)=>{
      if(!pointer||pointer.id!==e.pointerId)return;
      const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
      if(!pointer.moved&&Math.hypot(dx,dy)<7)return;
      pointer.moved=true;blockClick=true;
      el.classList.add("gestlok-help--dragging");
      place(pointer.left+dx,pointer.top+dy);
      e.preventDefault();
    };
    const up=(e:PointerEvent)=>{
      if(!pointer||pointer.id!==e.pointerId)return;
      if(pointer.moved)save();
      el.classList.remove("gestlok-help--dragging");
      if(el.hasPointerCapture?.(e.pointerId))el.releasePointerCapture?.(e.pointerId);
      pointer=null;
    };
    const click=(e:MouseEvent)=>{
      if(!blockClick)return;
      e.preventDefault();e.stopImmediatePropagation();blockClick=false;
    };
    const keys=(e:KeyboardEvent)=>{
      const delta:Record<string,[number,number]>={
        ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]};
      const shift=delta[e.key];if(!shift)return;
      e.preventDefault();
      const r=el.getBoundingClientRect();
      place(r.left+shift[0],r.top+shift[1]);save();
    };
    const resize=()=>{
      if(!placed)return;
      restore();
      const r=el.getBoundingClientRect();place(r.left,r.top);
    };
    el.addEventListener("pointerdown",down);
    el.addEventListener("pointermove",move);
    el.addEventListener("pointerup",up);
    el.addEventListener("pointercancel",up);
    el.addEventListener("click",click,true);
    el.addEventListener("keydown",keys);
    window.addEventListener("resize",resize);
    restore();
    return ()=>{
      el.removeEventListener("pointerdown",down);
      el.removeEventListener("pointermove",move);
      el.removeEventListener("pointerup",up);
      el.removeEventListener("pointercancel",up);
      el.removeEventListener("click",click,true);
      el.removeEventListener("keydown",keys);
      window.removeEventListener("resize",resize);
    };
  },[uid,user?.status,number]);
  if (!uid || user?.status!=="approved" || !validPhone(number)) return null;
  const role=user.role==="owner"?"dueño/a":user.role==="employee"?"colaborador/a":
    user.role==="manager"||user.gestlok_gerente?.local_ids?.length?"gerente":"usuario/a";
  const localIds=user.gestlok_gerente?.local_ids || [];
  const local=user.local_name || (localIds.length===1?(localIds[0]==="dt"?"Don Torcuato":localIds[0]):"");
  const companyName=company?.company_name || "mi empresa";
  const text="Hola, necesito ayuda con GESTLOK en Administración de empleados."+
    " Mi rol es "+role+(local?" del local "+local:"")+" de "+companyName+".";
  const href="https://wa.me/"+number+"?text="+encodeURIComponent(text);
  return <a ref={bubbleRef} className="gestlok-help" href={href} target="_blank" rel="noopener noreferrer"
    aria-label="Abrir soporte GESTLOK por WhatsApp. Arrastrar para mover"
    title="Soporte por WhatsApp · arrastrar para mover">
    <span className="gestlok-help__icon" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="currentColor" focusable="false" aria-hidden="true">
        <path d="M16.01 2.4A13.55 13.55 0 0 0 4.35 22.9L2.5 29.5l6.77-1.79A13.62 13.62 0 1 0 16.01 2.4Zm0 24.8c-2.1 0-4.18-.57-5.97-1.66l-.43-.25-4.02 1.06 1.07-3.91-.28-.45a11.06 11.06 0 1 1 9.63 5.21Zm6.08-8.27c-.33-.16-1.95-.96-2.25-1.07-.3-.11-.52-.16-.74.16-.22.33-.86 1.07-1.05 1.29-.19.22-.38.25-.71.08-.33-.16-1.39-.51-2.65-1.64-.98-.87-1.64-1.94-1.83-2.27-.19-.33-.02-.5.14-.66.14-.15.33-.39.49-.58.16-.19.22-.33.33-.55.11-.22.05-.41-.03-.58-.08-.16-.74-1.78-1.01-2.44-.27-.64-.54-.55-.74-.56h-.63c-.22 0-.58.08-.88.41-.3.33-1.15 1.13-1.15 2.76s1.18 3.2 1.34 3.43c.16.22 2.32 3.54 5.62 4.97.78.34 1.4.54 1.88.69.79.25 1.51.21 2.08.13.63-.09 1.95-.8 2.22-1.57.27-.77.27-1.44.19-1.57-.08-.14-.3-.22-.63-.39Z"/>
      </svg>
    </span>
    <span className="gestlok-help__label">Soporte</span>
  </a>;
}

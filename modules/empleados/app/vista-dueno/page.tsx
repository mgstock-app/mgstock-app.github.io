"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { AccessGate } from "@/components/auth/AccessGate";
import { AlessandroOwnerHome } from "@/components/owner/AlessandroOwnerHome";
function OwnerView(){
 const {user}=useAuth();
 const params=useSearchParams();
 if(user?.role!=="admin"||user.status!=="approved")return <p role="alert">Acceso exclusivo de Administración General.</p>;
 const section=params.get("seccion");
 return <AlessandroOwnerHome user={user} initialLocal={params.get("local")||""} initialArea={section==="recibos"?"recibos":section==="planillas"?"planillas":"empleados"}/>;
}
export default function OwnerViewPage(){return <Suspense fallback={<p role="status">Cargando panel del dueño…</p>}><AccessGate manager><OwnerView/></AccessGate></Suspense>;}

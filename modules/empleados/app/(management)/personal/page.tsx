import { Suspense } from "react";
import { AdminPersonnel } from "@/components/admin/AdminPersonnel";
export default function PersonnelPage(){return <Suspense fallback={<p role="status">Cargando personal…</p>}><AdminPersonnel/></Suspense>;}

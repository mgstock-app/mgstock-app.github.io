"use client";
import { useEffect, useRef, useState } from "react";
import { createBrowserScope } from "@/utils/browser-scope";
import { createReportServices } from "@/features/reports/data-service";
import { createClient } from "@/lib/supabase/browser";
import { allowed } from "@/utils/permissions";
import type { AppLocal, AppUser } from "@/types/access";
type ReportEngine = {
  renderImage: (data: Record<string, unknown>, name: string) => Promise<Blob>;
  deliverySaved: (id: string, data: Record<string, unknown>) => void;
  openSheet: (localId: string, id: string) => boolean;
  addSheet: (localId: string) => boolean;
};
export function useReportWorkspace(user: AppUser, locals: AppLocal[]) {
  const engineRef = useRef<ReportEngine | null>(null);
  const [ready, setReady] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!root.current) return;
    const scope = createBrowserScope(root.current);
    const client = createClient();
    const account = user;
    const services = createReportServices(
      client,
      scope,
      account,
      locals[0].organization_id,
    );
    const bridge = {
      ...services,
      publish: async (id: string) => {
        if (!scope.active) return;
        const result = await client
          .from("rm_test_documents")
          .select("data,updated_at")
          .eq("path", `hojas/${id}`)
          .single();
        if (result.error || !engine)
          throw new Error(
            "No se pudo consultar la versión actual del reporte.",
          );
        const blob = await engine.renderImage(
          result.data.data,
          result.data.data.nombre ||
            result.data.data.nombreHoja ||
            "Colaborador",
        );
        const image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        if (!scope.active) return;
        const { error: publishError } = await client.rpc(
          "rm_app_publish_private_report",
          { p_sheet: id, p_image: image, p_version: result.data.updated_at },
        );
        if (publishError)
          throw new Error(
            "Los datos cambiaron o falta permiso para publicar. Actualizá el reporte y volvé a intentar.",
          );
        await refreshDelivered(id);
      },
      recordWhatsapp: async (id: string, contact: { nombre: string; tel: string }, expectedUpdated: string | null) => {
        const { data, error } = await client.from("rm_test_documents").select("data,updated_at").eq("path", `hojas/${id}`).single();
        if (error || (data.data.actualizado || null) !== expectedUpdated)
          throw new Error("El reporte cambió. Actualizá antes de compartir.");
        const result = await client.rpc("rm_app_record_whatsapp", { p_sheet: id, p_version: data.updated_at, p_contact: contact });
        if (result.error) throw new Error("No se pudo registrar el envío y su historial. Actualizá e intentá nuevamente.");
        await refreshDelivered(id);
      },
    };
    async function refreshDelivered(id: string) {
      const { data, error } = await client.from("rm_test_documents").select("data").eq("path", `hojas/${id}`).single();
      if (!error && scope.active && engine) engine.deliverySaved(id, data.data);
    }
    let engine: ReportEngine | null = null;
    window.reportServices = bridge;
    window.REPORT_LOCALS = locals;
    window.REPORT_IS_DEMO = false;
    window.REPORT_PERMISSIONS = {
      role: account.role!,
      allowed: (action) => allowed(account.role, action),
    };
    window.enforceReportUI = (doc) => {
      for (const [id, action] of [
        ["bRestaurar", "restore"],
        ["bCopia", "backups"],
        ["bNube", "backups"],
        ["bGuardarNube", "backups"],
      ]) {
        const element = doc.getElementById(id);
        if (element && !allowed(account.role, action)) element.hidden = true;
      }
    };
    Promise.all([import("@/features/reports/runtime"), import("jspdf")])
      .then(([{ mountReport }, { jsPDF }]) => {
        if (!scope.active) return;
        window.jspdf = { jsPDF };
        engine = mountReport(scope);
        engineRef.current = engine;
        setReady(true);
      })
      .catch(() => {
        if (scope.active)
          setError(
            "No se pudo cargar el reporte. Recargá la página para volver a intentar.",
          );
      });
    return () => {
      scope.dispose();
      engineRef.current = null;
      if (window.reportServices === bridge) {
        delete window.reportServices;
        delete window.REPORT_LOCALS;
        delete window.REPORT_PERMISSIONS;
        delete window.enforceReportUI;
      }
    };
  }, [user, locals]);
  return { root, error, ready,
    openSheet: (localId: string, id: string) => engineRef.current?.openSheet(localId, id) ?? false,
    addSheet: (localId: string) => engineRef.current?.addSheet(localId) ?? false,
  };
}

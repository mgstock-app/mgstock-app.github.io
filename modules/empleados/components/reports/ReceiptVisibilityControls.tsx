"use client";
import { useEffect, useState } from "react";
import { CalendarCheck2, CalendarDays, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { rpc } from "@/features/access/api";
import "./receipt-visibility-controls.css";

type Visibility = { show_holidays:boolean; show_vacations:boolean };
/** Owner-only controls, verified again in Supabase RPC.
 * These are display preferences, NEVER silent adjustments to amounts owed.
 */
export function ReceiptVisibilityControls({ organizationId }: {organizationId:string}) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Visibility | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (user?.role !== "owner" || !organizationId) return;
    let active = true;
    rpc<Visibility>("rm_app_receipt_visibility_options", {p_organization:organizationId})
      .then(value => { if (active) {setSettings(value);setError("");} })
      .catch(() => {if (active) setError("No se pudieron cargar las opciones de recibos.");});
    return () => {active = false;};
  }, [user?.role, organizationId]);
  if (user?.role !== "owner" || !organizationId) return null;
  const save = async (field:keyof Visibility, checked:boolean) => {
    if (!settings || busy) return;
    setBusy(true);setError("");
    try {
      const next = { ...settings, [field]:checked };
      const result = await rpc<Visibility>("rm_app_receipt_save_visibility_options", {
        p_organization:organizationId,
        p_show_holidays:next.show_holidays,
        p_show_vacations:next.show_vacations,
      });
      setSettings(result);
    } catch {
      setError("No se pudo guardar. Tu configuración anterior se conserva.");
    } finally {setBusy(false);}
  };
  return <section className="receipt-visibility" aria-label="Configuración de recibos para el dueño">
    <div className="receipt-visibility__title">
      <ShieldCheck size={22}/>
      <div><strong>Opciones del recibo</strong><span>Solo el dueño de esta empresa puede modificarlas.</span></div>
    </div>
    <div className="receipt-visibility__options">
      <label>
        <CalendarDays size={20}/>
        <span>Mostrar feriados<small>Desactivar la fila si no tiene importes cargados.</small></span>
        <input type="checkbox" aria-label="Mostrar feriados en recibos" disabled={busy||!settings}
          checked={settings?.show_holidays??true}
          onChange={event=>void save("show_holidays",event.target.checked)}/>
      </label>
      <label>
        <CalendarCheck2 size={20}/>
        <span>Mostrar vacaciones<small>Desactivar la fila si no tiene importes cargados.</small></span>
        <input type="checkbox" aria-label="Mostrar vacaciones en recibos" disabled={busy||!settings}
          checked={settings?.show_vacations??true}
          onChange={event=>void save("show_vacations",event.target.checked)}/>
      </label>
    </div>
    <p className="receipt-visibility__note">Los importes ya liquidados siguen visibles aunque una opción esté desactivada, para que el total a cobrar siempre se pueda verificar. Estas opciones no recalculan ni eliminan montos.</p>
    {error && <p role="alert" className="receipt-visibility__error">{error}</p>}
    {busy && <p role="status">Guardando configuración…</p>}
  </section>;
}

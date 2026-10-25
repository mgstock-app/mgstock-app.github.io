"use client";
import { Fragment, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { rpc } from "@/features/access/api";
import { ScheduleSheetCard } from "./ScheduleSheetCard";
import { visibleBranchScheduleCards } from "@/utils/branch-schedule-links";
import styles from "./ScheduleSheetCard.module.css";

type BranchLink = { local_id: string; local_name: string; url: string | null };
export function BranchScheduleLink({ local, company }: { local?: string; company?: string }) {
  const { user } = useAuth();
  const [result, setResult] = useState<{ key: string; rows: BranchLink[]; failed: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const permitted = user?.role === "admin" || user?.role === "owner" || user?.role === "manager";
  const key = `${user?.user_id}:${user?.role}:${local || ""}:${company || ""}`;
  useEffect(() => {
    if (!permitted || (!local && !company)) return;
    let alive = true;
    const load = () => rpc<BranchLink[]>("rm_app_branch_schedule_links", { p_local: local || null, p_company: company || null })
      .then(rows => { if (alive) { setResult({ key, rows, failed: false }); } })
      .catch(() => { if (alive) { setResult({ key, rows: [], failed: true }); } });
    void load();
    window.addEventListener("focus", load);
    const timer = window.setInterval(load, 15000);
    return () => { alive = false; window.removeEventListener("focus", load); window.clearInterval(timer); };
  }, [permitted, key, local, company, retry]);
  if (!permitted) return null;
  if (result?.key !== key) return null;
  const visible = visibleBranchScheduleCards(result.rows);
  if (result.failed || (result.rows.length > 0 && visible.length === 0)) return <div className="schedule-sheet-status" role="alert"><p>No pudimos cargar el enlace de horarios. Reintentá o consultá a Administración.</p><button type="button" onClick={() => setRetry(value => value + 1)}>Reintentar</button></div>;
  if (!visible.length && company && result.rows.length === 0) return <p className="schedule-sheet-status">Todavía no hay sucursales para configurar. Agregá un local desde Mis empresas para vincular su planilla de Google Sheets.</p>;
  return <div className="schedule-sheet-links">{visible.map((row, index) =>
    <Fragment key={`${row.local_id}:${row.url || "pending"}`}>
      {index > 0 && <hr className={styles.separator} aria-hidden="true" />}
      <ScheduleSheetCard url={row.url} branch={row.local_id === "dt" ? "Torcuato" : row.local_name} localId={row.local_id} canConfigure={user?.role === "owner"} onUpdated={() => setRetry(value => value + 1)} />
    </Fragment>
  )}</div>;
}

export function CurrentBranchScheduleLink() {
  const [local, setLocal] = useState("");
  useEffect(() => {
    const change = (event: Event) => setLocal(String((event as CustomEvent).detail || ""));
    window.addEventListener("report-local-changed", change);
    return () => window.removeEventListener("report-local-changed", change);
  }, []);
  return <BranchScheduleLink local={local} />;
}



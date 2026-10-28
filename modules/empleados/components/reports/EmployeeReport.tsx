"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrivateReceiptDetail, type PrivateReceiptPayload } from "./PrivateReceiptDetail";
import { accessApi } from "@/features/access/api";
import type { ReportAccess } from "@/types/access";
export function EmployeeReport() {
  const [access, setAccess] = useState<ReportAccess | null>(null);
  const [receipt, setReceipt] = useState<PrivateReceiptPayload | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (document.hidden) {
      setReceipt(null);
      return;
    }
    const current = ++sequence.current;
    const startedAt = performance.now();
    try {
      const state = await accessApi.access();
      if (current !== sequence.current) return;
      setAccess(state);
      setMessage("");
      if (state.status !== "active") {
        setReceipt(null);
        return;
      }
      const report = await accessApi.privateReceipt();
      if (current !== sequence.current) return;
      const remaining =
        new Date(report.expires_at).getTime() -
        new Date(report.server_now).getTime() -
        (performance.now() - startedAt);
      if (expiry.current) clearTimeout(expiry.current);
      if (remaining <= 0) {
        setReceipt(null);
        return;
      }
      if (!report.sheet || typeof report.sheet !== "object")
        throw new Error("El recibo privado no tiene datos válidos.");
      setReceipt(report);
      expiry.current = setTimeout(() => {
        ++sequence.current;
        setReceipt(null);
        setAccess((previous) =>
          previous
            ? { ...previous, status: "expired", can_request: true }
            : null,
        );
      }, remaining);
    } catch (cause) {
      if (current === sequence.current) {
        setReceipt(null);
        setAccess(null);
        if (expiry.current) clearTimeout(expiry.current);
        setMessage(
          cause instanceof Error
            ? cause.message
            : "No se pudo comprobar tu permiso.",
        );
      }
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void refresh());
    const interval = setInterval(() => void refresh(), 15000);
    const visibility = () => {
      if (document.hidden) {
        ++sequence.current;
        setReceipt(null);
      } else void refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", visibility);
    const invalidate = () => {
      ++sequence.current;
    };
    return () => {
      invalidate();
      clearInterval(interval);
      if (expiry.current) clearTimeout(expiry.current);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", visibility);
    };
  }, [refresh]);
  async function act(action: "open" | "request") {
    setBusy(true);
    setMessage("");
    try {
      if (action === "open") await accessApi.open();
      else {
        await accessApi.request();
        setMessage(
          "Solicitud enviada. Esperá la aprobación del dueño o de la administración.",
        );
      }
      await refresh();
    } catch (cause) {
      setReceipt(null);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "No se pudo completar la operación.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-page employee-report">
      <span className="eyebrow">ACCESO PERSONAL · SOLO LECTURA</span>
      <h1>Mi recibo de sueldo</h1>
      <p>
        {access
          ? {
              ready:
                "Tu empresa publicó tu recibo. Ya podés abrirlo para verlo.",
              active:
                "Tu recibo privado publicado por la empresa. Solo lectura.",
              expired:
                "Solicitá una nueva habilitación para ver tu recibo.",
              requested: "Tu solicitud está pendiente de aprobación.",
              unavailable:
                "El dueño todavía no publicó tu recibo personal.",
            }[access.status]
          : "Comprobando tu recibo privado…"}
      </p>
      <div className="row-actions">
        {access?.status === "ready" && (
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void act("open")}
          >
            Ver mi recibo
          </button>
        )}
        {access?.status === "expired" && access.can_request && (
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void act("request")}
          >
            Solicitar acceso
          </button>
        )}
        <button disabled={busy} onClick={() => void refresh()}>
          Actualizar estado
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {receipt && <PrivateReceiptDetail receipt={receipt} />}
    </section>
  );
}

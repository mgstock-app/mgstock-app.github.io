"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { accessApi } from "@/features/access/api";
import type { ReportAccess } from "@/types/access";
export function EmployeeReport() {
  const [access, setAccess] = useState<ReportAccess | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (document.hidden) {
      setImage(null);
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
        setImage(null);
        return;
      }
      const report = await accessApi.image();
      if (current !== sequence.current) return;
      const remaining =
        new Date(report.expires_at).getTime() -
        new Date(report.server_now).getTime() -
        (performance.now() - startedAt);
      if (expiry.current) clearTimeout(expiry.current);
      if (remaining <= 0) {
        setImage(null);
        return;
      }
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(report.image))
        throw new Error("El reporte no tiene un formato de imagen válido.");
      setImage(report.image);
      expiry.current = setTimeout(() => {
        ++sequence.current;
        setImage(null);
        setAccess((previous) =>
          previous
            ? { ...previous, status: "expired", can_request: true }
            : null,
        );
      }, remaining);
    } catch (cause) {
      if (current === sequence.current) {
        setImage(null);
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
        setImage(null);
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
      setImage(null);
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
      <h1>Mi reporte</h1>
      <p>
        {access
          ? {
              ready:
                "Tu reporte está listo para consultar.",
              active:
                "Esta es la imagen preparada por el dueño.",
              expired:
                "Solicitá una nueva habilitación para consultar tu reporte.",
              requested: "Tu solicitud está pendiente de aprobación.",
              unavailable:
                "El dueño todavía no publicó una imagen de tu reporte.",
            }[access.status]
          : "Comprobando tu reporte…"}
      </p>
      <div className="row-actions">
        {access?.status === "ready" && (
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void act("open")}
          >
            Abrir reporte
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
      {image && (
        <div className="report-image">
          <Image
            unoptimized
            src={image}
            width={1260}
            height={1782}
            alt="Imagen de tu reporte mensual o semanal, preparada por el dueño"
          />
        </div>
      )}
    </section>
  );
}

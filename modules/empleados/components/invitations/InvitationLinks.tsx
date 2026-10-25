"use client";
import { useCallback, useEffect, useState } from "react";
import { joinApi } from "@/features/onboarding/api";
import type { JoinLink } from "@/types/invitations";
import { displayDate } from "@/utils/permissions";
export function InvitationLinks({ company }: { company: string }) {
  const [links, setLinks] = useState<JoinLink[]>([]);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    queueMicrotask(tick);
    const timer = window.setInterval(tick, 30000);
    return () => window.clearInterval(timer);
  }, []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    setLinks(await joinApi.list(company));
  }, [company]);
  useEffect(() => {
    let alive = true;
    joinApi
      .list(company)
      .then((v) => {
        if (alive) setLinks(v);
      })
      .catch((e) => {
        if (alive) setMessage(e.message);
      });
    return () => {
      alive = false;
    };
  }, [company]);
  async function create() {
    setBusy(true);
    setMessage("");
    try {
      await joinApi.create(company, null);
      await refresh();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No se pudo crear el enlace.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    try {
      await joinApi.revoke(id);
      await refresh();
      setMessage("Enlace revocado.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo revocar.");
    } finally {
      setBusy(false);
    }
  }
  async function copy(token: string) {
    const url = `${window.location.origin}${process.env.NEXT_PUBLIC_MODULE_BASE}/unirse/?codigo=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Enlace copiado. Compartilo con tus colaboradores.");
    } catch {
      setMessage(`Copiá este enlace: ${url}`);
    }
  }
  return (
    <section className="invitation-links">
      <h3>Ingreso de colaboradores por enlace</h3>
      <p>
        Válido por 7 días y hasta 50 solicitudes. Cada persona ingresa con
        Google y queda pendiente de tu aprobación.
      </p>
      <button type="button" disabled={busy} onClick={() => void create()}>
        Crear enlace para esta empresa
      </button>
      {links.map((link) => (
        <div key={link.id} className="invitation-row">
          <span>
            {link.revoked_at
              ? "Revocado"
              : new Date(link.expires_at).getTime() <= now
                ? "Vencido"
                : link.uses >= link.max_uses
                  ? "Agotado"
                  : "Disponible"}{" "}
            · {link.uses}/{link.max_uses} solicitudes · Vence{" "}
            {displayDate(link.expires_at)}
          </span>
          <button
            type="button"
            disabled={busy || !!link.revoked_at}
            onClick={() => void copy(link.token)}
          >
            Copiar enlace
          </button>
          <button
            type="button"
            disabled={busy || !!link.revoked_at}
            onClick={() => void revoke(link.id)}
          >
            Revocar
          </button>
        </div>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

"use client";
import { useEffect, useState } from "react";
import { onboardingApi } from "@/features/onboarding/api";
export function OwnerInvitations() {
  const [emails, setEmails] = useState<{ email: string; created_at: string }[]>(
    [],
  );
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    onboardingApi
      .ownerInvitations()
      .then((v) => {
        if (alive) setEmails(v);
      })
      .catch((e) => {
        if (alive) setMessage(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  async function update(value: string, enabled: boolean) {
    setBusy(true);
    setMessage("");
    try {
      await onboardingApi.allowOwner(value, enabled);
      setEmails(await onboardingApi.ownerInvitations());
      setEmail("");
      setMessage(
        enabled
          ? "Correo autorizado para registrarse como dueño, sin suscripción ni vencimiento."
          : "Autorización para nuevos registros retirada. Las cuentas existentes se conservan.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="create-local-form">
      <h2>Dueños invitados a GESTLOK · Empleados</h2>
      <p>
        Autorizá los correos que podrán crear su espacio personal con Google.
        Podés agregar más cuando lo desees.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void update(email.trim(), true);
        }}
      >
        <label htmlFor="owner-invitation-email">Correo del nuevo dueño</label>
        <input
          id="owner-invitation-email"
          type="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
        <button className="primary-button" disabled={busy}>
          Autorizar dueño
        </button>
      </form>
      {emails.map((item) => (
        <div className="invitation-row" key={item.email}>
          <strong>{item.email}</strong>
          <button
            disabled={busy}
            onClick={() => void update(item.email, false)}
          >
            Retirar autorización de registro
          </button>
        </div>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

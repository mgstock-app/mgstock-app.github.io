"use client";
import { useEffect, useRef } from "react";
import type { AppUser } from "@/types/access";
export function RejectAccountModal({
  target,
  busy,
  onClose,
  onConfirm,
}: {
  target: AppUser;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="assignment-dialog"
      aria-labelledby="reject-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="reject-title">Rechazar esta cuenta</h2>
      <p>
        {target.display_name} no podrá utilizar la aplicación. Podés asignarle
        un rol más adelante.
      </p>
      <div className="dialog-actions">
        <button disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button className="danger-button" disabled={busy} onClick={onConfirm}>
          {busy ? "Rechazando…" : "Confirmar rechazo"}
        </button>
      </div>
    </dialog>
  );
}

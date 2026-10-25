"use client";
import { useCallback, useEffect, useState } from "react";
import { schedulesApi } from "@/features/schedules/api";
import { displayDate, roleLabels } from "@/utils/permissions";
import type { ScheduleComment } from "@/types/schedules";
export function ScheduleComments({
  schedule,
  canComment,
}: {
  schedule: string;
  canComment: boolean;
}) {
  const [comments, setComments] = useState<ScheduleComment[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setComments(await schedulesApi.comments(schedule));
      setError("");
    } catch (cause) {
      setComments([]);
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudieron cargar los mensajes.",
      );
    }
  }, [schedule]);
  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await schedulesApi.comment(schedule, text.trim());
      setText("");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo publicar el mensaje.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="schedule-comments">
      <div className="section-heading">
        <h2>Comunicación con el dueño</h2>
        <button type="button" onClick={() => void refresh()}>
          Actualizar mensajes
        </button>
      </div>
      {comments.map((c) => (
        <article key={c.id}>
          <strong>
            {c.author_name} · {roleLabels[c.author_role]}
          </strong>
          <small>{displayDate(c.created_at)}</small>
          <p>{c.body}</p>
        </article>
      ))}
      {!comments.length && <p>Todavía no hay mensajes para este período.</p>}
      {error && <p role="alert">{error}</p>}
      {canComment && (
        <form onSubmit={send}>
          <label htmlFor="schedule-message">Mensaje sobre estos horarios</label>
          <textarea
            id="schedule-message"
            required
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
          />
          <button className="primary-button" disabled={busy || !text.trim()}>
            Publicar mensaje
          </button>
        </form>
      )}
    </section>
  );
}

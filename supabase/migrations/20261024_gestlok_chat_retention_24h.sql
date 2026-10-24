-- GestLok · chat interno efímero. Solo el chat; ninguna otra hoja se borra.
-- La interfaz esconde los mensajes al cumplir 24 horas. Esta regla RLS
-- también impide leerlos directamente por la API aunque cron se retrase.
-- Fecha de envío: milisegundos Unix del campo data.fecha.
-- Los mensajes antiguos sin fecha usan updated_at como respaldo.
create extension if not exists pg_cron with schema pg_catalog;

drop policy if exists gestlok_chat_read_max24h on public.docs;
create policy gestlok_chat_read_max24h
on public.docs as restrictive for select to authenticated
using (
  col !~ '^[^/]+/chat$'
  or coalesce(
    case when data->>'fecha' ~ '^[0-9]{12,13}$'
         then to_timestamp(((data->>'fecha')::numeric / 1000)::double precision)
    end,
    updated_at
  ) > now() - interval '24 hours'
);

-- Borrado definitivo solo de documentos <local>/chat vencidos.
-- Se ejecuta cada 15 min, con visibilidad inmediata al límite exacto por RLS.
select cron.schedule(
  'gestlok-chat-delete-after-24h',
  '*/15 * * * *',
  $cron$
    delete from public.docs
    where col ~ '^[^/]+/chat$'
      and coalesce(
        case when data->>'fecha' ~ '^[0-9]{12,13}$'
             then to_timestamp(((data->>'fecha')::numeric / 1000)::double precision)
        end,
        updated_at
      ) <= now() - interval '24 hours';
  $cron$
);

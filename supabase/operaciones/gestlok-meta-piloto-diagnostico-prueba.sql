-- SOLO GESTLOK Prueba. No se reinicia el cupo ni se guardan cuerpos de error.
do $guard$ begin
 if not exists(select 1 from information_schema.schemata where schema_name='entorno_control') or
 not exists(select 1 from information_schema.columns where table_schema='gestlok_chat_private' and table_name='pedidos' and column_name='es_prueba' and column_default='true') then
  raise exception 'Solo se permite instalar en Pruebas';
 end if;
end $guard$;
alter table gestlok_meta_pilot_private.attempts
 add column if not exists http_status smallint check(http_status between 100 and 599),
 add column if not exists graph_error_code integer check(graph_error_code >= 0),
 add column if not exists graph_error_subcode integer check(graph_error_subcode >= 0);
create or replace function public.gestlok_meta_pilot_outcome_diagnostic(
 p_event_hash text,p_outcome text,p_http_status smallint,p_graph_code integer,p_graph_subcode integer
)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_outcome is null or p_outcome not in ('accepted','failed','uncertain','excluded','no_reply') then raise exception 'Estado inválido'; end if;
 update gestlok_meta_pilot_private.attempts set outcome=p_outcome,
  http_status=p_http_status,
  graph_error_code=case when p_outcome='failed' then p_graph_code end,
  graph_error_subcode=case when p_outcome='failed' then p_graph_subcode end
 where event_hash=p_event_hash and outcome='reserved';
 return found;
end $$;
revoke all on function public.gestlok_meta_pilot_outcome_diagnostic(text,text,smallint,integer,integer) from public,anon,authenticated;
grant execute on function public.gestlok_meta_pilot_outcome_diagnostic(text,text,smallint,integer,integer) to service_role;

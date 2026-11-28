-- GESTLOK WAI · respaldo automático (PC → teléfono) sin QR nuevo.
-- La sesión de WhatsApp de cada línea se guarda CIFRADA (AES-256-GCM en el conector);
-- la base nunca tiene la clave. Solo el equipo que tiene el turno vigente del servidor
-- central (misma clave central + instancia + turno sin vencer) puede leer o escribir.
-- Se aplica igual en Prueba y en Producción. Idempotente.
create table if not exists gestlok_chat_private.wai_auth_estado(
 habilitacion_id uuid not null references gestlok_chat_private.whatsapp_premium_habilitaciones(id) on delete cascade,
 tipo text not null check(tipo ~ '^[a-z][a-z-]{0,39}$'),
 clave text not null check(length(clave) between 1 and 300),
 valor text not null check(length(valor)<=200000),
 actualizado_at timestamptz not null default clock_timestamp(),
 primary key(habilitacion_id,tipo,clave)
);
alter table gestlok_chat_private.wai_auth_estado enable row level security;
revoke all on gestlok_chat_private.wai_auth_estado from public,anon,authenticated;

create or replace function public.gestlok_chat_wai_auth(p_clave text,p_instancia uuid,p_id uuid,p_accion text,
 p_tipo text default null,p_claves text[] default null,p_cambios jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c gestlok_chat_private.wai_servidor_central; ch jsonb; v jsonb:='{}'::jsonb; r record;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or p_instancia is null or p_id is null then return null;end if;
 select * into c from gestlok_chat_private.wai_servidor_central
  where id and clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and instancia=p_instancia and vence_at>clock_timestamp();
 if not found then return null;end if;
 if not exists(select 1 from gestlok_chat_private.wai_central_lineas() a where a.id=p_id) then return null;end if;
 if p_accion='leer' then
  if p_tipo is null or p_tipo !~ '^[a-z][a-z-]{0,39}$' or p_claves is null or cardinality(p_claves)>500 then return null;end if;
  for r in select e.clave,e.valor from gestlok_chat_private.wai_auth_estado e where e.habilitacion_id=p_id and e.tipo=p_tipo and e.clave=any(p_claves) loop
   v=v||jsonb_build_object(r.clave,r.valor);
  end loop;
  return jsonb_build_object('ok',true,'valores',v);
 elsif p_accion='guardar' then
  if p_cambios is null or jsonb_typeof(p_cambios)<>'array' or jsonb_array_length(p_cambios)>500 then return null;end if;
  -- Primero se valida todo; si algo no corresponde, no se guarda nada.
  for ch in select * from jsonb_array_elements(p_cambios) loop
   if jsonb_typeof(ch)<>'object' or ch->>'t' is null or ch->>'t' !~ '^[a-z][a-z-]{0,39}$' or coalesce(length(ch->>'k'),0) not between 1 and 300
    or (ch->'v' is not null and jsonb_typeof(ch->'v') not in ('null','string')) or length(coalesce(ch->>'v',''))>200000 then return null;end if;
  end loop;
  for ch in select * from jsonb_array_elements(p_cambios) loop
   if ch->'v' is null or jsonb_typeof(ch->'v')='null' then
    delete from gestlok_chat_private.wai_auth_estado where habilitacion_id=p_id and tipo=ch->>'t' and clave=ch->>'k';
   else
    insert into gestlok_chat_private.wai_auth_estado(habilitacion_id,tipo,clave,valor) values(p_id,ch->>'t',ch->>'k',ch->>'v')
    on conflict(habilitacion_id,tipo,clave) do update set valor=excluded.valor,actualizado_at=clock_timestamp();
   end if;
  end loop;
  -- Las encuestas propias solo sirven unas horas.
  delete from gestlok_chat_private.wai_auth_estado where habilitacion_id=p_id and tipo='poll' and actualizado_at<clock_timestamp()-interval '3 days';
  return jsonb_build_object('ok',true);
 elsif p_accion='borrar' then
  -- QR nuevo: la vinculación anterior deja de existir.
  delete from gestlok_chat_private.wai_auth_estado where habilitacion_id=p_id;
  return jsonb_build_object('ok',true);
 end if;
 return null;
end$$;
revoke all on function public.gestlok_chat_wai_auth(text,uuid,uuid,text,text,text[],jsonb) from public;
grant execute on function public.gestlok_chat_wai_auth(text,uuid,uuid,text,text,text[],jsonb) to anon,authenticated;

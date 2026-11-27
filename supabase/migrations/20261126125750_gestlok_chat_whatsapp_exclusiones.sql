-- GESTLOK Chat: contactos excluidos de respuestas automáticas de WhatsApp.
-- No vincula canales, no envía mensajes, no modifica datos del chat existente.
create or replace function gestlok_chat_private.whatsapp_exclusion_key(p_numero text)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare n text; ar text;
begin
 if p_numero is null or length(p_numero)>40 then return null; end if;
 n:=regexp_replace(btrim(p_numero),'[[:space:]()-]','','g');
 if n !~ '^\+[1-9][0-9]{7,14}$' then return null; end if;
 ar:=substring(n from '^\+54(?:9)?([0-9]{10})$');
 return case when ar is not null then 'AR:'||ar else n end;
end $$;
revoke all on function gestlok_chat_private.whatsapp_exclusion_key(text) from public,anon,authenticated;
revoke all on function gestlok_chat_private.whatsapp_exclusion_key(text) from service_role;

create table if not exists gestlok_chat_private.whatsapp_excluidos(
 id uuid not null default gen_random_uuid() unique,
 tenant_id uuid not null,
 sucursal_id uuid not null,
 numero text not null check(numero ~ '^\+[1-9][0-9]{7,14}$'),
 clave text not null check(clave=gestlok_chat_private.whatsapp_exclusion_key(numero)),
 nombre text not null default '' check(length(nombre)<=60),
 creado_por uuid references auth.users(id) on delete set null,
 creado_at timestamptz not null default now(),
 primary key(sucursal_id,clave),
 foreign key(tenant_id,sucursal_id) references gestlok_chat_private.sucursales(tenant_id,id) on delete restrict
);
alter table gestlok_chat_private.whatsapp_excluidos enable row level security;
revoke all on gestlok_chat_private.whatsapp_excluidos from public,anon,authenticated;
revoke all on gestlok_chat_private.whatsapp_excluidos from service_role;

-- El gerente, dueño y creadora con nivel configurar acceden únicamente a su
-- empresa y sucursal mediante la comprobación existente del servidor.
create or replace function public.gestlok_chat_panel_whatsapp_excluidos(
 p_sucursal uuid,p_accion text default 'ver',p_numero text default null,p_nombre text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_t uuid; k text; n text; etiqueta text; v_id uuid; cambio boolean:=false;
begin
 if auth.uid() is null then raise exception 'Ingresá a GESTLOK' using errcode='42501'; end if;
 perform gestlok_chat_private.exigir(p_sucursal,'gestionar');
 if coalesce(public.mi_rol(),'') not in ('gerente','dueno','creadora') then
  raise exception 'No tenés permiso para administrar números excluidos' using errcode='42501';
 end if;
 if p_accion is null or p_accion not in ('ver','agregar','quitar') then
  raise exception 'Acción inválida' using errcode='22023'; end if;
 if p_accion='ver' then
  select tenant_id into v_t from gestlok_chat_private.sucursales where id=p_sucursal;
 else
  -- Serializa altas/bajas de la misma sucursal, incluidos el máximo y duplicados.
  select tenant_id into v_t from gestlok_chat_private.sucursales where id=p_sucursal for update;
 end if;
 if v_t is null then raise exception 'Sucursal no disponible' using errcode='42501'; end if;
 if p_accion<>'ver' then
  k:=gestlok_chat_private.whatsapp_exclusion_key(p_numero);
  if k is null then raise exception 'Ingresá un número internacional válido, por ejemplo +54 9 11 0000 0000.' using errcode='22023'; end if;
  n:=regexp_replace(btrim(p_numero),'[[:space:]()-]','','g');
  if p_accion='agregar' then
   etiqueta:=btrim(coalesce(p_nombre,''));
   if length(etiqueta)>60 then raise exception 'El identificador debe tener hasta 60 caracteres' using errcode='22023'; end if;
   if not exists(select 1 from gestlok_chat_private.whatsapp_excluidos where tenant_id=v_t and sucursal_id=p_sucursal and clave=k) then
    if (select count(*) from gestlok_chat_private.whatsapp_excluidos where tenant_id=v_t and sucursal_id=p_sucursal)>=500 then
     raise exception 'El local alcanzó el máximo de 500 números excluidos' using errcode='22023'; end if;
    insert into gestlok_chat_private.whatsapp_excluidos(tenant_id,sucursal_id,numero,clave,nombre,creado_por)
      values(v_t,p_sucursal,n,k,etiqueta,auth.uid())
      returning id into v_id;
    cambio:=true;
    perform gestlok_chat_private.auditar(p_sucursal,'whatsapp_exclusion_agregar',jsonb_build_object('id',v_id));
   end if;
  elsif p_accion='quitar' then
   delete from gestlok_chat_private.whatsapp_excluidos where tenant_id=v_t and sucursal_id=p_sucursal and clave=k returning id into v_id;
   cambio:=v_id is not null;
   if cambio then perform gestlok_chat_private.auditar(p_sucursal,'whatsapp_exclusion_quitar',jsonb_build_object('id',v_id)); end if;
  end if;
 end if;
 return jsonb_build_object('cambio',cambio,'numeros',coalesce((
   select jsonb_agg(jsonb_build_object('numero',e.numero,'nombre',e.nombre) order by e.creado_at,e.numero)
   from gestlok_chat_private.whatsapp_excluidos e where e.tenant_id=v_t and e.sucursal_id=p_sucursal
 ),'[]'::jsonb));
end $$;
revoke all on function public.gestlok_chat_panel_whatsapp_excluidos(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_panel_whatsapp_excluidos(uuid,text,text,text) to authenticated;

-- Exclusivamente para el servidor: consulta por remitente verificado, nunca
-- entrega la agenda al cliente público. El bridge falla cerrado si falta el RPC.
create or replace function public.gestlok_chat_srv_whatsapp_excluido(p_sucursal uuid,p_numero text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare k text;
begin
 k:=gestlok_chat_private.whatsapp_exclusion_key(p_numero);
 if p_sucursal is null or k is null then raise exception 'Identidad inválida' using errcode='22023'; end if;
 if not exists(select 1 from gestlok_chat_private.sucursales where id=p_sucursal) then raise exception 'Sucursal no disponible' using errcode='22023'; end if;
 return exists(select 1 from gestlok_chat_private.whatsapp_excluidos where sucursal_id=p_sucursal and clave=k);
end $$;
revoke all on function public.gestlok_chat_srv_whatsapp_excluido(uuid,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_srv_whatsapp_excluido(uuid,text) to service_role;

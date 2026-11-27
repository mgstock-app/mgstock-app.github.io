-- Vinculación oficial de cuentas; habilitación separada del transporte.
create table if not exists gestlok_chat_private.whatsapp_premium_conexiones (
 habilitacion_id uuid primary key references gestlok_chat_private.whatsapp_premium_habilitaciones(id) on delete restrict,
 enlace_vence timestamptz not null,
 waba_id text check(waba_id ~ '^[0-9]{1,30}$'),
 pago_asociado boolean,
 telefono_id text unique check(telefono_id ~ '^[0-9]{1,30}$'),
 telefono_proveedor text check(telefono_proveedor ~ '^\+[1-9][0-9]{7,14}$'),
 verificado_at timestamptz,
 evento_id text unique
);
create table if not exists gestlok_chat_private.whatsapp_premium_eventos (
 evento_id text primary key, habilitacion_id uuid not null references gestlok_chat_private.whatsapp_premium_habilitaciones(id), recibido_at timestamptz not null default now()
);
alter table gestlok_chat_private.whatsapp_premium_eventos enable row level security;
revoke all on gestlok_chat_private.whatsapp_premium_eventos from public,anon,authenticated;
alter table gestlok_chat_private.whatsapp_premium_conexiones enable row level security;
revoke all on gestlok_chat_private.whatsapp_premium_conexiones from public,anon,authenticated;
-- El servidor es el único escritor. No se guardan enlaces, claves ni mensajes.
create or replace function public.gestlok_chat_partner_estado(p_accion text,p_id uuid,
 p_vence timestamptz default null,p_waba text default null,p_pago boolean default null,
 p_evento text default null,p_phone_id text default null,p_phone text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h gestlok_chat_private.whatsapp_premium_habilitaciones%rowtype;
 c gestlok_chat_private.whatsapp_premium_conexiones%rowtype;
begin
 select * into h from gestlok_chat_private.whatsapp_premium_habilitaciones where id=p_id for update;
 if not found or not h.habilitada or not exists(select 1 from public.docs d where d.tenant_id=h.tenant_id and d.col='locales' and d.id=h.local_id) then return null; end if;
 select * into c from gestlok_chat_private.whatsapp_premium_conexiones where habilitacion_id=p_id for update;
 if p_accion='enlace' then
   if c.waba_id is not null or p_vence is null or p_vence<=now() or p_vence>now()+interval '121 minutes' then return null; end if;
   insert into gestlok_chat_private.whatsapp_premium_conexiones(habilitacion_id,enlace_vence) values(p_id,p_vence)
   on conflict(habilitacion_id) do update set enlace_vence=excluded.enlace_vence where whatsapp_premium_conexiones.waba_id is null;
 elsif p_accion='cuenta' then
   if c.habilitacion_id is null or p_waba is null or p_waba !~ '^[0-9]{1,30}$' or p_evento is null or length(p_evento) not between 1 and 200 or p_pago is null then return null; end if;
   if c.waba_id is not null and c.waba_id<>p_waba then return null; end if;
   if c.waba_id is null and c.enlace_vence<now() then return null; end if;
   perform pg_advisory_xact_lock(hashtextextended(p_waba,238));
   if exists(select 1 from gestlok_chat_private.whatsapp_premium_conexiones x join gestlok_chat_private.whatsapp_premium_habilitaciones y on y.id=x.habilitacion_id where x.waba_id=p_waba and y.tenant_id<>h.tenant_id) then return null; end if;
   insert into gestlok_chat_private.whatsapp_premium_eventos(evento_id,habilitacion_id) values(p_evento,p_id) on conflict do nothing;
   if not found then return null; end if;
   update gestlok_chat_private.whatsapp_premium_conexiones set waba_id=p_waba,pago_asociado=p_pago,evento_id=p_evento where habilitacion_id=p_id;
 elsif p_accion='verificar' then
   if c.waba_id is null or c.waba_id is distinct from p_waba or p_phone_id is null or p_phone_id !~ '^[0-9]{1,30}$' or p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' or regexp_replace(p_phone,'^\+549([0-9]{10})$','+54\1')<>h.numero_clave then return null; end if;
   if c.telefono_id is not null and c.telefono_id<>p_phone_id then return null; end if;
   update gestlok_chat_private.whatsapp_premium_conexiones set telefono_id=p_phone_id,telefono_proveedor=p_phone,verificado_at=now() where habilitacion_id=p_id;
 elsif p_accion<>'consultar' then return null;
 end if;
 select * into c from gestlok_chat_private.whatsapp_premium_conexiones where habilitacion_id=p_id;
 return jsonb_build_object('id',h.id,'numero',h.numero,'waba',c.waba_id,'enlace_vence',c.enlace_vence,'verificado_at',c.verificado_at,'pago_asociado',c.pago_asociado);
exception when unique_violation then return null;
end$$;
revoke all on function public.gestlok_chat_partner_estado(text,uuid,timestamptz,text,boolean,text,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_partner_estado(text,uuid,timestamptz,text,boolean,text,text,text) to service_role;
create or replace function public.gestlok_chat_admin_whatsapp_conexiones()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform gestlok_platform.require_admin();
 return coalesce((select jsonb_object_agg(c.habilitacion_id::text,jsonb_build_object(
  'estado',case when not h.habilitada then 'pausado'
   when c.verificado_at is not null then 'numero_verificado'
   when c.waba_id is not null then 'cuenta_autorizada'
   when c.enlace_vence>now() then 'enlace_emitido' else 'enlace_vencido' end,
  'vence',c.enlace_vence,'verificado_at',c.verificado_at,'pago_asociado',c.pago_asociado))
  from gestlok_chat_private.whatsapp_premium_conexiones c join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=c.habilitacion_id),'{}'::jsonb);
end$$;
revoke all on function public.gestlok_chat_admin_whatsapp_conexiones() from public,anon,authenticated;
grant execute on function public.gestlok_chat_admin_whatsapp_conexiones() to authenticated;

-- Habilitación comercial de WhatsApp Premium: independiente de Meta y del chat web.
-- No conecta cuentas, no envía mensajes, no contiene claves y no activa cargos.
create table if not exists gestlok_chat_private.whatsapp_premium_habilitaciones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references gestlok_tenancy.tenants(id) on delete restrict,
  local_id text not null check (length(local_id) between 1 and 200),
  numero text not null check (numero ~ '^\+[1-9][0-9]{7,14}$'),
  -- En Argentina la variante móvil +549 y la variante +54 representan la misma línea.
  numero_clave text generated always as (regexp_replace(numero, '^\+549([0-9]{10})$', '+54\1')) stored unique,
  habilitada boolean not null default true,
  creada_at timestamptz not null default now(),
  creada_por uuid not null,
  actualizada_at timestamptz not null default now(),
  actualizada_por uuid not null
);
create index if not exists whatsapp_premium_local_idx on gestlok_chat_private.whatsapp_premium_habilitaciones (tenant_id, local_id);
alter table gestlok_chat_private.whatsapp_premium_habilitaciones enable row level security;
revoke all on gestlok_chat_private.whatsapp_premium_habilitaciones from public, anon, authenticated;

create or replace function public.gestlok_chat_admin_whatsapp_premium(
  p_accion text default 'listar', p_tenant uuid default null, p_local text default null,
  p_numeros text[] default null, p_id uuid default null, p_habilitada boolean default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := gestlok_platform.require_admin();
  v_raw text;
  v_num text;
  v_row gestlok_chat_private.whatsapp_premium_habilitaciones%rowtype;
begin
  -- Esta RPC es la única vía de configuración: ni gerente ni dueño pueden habilitar Premium.
  if p_accion = 'agregar' then
    if not exists (select 1 from public.docs d where d.tenant_id=p_tenant and d.col='locales' and d.id=p_local) then
      raise exception 'Seleccioná un local existente de esa empresa.' using errcode='22023';
    end if;
    if coalesce(cardinality(p_numeros),0) not between 1 and 50 then
      raise exception 'Ingresá entre 1 y 50 números por operación.' using errcode='22023';
    end if;
    foreach v_raw in array p_numeros loop
      if v_raw is null or length(v_raw)>60 or v_raw !~ '^[+0-9 ()-]+$' then
        raise exception 'Número inválido. Incluí el código de país con +.' using errcode='22023';
      end if;
      v_num := regexp_replace(v_raw, '[ ()-]', '', 'g');
      if v_num !~ '^\+[1-9][0-9]{7,14}$' or (v_num like '+54%' and v_num !~ '^\+54(9)?[0-9]{10}$') then
        raise exception 'Número inválido. Usá formato internacional, por ejemplo +54 9 11…' using errcode='22023';
      end if;
      insert into gestlok_chat_private.whatsapp_premium_habilitaciones(tenant_id,local_id,numero,creada_por,actualizada_por)
        values(p_tenant,p_local,v_num,v_admin,v_admin)
        on conflict(numero_clave) do nothing;
      if not found then
        raise exception 'Uno de los números ya está registrado. Revisá el listado antes de volver a cargar.' using errcode='23505';
      end if;
    end loop;
  elsif p_accion = 'estado' then
    if p_id is null or p_habilitada is null then raise exception 'Estado inválido.' using errcode='22023'; end if;
    select * into v_row from gestlok_chat_private.whatsapp_premium_habilitaciones where id=p_id for update;
    if not found then raise exception 'Habilitación inexistente.' using errcode='P0002'; end if;
    if p_habilitada and not exists (select 1 from public.docs d where d.tenant_id=v_row.tenant_id and d.col='locales' and d.id=v_row.local_id) then
      raise exception 'El local ya no existe. No se puede reactivar.' using errcode='22023';
    end if;
    update gestlok_chat_private.whatsapp_premium_habilitaciones
      set habilitada=p_habilitada,actualizada_at=now(),actualizada_por=v_admin where id=p_id;
  elsif p_accion is distinct from 'listar' then
    raise exception 'Acción inválida.' using errcode='22023';
  end if;
  return jsonb_build_object(
    'locales', coalesce((select jsonb_agg(jsonb_build_object(
      'tenant_id',d.tenant_id,'local_id',d.id,
      'empresa',coalesce(e.nombre_publico,t.code),'nombre',coalesce(nullif(btrim(d.data->>'nombre'),''),d.id)
    ) order by coalesce(e.nombre_publico,t.code),d.data->>'nombre',d.id)
      from public.docs d join gestlok_tenancy.tenants t on t.id=d.tenant_id
      left join gestlok_chat_private.empresas e on e.tenant_id=d.tenant_id where d.col='locales'),'[]'::jsonb),
    'numeros',coalesce((select jsonb_agg(jsonb_build_object(
      'id',h.id,'tenant_id',h.tenant_id,'local_id',h.local_id,'numero',h.numero,'habilitada',h.habilitada,
      'local_existe',d.id is not null,'nombre',coalesce(nullif(btrim(d.data->>'nombre'),''),h.local_id),
      'empresa',coalesce(e.nombre_publico,t.code),'actualizada_at',h.actualizada_at
    ) order by coalesce(e.nombre_publico,t.code),h.local_id,h.numero)
      from gestlok_chat_private.whatsapp_premium_habilitaciones h
      join gestlok_tenancy.tenants t on t.id=h.tenant_id
      left join public.docs d on d.tenant_id=h.tenant_id and d.col='locales' and d.id=h.local_id
      left join gestlok_chat_private.empresas e on e.tenant_id=h.tenant_id),'[]'::jsonb),
    'conexion_meta','pendiente'
  );
end $$;
revoke all on function public.gestlok_chat_admin_whatsapp_premium(text,uuid,text,text[],uuid,boolean) from public,anon,authenticated;
grant execute on function public.gestlok_chat_admin_whatsapp_premium(text,uuid,text,text[],uuid,boolean) to authenticated;

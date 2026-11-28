-- Cuota WAI por responsable comercial. Privada; no inicia cobros ni modifica
-- suscripciones de otros módulos. Una pausa explícita conserva sesiones e historial.
create table if not exists gestlok_chat_private.wai_cuotas_duenos(
 tenant_id uuid not null references gestlok_tenancy.tenants(id),
 equipo_id text not null,
 estado text not null check(estado in ('al_dia','impago','exento')),
 hasta date,
 actualizado_at timestamptz not null default now(),
 actualizado_por uuid not null,
 primary key(tenant_id,equipo_id),
 check((estado='al_dia' and hasta is not null) or (estado<>'al_dia' and hasta is null))
);
alter table gestlok_chat_private.wai_cuotas_duenos enable row level security;
revoke all on gestlok_chat_private.wai_cuotas_duenos from public,anon,authenticated;

-- Misma resolución que el panel: responsable explícito válido, o único dueño
-- autorizado. Nunca se atribuye un local compartido a un dueño arbitrario.
create or replace function gestlok_chat_private.wai_responsable_efectivo(p_tenant uuid,p_local text)
returns text language sql stable set search_path='' as $$
 select coalesce(
 (select r.equipo_id from gestlok_chat_private.wai_responsables r join public.docs d
 on d.tenant_id=r.tenant_id and d.col='equipo' and d.id=r.equipo_id and d.data->>'rol'='dueno'
 where r.tenant_id=p_tenant and r.local_id=p_local and (coalesce(d.data->'locales','[]'::jsonb)='[]'::jsonb or d.data->'locales' ? p_local)),
 (select case when count(*)=1 then min(d.id) end from public.docs d where d.tenant_id=p_tenant and d.col='equipo' and d.data->>'rol'='dueno'
 and (coalesce(d.data->'locales','[]'::jsonb)='[]'::jsonb or d.data->'locales' ? p_local)))
$$;
revoke all on function gestlok_chat_private.wai_responsable_efectivo(uuid,text) from public,anon,authenticated;

create or replace function public.gestlok_chat_wai_admin_cuotas(p_accion text default 'listar',p_tenant uuid default null,p_owner text default null,p_hasta date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; x record; hoy date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
 if auth.uid() is null or not gestlok_chat_private.es_creadora_chat() then raise exception 'Solo administradora' using errcode='42501'; end if;
 u=gestlok_platform.require_admin();
 if p_accion in ('al_dia','impago','exento') then
  if not exists(select 1 from public.docs where tenant_id=p_tenant and col='equipo' and id=p_owner and data->>'rol'='dueno') then raise exception 'Dueño inexistente en la empresa' using errcode='42501';end if;
  if p_accion='al_dia' and (p_hasta is null or p_hasta<hoy) then raise exception 'Ingresá una fecha de cobertura vigente' using errcode='22023';end if;
  if p_accion='impago' then
   -- Solo sus locales asignados. No se tocan otros dueños, números, historial
   -- ni datos comerciales. No se revocan las credenciales cifradas.
   for x in select s.local_id,c.rubro from gestlok_chat_private.sucursales s
    join gestlok_chat_private.wai_comercios c on c.sucursal_id=s.id and c.activo
    where s.tenant_id=p_tenant and gestlok_chat_private.wai_responsable_efectivo(s.tenant_id,s.local_id)=p_owner
   loop
    perform public.gestlok_chat_wai_admin_comercial('local',p_tenant,x.local_id,null,null,false,x.rubro);
   end loop;
  end if;
  insert into gestlok_chat_private.wai_cuotas_duenos(tenant_id,equipo_id,estado,hasta,actualizado_por)
  values(p_tenant,p_owner,p_accion,case when p_accion='al_dia' then p_hasta end,u)
  on conflict(tenant_id,equipo_id) do update set estado=excluded.estado,hasta=excluded.hasta,actualizado_por=u,actualizado_at=now();
 elsif p_accion is distinct from 'listar' then raise exception 'Acción inválida' using errcode='22023';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('tenant',d.tenant_id,'owner',d.id,
 'estado',case when c.estado='al_dia' and c.hasta<hoy then 'vencida' when c.estado is not null then c.estado when s.requiere_cobro=false then 'exento' else 'sin_registrar' end,
 'hasta',c.hasta,'actualizado_at',c.actualizado_at))
 from public.docs d left join gestlok_chat_private.wai_cuotas_duenos c on c.tenant_id=d.tenant_id and c.equipo_id=d.id
 left join gestlok_chat_private.suscripciones s on s.tenant_id=d.tenant_id
 where d.col='equipo' and d.data->>'rol'='dueno'),'[]'::jsonb);
end$$;
revoke all on function public.gestlok_chat_wai_admin_cuotas(text,uuid,text,date) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_admin_cuotas(text,uuid,text,date) to authenticated;

-- Evita reactivar por error un local cuyo responsable fue marcado impago,
-- incluso desde el panel anterior. No cambia la habilitación de ningún local
-- preexistente ni bloquea cuentas sin cuotas registradas.
create or replace function gestlok_chat_private.wai_validar_cuota_activacion()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.activo and exists(select 1 from gestlok_chat_private.sucursales s
 join gestlok_chat_private.wai_cuotas_duenos c on c.tenant_id=s.tenant_id
 and c.equipo_id=gestlok_chat_private.wai_responsable_efectivo(s.tenant_id,s.local_id)
 where s.id=new.sucursal_id and c.estado='impago') then
  raise exception 'Registrá el pago del responsable antes de activar WAI' using errcode='22023';
 end if;
 return new;
end$$;
revoke all on function gestlok_chat_private.wai_validar_cuota_activacion() from public,anon,authenticated;
create or replace trigger wai_validar_cuota_activacion before insert or update of activo on gestlok_chat_private.wai_comercios
for each row execute function gestlok_chat_private.wai_validar_cuota_activacion();

-- También protege las reasignaciones de responsabilidad desde el panel anterior.
create or replace function gestlok_chat_private.wai_validar_cuota_responsable()
returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from gestlok_chat_private.wai_cuotas_duenos q
 join gestlok_chat_private.sucursales s on s.tenant_id=q.tenant_id and s.local_id=new.local_id
 join gestlok_chat_private.wai_comercios c on c.sucursal_id=s.id and c.activo
 where q.tenant_id=new.tenant_id and q.equipo_id=new.equipo_id and q.estado='impago') then
  raise exception 'Pausá el local antes de asignar un responsable con cuota impaga' using errcode='22023';
 end if;
 return new;
end$$;
revoke all on function gestlok_chat_private.wai_validar_cuota_responsable() from public,anon,authenticated;
create or replace trigger wai_validar_cuota_responsable before insert or update of equipo_id on gestlok_chat_private.wai_responsables
for each row execute function gestlok_chat_private.wai_validar_cuota_responsable();

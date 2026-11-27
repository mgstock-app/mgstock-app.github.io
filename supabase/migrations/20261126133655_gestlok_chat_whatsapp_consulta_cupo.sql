-- GESTLOK Chat: panel seguro de consulta de límite; exclusivamente datos de ensayo.
-- Sin aprobación de gastos ni envío. El registro lo alimenta una operación de Pruebas separada.
create table if not exists gestlok_chat_private.whatsapp_cupo_ensayo(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 sucursal_id uuid not null,
 sender_key text not null check(sender_key ~ '^[0-9a-f]{64}$'),
 periodo_inicio timestamptz not null,
 periodo_fin timestamptz not null check(periodo_fin>periodo_inicio),
 restantes integer not null check(restantes between 0 and 900),
 pausado boolean not null default false,
 decision text not null default 'pendiente' check(decision in ('pendiente','continuar','mantener_pausa')),
 decidido_por uuid references auth.users(id),
 decidido_at timestamptz,
 actualizado_at timestamptz not null default now(),
 unique(sucursal_id,periodo_inicio),
 unique(sender_key,periodo_inicio),
 foreign key(tenant_id,sucursal_id) references gestlok_chat_private.sucursales(tenant_id,id) on delete restrict,
 check(decision='pendiente' or pausado)
);
alter table gestlok_chat_private.whatsapp_cupo_ensayo enable row level security;
revoke all on gestlok_chat_private.whatsapp_cupo_ensayo from public,anon,authenticated,service_role;

-- Gerente: consulta de su sucursal. Dueño/creadora autorizada: decisión
-- explícita de solicitar continuar o mantener pausa. NO es aprobación de gasto.
create or replace function public.gestlok_chat_panel_whatsapp_cupo(
 p_sucursal uuid,p_accion text default 'ver',p_consulta uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a gestlok_chat_private.whatsapp_cupo_ensayo; puede_decidir boolean; estado text;
begin
 if auth.uid() is null then raise exception 'Ingresá a GESTLOK' using errcode='42501'; end if;
 perform gestlok_chat_private.exigir(p_sucursal,'configurar');
 puede_decidir:=coalesce(public.mi_rol(),'') in ('dueno','creadora');
 if p_accion is null or p_accion not in ('ver','continuar','mantener_pausa') then
  raise exception 'Acción inválida' using errcode='22023'; end if;
 if p_accion='ver' then
  select * into a from gestlok_chat_private.whatsapp_cupo_ensayo
   where sucursal_id=p_sucursal and periodo_inicio<=now() and periodo_fin>now() order by periodo_inicio desc limit 1;
 else
  if not puede_decidir then raise exception 'Solo la dueña o la administradora pueden decidir' using errcode='42501'; end if;
  select * into a from gestlok_chat_private.whatsapp_cupo_ensayo
   where sucursal_id=p_sucursal and id=p_consulta and periodo_inicio<=now() and periodo_fin>now() for update;
  if a.id is null or not a.pausado then raise exception 'La consulta ya no está vigente' using errcode='22023'; end if;
  if a.decision<>p_accion then
   update gestlok_chat_private.whatsapp_cupo_ensayo set decision=p_accion,decidido_por=auth.uid(),decidido_at=now()
    where id=a.id returning * into a;
   perform gestlok_chat_private.auditar(p_sucursal,'whatsapp_cupo_decision',jsonb_build_object('id',a.id,'decision',p_accion,'simulado',true));
  end if;
 end if;
 if a.id is null then return jsonb_build_object('estado','sin_datos','simulado',true,'envio_habilitado',false,'puede_decidir',false); end if;
 estado:=case when a.pausado then case a.decision when 'continuar' then 'continuacion_solicitada'
    when 'mantener_pausa' then 'pausa_confirmada' else 'consulta' end
   when a.restantes<=100 then 'cerca_del_limite' else 'normal' end;
 return jsonb_build_object('estado',estado,'consulta_id',a.id,'restantes_preventivos',a.restantes,
  'limite_gratuito',1000,'limite_preventivo',900,'periodo_fin',a.periodo_fin,
  'simulado',true,'envio_habilitado',false,'puede_decidir',puede_decidir and a.pausado);
end $$;
revoke all on function public.gestlok_chat_panel_whatsapp_cupo(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.gestlok_chat_panel_whatsapp_cupo(uuid,text,uuid) to authenticated;

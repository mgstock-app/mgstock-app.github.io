-- GESTLOK Chat · avisos de pedidos reales para dueños y gerentes autorizados.
-- No se modifica ni borra ningún pedido, documento ni suscripción existente.
alter table public.gestlok_push_preferences
  add column if not exists chat_order boolean not null default true;

-- Solo el despachador service_role consulta este permiso. No se expone al cliente.
create or replace function public.gestlok_chat_push_can_receive(
 p_user uuid,p_tenant uuid,p_local text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_user is not null and p_tenant is not null and p_local is not null and exists(
  select 1 from gestlok_chat_private.sucursales s
  join gestlok_chat_private.empresas ce on ce.tenant_id=s.tenant_id and ce.habilitada
  join public.docs l on l.tenant_id=s.tenant_id and l.col='locales' and l.id=s.local_id
  join public.docs e on e.tenant_id=s.tenant_id and e.col='equipo'
  join auth.users u on u.id=p_user and lower(u.email)=lower(e.data->>'email')
  where s.tenant_id=p_tenant and s.local_id=p_local and s.activa and
   (e.data->>'rol'='dueno' or
     (e.data->>'rol'='gerente' and coalesce(e.data->'locales','[]'::jsonb) ? p_local))
 );
$$;
revoke all on function public.gestlok_chat_push_can_receive(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_push_can_receive(uuid,uuid,text) to service_role;

-- Se encola exclusivamente cuando se confirma en base la creación de un pedido real.
-- El contenido push evita teléfonos, direcciones y nombres de clientes en pantalla bloqueada.
create or replace function gestlok_chat_private.encolar_push_nuevo_pedido()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_local text;v_nombre text;v_primero text;
begin
 if new.estado<>'pendiente' or coalesce(new.es_prueba,false) then return new; end if;
 select s.local_id,s.nombre into v_local,v_nombre
   from gestlok_chat_private.sucursales s
   join gestlok_chat_private.empresas ce on ce.tenant_id=s.tenant_id and ce.habilitada
  where s.id=new.sucursal_id and s.tenant_id=new.tenant_id and s.activa;
 if v_local is null then return new; end if;
 select coalesce(left(x->>'nombre',50),'') into v_primero
   from jsonb_array_elements(new.items) x limit 1;
 insert into public.gestlok_push_events(
   tenant_id,local_id,event_key,title,body,category,path,scheduled_at)
 values(new.tenant_id,v_local,'gestlok-chat-order:'||new.id::text,
   'Pedido nuevo · '||left(v_nombre,65),
   left(new.codigo,30)||' · '||
     (case when new.entrega='envio' then 'Delivery' else 'Retiro' end)||
     ' · $ '||trim(to_char(new.total,'FM999,999,990.00'))||
     (case when v_primero<>'' then ' · '||v_primero else '' end),
   'chat_order','pedidos-clientes',now())
 on conflict(event_key) do nothing;
 return new;
end;
$$;
revoke all on function gestlok_chat_private.encolar_push_nuevo_pedido() from public,anon,authenticated;
drop trigger if exists gestlok_chat_push_nuevo_pedido on gestlok_chat_private.pedidos;
create trigger gestlok_chat_push_nuevo_pedido
 after insert on gestlok_chat_private.pedidos
 for each row execute function gestlok_chat_private.encolar_push_nuevo_pedido();

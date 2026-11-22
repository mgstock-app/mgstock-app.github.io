-- Seguridad: Scanner nunca se habilita para un correo no confirmado.
-- Mantiene el login intacto y solo actúa sobre microapps asignadas expresamente.
create or replace function public.gestlok_creator_asignar_microapp(
 p_tenant uuid,p_app text,p_habilitar boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_admin uuid; v_owner_email text; v_owner_uid uuid; v_name text;
 v_actual uuid; v_estado text;
begin
 v_admin:=gestlok_platform.exigir_creadora_microapps();
 if p_habilitar is null then raise exception 'Elegí habilitar o deshabilitar' using errcode='22023'; end if;
 if p_app not in ('gestlok_chat','sistema_ventas') then
   raise exception 'Microapp no habilitada para asignación' using errcode='22023'; end if;
 select c.name,c.owner_email into v_name,v_owner_email
 from gestlok_platform.companies c where c.tenant_id=p_tenant;
 if v_name is null then raise exception 'Empresa no registrada' using errcode='22023'; end if;
 if p_app='gestlok_chat' then
   if p_habilitar then
     perform public.gestlok_chat_admin_habilitar(p_tenant,left(v_name,80),null);
   elsif exists(select 1 from gestlok_chat_private.empresas where tenant_id=p_tenant) then
     perform public.gestlok_chat_admin_estado(p_tenant,false);
   end if;
   v_estado:=case when p_habilitar then 'activa' else 'desactivada' end;
 else
   select u.id into v_owner_uid from auth.users u where lower(u.email)=lower(v_owner_email) and u.email_confirmed_at is not null;
   if p_habilitar and v_owner_uid is not null then
     if not exists(select 1 from public.docs d where d.tenant_id=p_tenant and d.col='equipo'
         and lower(d.data->>'email')=lower(v_owner_email) and d.data->>'rol'='dueno') then
       raise exception 'Dueño no vinculado con esta empresa' using errcode='42501';
     end if;
     select p.owner_uid into v_actual from public.gestlok_pilot_access p where p.tenant_id=p_tenant;
     if v_actual is not null and v_actual<>v_owner_uid then
       raise exception 'El Plan Scanner pertenece a otro usuario: revisar antes de activar' using errcode='42501';end if;
     insert into public.gestlok_pilot_access(tenant_id,owner_uid,enabled,plan_code)
      values(p_tenant,v_owner_uid,true,'scanner')
      on conflict(tenant_id) do update set enabled=true
      where public.gestlok_pilot_access.owner_uid=excluded.owner_uid;
   elsif not p_habilitar then
     update public.gestlok_pilot_access set enabled=false where tenant_id=p_tenant;
   end if;
   v_estado:=case when not p_habilitar then 'desactivada'
     when v_owner_uid is null then 'esperando_dueno' else 'activa' end;
 end if;
 insert into gestlok_platform.company_microapps(tenant_id,app_code,enabled,assigned_by)
 values(p_tenant,p_app,p_habilitar,v_admin)
 on conflict(tenant_id,app_code) do update set
 enabled=excluded.enabled,assigned_by=excluded.assigned_by,updated_at=now();
 insert into gestlok_platform.admin_audit(actor,action,tenant_id,detail)
 values(v_admin,'microapp_asignada',p_tenant,
 jsonb_build_object('app',p_app,'habilitada',p_habilitar,'estado',v_estado));
 return jsonb_build_object('ok',true,'tenant_id',p_tenant,
   'app_code',p_app,'habilitada',p_habilitar,'estado',v_estado);
end $$;

create or replace function public.gestlok_microapps_activar_dueno()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid:=auth.uid(); v_email text; v_empresa record; v_actual uuid;
 v_count integer:=0;
begin
 if v_id is null then raise exception 'Sesión requerida' using errcode='42501'; end if;
 perform gestlok_platform.registration_email();
 select lower(u.email) into v_email from auth.users u where u.id=v_id;
 if v_email is null then raise exception 'Email de sesión no encontrado' using errcode='42501'; end if;
 for v_empresa in
   select c.tenant_id from gestlok_platform.companies c
   join gestlok_platform.company_microapps m on m.tenant_id=c.tenant_id
     and m.app_code='sistema_ventas' and m.enabled
   where lower(c.owner_email)=v_email
   and exists(select 1 from public.docs d where d.tenant_id=c.tenant_id and d.col='equipo'
      and d.data->>'rol'='dueno' and lower(d.data->>'email')=v_email)
 loop
   select p.owner_uid into v_actual from public.gestlok_pilot_access p
     where p.tenant_id=v_empresa.tenant_id;
   if v_actual is not null and v_actual<>v_id then continue; end if;
   insert into public.gestlok_pilot_access(tenant_id,owner_uid,enabled,plan_code)
   values(v_empresa.tenant_id,v_id,true,'scanner')
   on conflict(tenant_id) do update set enabled=true
      where public.gestlok_pilot_access.owner_uid=excluded.owner_uid;
   v_count:=v_count+1;
 end loop;
 return jsonb_build_object('ok',true,'activadas',v_count);
end $$;

-- La activación de Scanner se resuelve al registrarse el dueño, sin modificar
-- el inicio de sesión de GESTLOK ni conceder accesos por datos del navegador.
-- La asignación ya debe existir, estar habilitada, y coincidir con el email
-- que la creadora asignó al dueño de ESA empresa.
create or replace function gestlok_platform.activar_scanner_dueno_al_registrarse()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_empresa record;
begin
 if new.id is null or new.email is null or new.email_confirmed_at is null then return new; end if;
 for v_empresa in
   select c.tenant_id
     from gestlok_platform.companies c
     join gestlok_platform.company_microapps m
       on m.tenant_id=c.tenant_id and m.app_code='sistema_ventas' and m.enabled
    where lower(c.owner_email)=lower(new.email)
      and exists(select 1 from public.docs d
       where d.tenant_id=c.tenant_id and d.col='equipo'
         and d.data->>'rol'='dueno'
         and lower(d.data->>'email')=lower(new.email))
 loop
   insert into public.gestlok_pilot_access(tenant_id,owner_uid,enabled,plan_code)
   values(v_empresa.tenant_id,new.id,true,'scanner')
   on conflict(tenant_id) do update set enabled=true
     where public.gestlok_pilot_access.owner_uid=excluded.owner_uid;
 end loop;
 return new;
end $$;
revoke all on function gestlok_platform.activar_scanner_dueno_al_registrarse()
  from public,anon,authenticated;
drop trigger if exists gestlok_scanner_dueno_registro on auth.users;
create trigger gestlok_scanner_dueno_registro
after insert or update of email_confirmed_at on auth.users for each row
execute function gestlok_platform.activar_scanner_dueno_al_registrarse();


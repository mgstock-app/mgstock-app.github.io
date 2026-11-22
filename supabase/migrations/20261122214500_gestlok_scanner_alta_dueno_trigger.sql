-- La activación de Scanner se resuelve al registrarse el dueño, sin modificar
-- el inicio de sesión de GESTLOK ni conceder accesos por datos del navegador.
-- La asignación ya debe existir, estar habilitada, y coincidir con el email
-- que la creadora asignó al dueño de ESA empresa.
create or replace function gestlok_platform.activar_scanner_dueno_al_registrarse()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_empresa record;
begin
 if new.id is null or new.email is null then return new; end if;
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
after insert on auth.users for each row
execute function gestlok_platform.activar_scanner_dueno_al_registrarse();

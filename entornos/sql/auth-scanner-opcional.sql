-- Solo base aislada de Chat/WAI. Scanner no forma parte de este entorno.
-- Si se instaló el trigger de Scanner, no debe bloquear la verificación Auth
-- cuando su módulo (tablas companies y pilot_access) no está disponible.
do $guard$
begin
  if to_regprocedure('gestlok_platform.activar_scanner_dueno_al_registrarse()') is not null then
    execute $ddl$
      create or replace function gestlok_platform.activar_scanner_dueno_al_registrarse()
      returns trigger language plpgsql security definer set search_path='' as $fn$
      declare v_empresa record;
      begin
        if new.id is null or new.email is null or new.email_confirmed_at is null then return new; end if;
        if to_regclass('gestlok_platform.companies') is null
          or to_regclass('gestlok_platform.company_microapps') is null
          or to_regclass('public.gestlok_pilot_access') is null then
          return new;
        end if;
        for v_empresa in
          select c.tenant_id from gestlok_platform.companies c
          join gestlok_platform.company_microapps m on m.tenant_id=c.tenant_id and m.app_code='sistema_ventas' and m.enabled
          where lower(c.owner_email)=lower(new.email)
            and exists(select 1 from public.docs d where d.tenant_id=c.tenant_id and d.col='equipo'
              and d.data->>'rol'='dueno' and lower(d.data->>'email')=lower(new.email))
        loop
          insert into public.gestlok_pilot_access(tenant_id,owner_uid,enabled,plan_code)
          values(v_empresa.tenant_id,new.id,true,'scanner')
          on conflict(tenant_id) do update set enabled=true
            where public.gestlok_pilot_access.owner_uid=excluded.owner_uid;
        end loop;
        return new;
      end $fn$
    $ddl$;
    revoke all on function gestlok_platform.activar_scanner_dueno_al_registrarse() from public,anon,authenticated;
  end if;
end $guard$;

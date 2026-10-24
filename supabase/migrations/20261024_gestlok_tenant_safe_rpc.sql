-- Prevent company bypass through SECURITY DEFINER import and signup RPCs.
alter function public.importar_mercaderia(text,text,jsonb,jsonb,text,boolean) rename to importar_mercaderia_internal;
revoke all on function public.importar_mercaderia_internal(text,text,jsonb,jsonb,text,boolean) from public,anon,authenticated;

create function public.importar_mercaderia(
 p_local text,p_operacion text,p_items jsonb,p_archivo jsonb,p_clave text,p_forzar boolean default false
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_tenant uuid := gestlok_tenancy.current_tenant_id();
begin
 if (select auth.uid()) is null or v_tenant is null
 or public.mi_rol() not in ('creadora','dueno')
 then raise exception 'MGS:sin_permiso' using errcode='42501'; end if;
 if not exists(select 1 from public.docs where col='locales' and id=p_local and tenant_id=v_tenant)
 then raise exception 'MGS:sucursal' using errcode='42501'; end if;
 if exists(select 1 from public.docs where col='importaciones' and id=p_clave and tenant_id<>v_tenant)
 then raise exception 'MGS:clave' using errcode='42501'; end if;
 return public.importar_mercaderia_internal(p_local,p_operacion,p_items,p_archivo,p_clave,p_forzar);
end $$;
revoke all on function public.importar_mercaderia(text,text,jsonb,jsonb,text,boolean) from public,anon;
grant execute on function public.importar_mercaderia(text,text,jsonb,jsonb,text,boolean) to authenticated,service_role;

-- Preserve legacy pending approval without giving a guest access to a tenant.
create or replace function public.pedir_acceso(p_nombre text default null,p_proveedor text default null)
returns text language plpgsql security definer set search_path=''
as $$
declare
 v_email text := lower(coalesce((select auth.jwt()->>'email'),''));
 v_rol text; v_ahora bigint := (extract(epoch from now())*1000)::bigint;
 v_tenant uuid;
begin
 if (select auth.uid()) is null or v_email='' then return null; end if;
 v_rol:=public.mi_rol();
 if v_rol is not null then return v_rol; end if;
 select id into v_tenant from gestlok_tenancy.tenants where code='gestlok-original';
 insert into public.docs(col,id,data,tenant_id,updated_by)
 values('solicitudes',v_email,jsonb_build_object(
 'email',v_email,'nombre',coalesce(p_nombre,''),'proveedor',coalesce(p_proveedor,''),'fecha',v_ahora),
 v_tenant,v_email)
 on conflict(col,id) do update
 set data=public.docs.data||jsonb_build_object('nombre',coalesce(p_nombre,''),'ultimo',v_ahora),
 updated_at=now()
 where public.docs.tenant_id=excluded.tenant_id;
 return 'pendiente';
end $$;
notify pgrst, 'reload schema';

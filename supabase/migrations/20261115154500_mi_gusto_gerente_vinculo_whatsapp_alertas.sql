-- Mi Gusto: dueño, creadora y gerente autorizado de la sucursal pueden vincular
-- avisos del WhatsApp Business de SU local. No se concede acceso a otro local,
-- a la API antigua de Meta, a la edición del número ni a pedidos.
create or replace function public.gestlok_mg_android_bridge_create(p_local text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_token text;
begin
 if p_local not in ('munro','torcuato')
    or not coalesce(gestlok_mg_orders_private.allowed(p_local),false)
    or public.mi_rol() not in ('dueno','creadora','gerente')
 then
  raise exception 'Sin permiso para conectar WhatsApp de esta sucursal' using errcode='42501';
 end if;

 v_token := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into gestlok_mg_orders_private.android_bridge_keys
 (local,token_hash,created_by,created_at,enabled)
 values (p_local,encode(sha256(convert_to(v_token,'UTF8')),'hex'),auth.uid(),now(),true)
 on conflict (local) do update
 set token_hash=excluded.token_hash,
     created_by=excluded.created_by,
     created_at=excluded.created_at,
     enabled=true;

 return jsonb_build_object('ok',true,'local',p_local,'token',v_token);
end $$;

revoke all on function public.gestlok_mg_android_bridge_create(text)
 from public,anon,authenticated;
grant execute on function public.gestlok_mg_android_bridge_create(text) to authenticated;

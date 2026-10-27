-- Pedido de la creadora: edición permanente para la administradora registrada y verificada.
-- No cambia roles, datos ni permisos de dueños/gerentes. Conserva auditoría y aislamiento.
create or replace function gestlok_platform.creator_write_active()
returns boolean language sql stable security definer set search_path=''
as $$select exists(select 1 from gestlok_platform.admins a join auth.users u on u.id=a.user_id
 where a.user_id=auth.uid() and u.email_confirmed_at is not null
 and lower(u.email)=lower(coalesce(auth.jwt()->>'email','')))$$;
revoke all on function gestlok_platform.creator_write_active() from public,anon,authenticated;
create or replace function public.gestlok_creator_editing_state()
returns jsonb language plpgsql stable security definer set search_path=''
as $$begin
 perform gestlok_platform.require_admin();
 return jsonb_build_object('active',true,'permanent',true,'expires_at',null);
end$$;
-- Compatibilidad con versiones anteriores: ninguna llamada vuelve a limitar la edición.
create or replace function public.gestlok_creator_enable_editing(p_minutes integer,p_reason text)
returns jsonb language sql security definer set search_path=''
as $$select public.gestlok_creator_editing_state()$$;
create or replace function public.gestlok_creator_disable_editing()
returns jsonb language sql security definer set search_path=''
as $$select public.gestlok_creator_editing_state()$$;

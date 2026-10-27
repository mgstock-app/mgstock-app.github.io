-- Reseñas · Mi Gusto: registrar clientes cualquier día y modificar cupones pendientes.
-- - El cupón se USA del 1 al 12. Registrado hasta el 12, vale ese mes; registrado después
--   del 12, vale del 1 al 12 del mes siguiente (antes la emisión solo se permitía del 1 al 12).
-- - Nuevo RPC gestlok_resenas_update: corrige nombre y teléfono de un cupón pendiente de la
--   misma sucursal (el código no cambia; usados y vencidos no se modifican). Queda auditado.
-- No modifica cupones existentes.

alter table gestlok_resenas_private.events drop constraint if exists events_action_check;
alter table gestlok_resenas_private.events add constraint events_action_check check(action in ('created','used','updated'));

-- Período de validez para un día dado: este mes si es del 1 al 12, si no el mes siguiente.
create or replace function gestlok_resenas_private.period_for(d date) returns date
language sql immutable set search_path='' as $$
 select case when extract(day from d)<=12 then date_trunc('month',d)::date
   else (date_trunc('month',d)+interval '1 month')::date end
$$;

create or replace function gestlok_resenas_private.payload(c gestlok_resenas_private.coupons) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'local',c.local,'customer_name',c.customer_name,'phone',c.phone,'code',c.code,
 'period',c.period,'discount',c.discount,'created_at',c.created_at,'used_at',c.used_at,
 'valid_from',c.period,
 'expires_at',((c.period+12)::timestamp at time zone 'America/Argentina/Buenos_Aires'),
 'usable',c.used_at is null and gestlok_resenas_private.today_ar()>=c.period and gestlok_resenas_private.today_ar()<c.period+12,
 'status',case when c.used_at is not null then 'used'
   when gestlok_resenas_private.today_ar()>=c.period+12 then 'expired' else 'pending' end)
$$;

create or replace function public.gestlok_resenas_create(p_local text,p_name text,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c gestlok_resenas_private.coupons; p text; per date:=gestlok_resenas_private.period_for(gestlok_resenas_private.today_ar());
begin
 if not gestlok_resenas_private.authorized(p_local) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 p:=gestlok_resenas_private.phone(p_phone);
 if p_name is null or length(btrim(p_name)) not between 2 and 100 then raise exception 'Nombre inválido' using errcode='22023'; end if;
 for attempt in 1..32 loop
  begin
   insert into gestlok_resenas_private.coupons(local,customer_name,phone,code,period,created_by)
   values(p_local,btrim(p_name),p,gestlok_resenas_private.new_code(),per,auth.uid()) returning * into c;
   insert into gestlok_resenas_private.events(coupon_id,action,actor) values(c.id,'created',auth.uid());
   return gestlok_resenas_private.payload(c);
  exception when unique_violation then
   if exists(select 1 from gestlok_resenas_private.coupons where local=p_local and phone=p and period=per)
    then raise exception 'El cliente ya tiene cupón para este período en esta sucursal' using errcode='23505'; end if;
  end;
 end loop;
 raise exception 'No se pudo generar código único; reintentar';
end $$;

create or replace function public.gestlok_resenas_redeem(p_local text,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c gestlok_resenas_private.coupons; d date:=gestlok_resenas_private.today_ar();
begin
 if not gestlok_resenas_private.authorized(p_local) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 update gestlok_resenas_private.coupons set used_at=now(),used_by=auth.uid()
 where id=p_id and local=p_local and used_at is null and d>=period and d<period+12 returning * into c;
 if not found then
  select * into c from gestlok_resenas_private.coupons where id=p_id and local=p_local;
  if found and c.used_at is null and d<c.period then
   raise exception 'Todavía no está vigente: se usa del 1 al 12 de %', to_char(c.period,'MM/YYYY') using errcode='22023'; end if;
  raise exception 'Cupón utilizado, vencido, de otra sucursal o inexistente' using errcode='22023';
 end if;
 insert into gestlok_resenas_private.events(coupon_id,action,actor) values(c.id,'used',auth.uid());
 return gestlok_resenas_private.payload(c);
end $$;

create or replace function public.gestlok_resenas_update(p_local text,p_id uuid,p_name text,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c gestlok_resenas_private.coupons; p text; d date:=gestlok_resenas_private.today_ar();
begin
 if not gestlok_resenas_private.authorized(p_local) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 p:=gestlok_resenas_private.phone(p_phone);
 if p_name is null or length(btrim(p_name)) not between 2 and 100 then raise exception 'Nombre inválido' using errcode='22023'; end if;
 begin
  update gestlok_resenas_private.coupons set customer_name=btrim(p_name),phone=p
  where id=p_id and local=p_local and used_at is null and d<period+12 returning * into c;
 exception when unique_violation then
  raise exception 'El cliente ya tiene cupón para este período en esta sucursal' using errcode='23505';
 end;
 if not found then raise exception 'Solo se modifican cupones pendientes de esta sucursal (utilizado, vencido o inexistente)' using errcode='22023'; end if;
 insert into gestlok_resenas_private.events(coupon_id,action,actor) values(c.id,'updated',auth.uid());
 return gestlok_resenas_private.payload(c);
end $$;

revoke all on all functions in schema gestlok_resenas_private from public,anon,authenticated;
revoke all on function public.gestlok_resenas_update(text,uuid,text,text) from public,anon;
grant execute on function public.gestlok_resenas_update(text,uuid,text,text) to authenticated;

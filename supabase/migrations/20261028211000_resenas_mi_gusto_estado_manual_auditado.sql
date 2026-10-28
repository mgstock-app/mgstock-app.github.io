-- Mi Gusto · cambios manuales de estado para cupones registrados fuera de la
-- ventana 1–12 (o registro tardío de uso). Nunca revierte un cupón usado.
-- No modifica filas existentes de clientes ni cupones.
alter table gestlok_resenas_private.events
  add column if not exists reason text;

alter table gestlok_resenas_private.events
  drop constraint if exists events_action_check;
alter table gestlok_resenas_private.events
  add constraint events_action_check
  check (action in ('created','used','updated','manual_used'));

-- Tanto una operación normal como una manual consumen de forma definitiva
-- el beneficio. Impide dos anotaciones de utilización para el mismo cupón.
create unique index if not exists events_one_use_any
  on gestlok_resenas_private.events(coupon_id)
  where action in ('used','manual_used');

create or replace function public.gestlok_resenas_manual_use(
  p_local text, p_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = ''
as $manual_use$
declare
  c gestlok_resenas_private.coupons;
  d date := gestlok_resenas_private.today_ar();
  justification text := btrim(coalesce(p_reason,''));
begin
  if not gestlok_resenas_private.authorized(p_local) then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  if length(justification) not between 8 and 300 then
    raise exception 'Explicá el motivo del cambio (entre 8 y 300 caracteres)' using errcode = '22023';
  end if;

  -- Solo corrección manual EXCEPCIONAL. Si está dentro de vigencia, usar
  -- el RPC de canje ordinario con el mismo control de único uso.
  update gestlok_resenas_private.coupons
     set used_at=now(),used_by=auth.uid()
   where id=p_id and local=p_local and used_at is null
     and (d<period or d>=period+12)
   returning * into c;
  if not found then
    raise exception 'El cupón ya fue utilizado, pertenece a otra sucursal o corresponde al canje normal del 1 al 12'
    using errcode = '22023';
  end if;

  insert into gestlok_resenas_private.events(coupon_id,action,actor,reason)
  values(c.id,'manual_used',auth.uid(),justification);
  return gestlok_resenas_private.payload(c);
end $manual_use$;

revoke all on function public.gestlok_resenas_manual_use(text,uuid,text) from public,anon;
grant execute on function public.gestlok_resenas_manual_use(text,uuid,text) to authenticated;
comment on function public.gestlok_resenas_manual_use(text,uuid,text) is
'Mi Gusto: marca definitivamente usado un cupón de su sucursal fuera de vigencia, solo dueño/creadora/gerente autorizado, con motivo obligatorio y auditoría. Nunca restablece usos.';

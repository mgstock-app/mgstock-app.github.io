alter table gestlok_mg_online_private.movements add column if not exists cash_checked boolean not null default false;

create or replace function gestlok_mg_online_private.payload(s gestlok_mg_online_private.shifts)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'id',s.id,'local',s.local,'day',s.day,'turno',s.turno,'status',s.status,
  'started_at',s.started_at,'closed_at',s.closed_at,
  'movements',coalesce((select jsonb_agg(jsonb_build_object(
   'id',m.id,'comanda',m.comanda,'method',m.method,'amount',m.amount,
   'gross_amount',m.gross_amount,'discount_amount',m.discount_amount,'ok',m.cash_checked,'app',m.app,'observacion',m.observacion,'created_at',m.created_at,'updated_at',m.updated_at
  ) order by m.created_at,m.id) from gestlok_mg_online_private.movements m where m.shift_id=s.id),'[]'::jsonb),
  'transferencia',z.transferencia,'getnet',z.getnet,'mercado_pago',z.mercado_pago,'efectivo',z.efectivo,
  'total_app',z.total_app,'total_ventas',z.total_ventas,
  'online_local',z.total_ventas-z.total_app,'comandas',z.comandas
 )
 from (
   select coalesce(sum(m.amount) filter(where m.method='transferencia'),0) as transferencia,
     coalesce(sum(m.amount) filter(where m.method='getnet'),0) as getnet,
     coalesce(sum(m.amount) filter(where m.method='mercado_pago'),0) as mercado_pago,
     coalesce(sum(m.amount) filter(where m.method='efectivo'),0) as efectivo,
     coalesce(sum(m.amount) filter(where m.app),0) as total_app,
     coalesce(sum(m.amount),0) as total_ventas,
     count(*) as comandas
   from gestlok_mg_online_private.movements m where m.shift_id=s.id
 ) z
$$;

create or replace function public.gestlok_mg_online_cash_ok(p_local text,p_shift uuid,p_id uuid,p_ok boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s gestlok_mg_online_private.shifts;
begin
 if not gestlok_mg_online_private.authorized(p_local) then raise exception 'Sin permiso' using errcode='42501'; end if;
 if p_ok is null then raise exception 'Estado inválido'; end if;
 select * into s from gestlok_mg_online_private.shifts where id=p_shift and local=p_local and status='abierto' for update;
 if s.id is null then raise exception 'Turno no disponible'; end if;
 update gestlok_mg_online_private.movements set cash_checked=p_ok,updated_at=now(),updated_by=auth.uid()
 where id=p_id and shift_id=s.id and method='efectivo';
 if not found then raise exception 'Movimiento no encontrado'; end if;
 return gestlok_mg_online_private.payload(s);
end $$;
revoke all on function public.gestlok_mg_online_cash_ok(text,uuid,uuid,boolean) from public,anon;
grant execute on function public.gestlok_mg_online_cash_ok(text,uuid,uuid,boolean) to authenticated;

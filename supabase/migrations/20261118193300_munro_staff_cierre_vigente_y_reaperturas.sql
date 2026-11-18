-- Munro: no cerrar la semana vigente; registrar reaperturas sin perder horarios.
create table if not exists rm_test_private.munro_horarios_reaperturas (
  semana date primary key check (extract(isodow from semana)=1),
  cierre_original jsonb not null,
  planillas_previas jsonb not null,
  feriados_previos jsonb not null,
  motivo text not null,
  reabierto_at timestamptz not null default clock_timestamp()
);
alter table rm_test_private.munro_horarios_reaperturas enable row level security;
revoke all on rm_test_private.munro_horarios_reaperturas from public, anon, authenticated;

-- Defensa real en BD: protege incluso contra aplicaciones antiguas.
create or replace function rm_test_private.munro_horarios_bloquear_cierre_vigente()
returns trigger language plpgsql set search_path='' as $$
declare v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
declare v_lunes date;
begin
  v_lunes := v_hoy-(extract(isodow from v_hoy)::integer-1);
  if new.semana >= v_lunes then
    raise exception 'La semana sigue vigente. Podés finalizarla desde el lunes siguiente.'
      using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function rm_test_private.munro_horarios_bloquear_cierre_vigente() from public, anon, authenticated;
drop trigger if exists mhs_no_cerrar_semana_vigente on rm_test_private.munro_horarios_semanas_cerradas;
create trigger mhs_no_cerrar_semana_vigente
before insert on rm_test_private.munro_horarios_semanas_cerradas
for each row execute function rm_test_private.munro_horarios_bloquear_cierre_vigente();

-- Una persona inactiva no se hereda a semanas nuevas sin planilla.
-- Los registros de semanas existentes se mantienen, incluidos los históricos.
do $patch$
declare d text; viejo text; nuevo text;
begin
 d:=pg_get_functiondef('public.rm_munro_horarios_obtener(date)'::regprocedure);
 viejo:=E'where v_ultima_cerrada is null or v_semana<=v_ultima_cerrada\n   or c.estado<>''inactivo''\n   or exists(select 1 from rm_test_private.munro_horarios_planillas p where p.colaborador_id=c.id and p.semana=v_semana);';
 nuevo:=E'where c.estado<>''inactivo''\n   or (v_ultima_cerrada is not null and v_semana<=v_ultima_cerrada)\n   or exists(select 1 from rm_test_private.munro_horarios_planillas p where p.colaborador_id=c.id and p.semana=v_semana);';
 if position(viejo in d)=0 then
   raise exception 'El filtro actual de colaboradores cambió: no aplicar reemplazo parcial';
 end if;
 execute replace(d,viejo,nuevo);
end $patch$;

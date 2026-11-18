-- Preservar las correcciones históricas aunque deba reabrirse un cierre accidental.
-- El vínculo permanente de auditoría es la semana registrada, no el cierre vigente.
create table if not exists rm_test_private.munro_horarios_semanas_registradas (
  semana date primary key check (extract(isodow from semana)=1),
  primera_archivacion_at timestamptz not null default clock_timestamp()
);
alter table rm_test_private.munro_horarios_semanas_registradas enable row level security;
revoke all on rm_test_private.munro_horarios_semanas_registradas from public, anon, authenticated;
insert into rm_test_private.munro_horarios_semanas_registradas (semana)
select semana from rm_test_private.munro_horarios_semanas_cerradas
union select semana from rm_test_private.munro_horarios_correcciones_cierre
on conflict (semana) do nothing;

create or replace function rm_test_private.munro_horarios_registrar_semana_cerrada()
returns trigger language plpgsql set search_path='' as $$
begin
 insert into rm_test_private.munro_horarios_semanas_registradas(semana)
 values (new.semana) on conflict (semana) do nothing;
 return new;
end $$;
revoke all on function rm_test_private.munro_horarios_registrar_semana_cerrada() from public, anon, authenticated;
drop trigger if exists mhs_registrar_cierre_auditoria on rm_test_private.munro_horarios_semanas_cerradas;
create trigger mhs_registrar_cierre_auditoria
after insert on rm_test_private.munro_horarios_semanas_cerradas
for each row execute function rm_test_private.munro_horarios_registrar_semana_cerrada();

alter table rm_test_private.munro_horarios_correcciones_cierre
drop constraint if exists munro_horarios_correcciones_cierre_semana_fkey;
alter table rm_test_private.munro_horarios_correcciones_cierre
add constraint munro_horarios_correcciones_cierre_semana_registrada_fkey
foreign key (semana) references rm_test_private.munro_horarios_semanas_registradas(semana) on delete restrict;

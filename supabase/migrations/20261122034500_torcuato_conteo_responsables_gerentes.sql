-- Mi Gusto / Don Torcuato: tres responsables de Conteo (Cami, Caro y Gabi).
-- Munro mantiene Cami, Shuli y Tizi. No se modifica ninguna fila histórica.
-- El CHECK conserva únicamente compatibilidad con responsables de turnos previos
-- (Shuli/Tizi); las RPC impiden guardarlos en nuevos turnos o correcciones.
alter table gestlok_torcuato_conteo_private.shifts
  drop constraint if exists munro_conteo_responsable_valido;
alter table gestlok_torcuato_conteo_private.shifts
  drop constraint if exists torcuato_conteo_responsable_valido;
alter table gestlok_torcuato_conteo_private.shifts
  add constraint torcuato_conteo_responsable_valido
  check (responsable is null or responsable in ('Cami','Caro','Gabi','Shuli','Tizi'));

-- Actualizar exclusivamente las tres RPC ya existentes y autorizadas de Torcuato:
-- guardado, cierre y corrección auditada de historial. Se mantienen funciones,
-- cuerpos, validación de sesión/local, SECURE DEFINER y permisos anteriores.
do $conteo_torcuato_responsables$
declare
  f record;
  body text;
  old_names text := $$'Cami','Shuli','Tizi'$$;
  new_names text := $$'Cami','Caro','Gabi'$$;
  matched integer;
  changed integer:=0;
begin
  for f in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public'
      and p.proname in (
        'gestlok_torcuato_conteo_responsable',
        'gestlok_torcuato_conteo_finalize',
        'gestlok_torcuato_conteo_correct_closed'
      )
    order by p.proname
  loop
    body:=pg_get_functiondef(f.oid);
    matched:=(length(body)-length(replace(body,old_names,'')))/length(old_names);
    if matched=1 then
      body:=replace(body,old_names,new_names);
      execute body;
    elsif matched=0 and position(new_names in body)>0 then
      -- La migración es reejecutable sin modificar las definiciones aprobadas.
      null;
    else
      raise exception 'La validación de responsables no coincide en %', f.proname;
    end if;
    execute format('revoke all on function public.%I(%s) from public, anon',f.proname,f.args);
    execute format('grant execute on function public.%I(%s) to authenticated',f.proname,f.args);
    changed:=changed+1;
  end loop;
  if changed<>3 then
    raise exception 'Se esperaban tres RPC de Torcuato; se encontraron %',changed;
  end if;
end $conteo_torcuato_responsables$;

do $verificar$
declare n integer;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
  where ns.nspname='public'
    and p.proname in (
      'gestlok_torcuato_conteo_responsable',
      'gestlok_torcuato_conteo_finalize',
      'gestlok_torcuato_conteo_correct_closed'
    ) and position($$'Cami','Caro','Gabi'$$ in pg_get_functiondef(p.oid))>0
      and position($$'Cami','Shuli','Tizi'$$ in pg_get_functiondef(p.oid))=0;
  if n<>3 then raise exception 'La lista de gerentes de Torcuato no fue actualizada'; end if;
end $verificar$;

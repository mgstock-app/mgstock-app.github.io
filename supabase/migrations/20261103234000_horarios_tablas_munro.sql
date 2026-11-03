-- Opt-in exclusivo de Munro. PDF, versiones previas y pagos permanecen intactos.
alter table rm_test_private.horarios_archivos add column tablas jsonb;

create function rm_test_private.horarios_validar_tabla(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare n int; width int; matrix jsonb; r jsonb; c jsonb; m jsonb; headers int;
begin
 if jsonb_typeof(p) is distinct from 'object' or length(p::text)>2000000 then return false; end if;
 if jsonb_typeof(p->'values') is distinct from 'array' then return false; end if;
 n:=jsonb_array_length(p->'values');
 if n<1 or n>1000 or jsonb_typeof(p->'values'->0) is distinct from 'array' then return false; end if;
 width:=jsonb_array_length(p->'values'->0);
 if width<1 or width>100 then return false; end if;
 headers:=(p->>'headerRows')::int;
 if headers is null or headers<1 or headers>n then return false; end if;
 foreach matrix in array array[p->'values',p->'backgrounds',p->'colors'] loop
  if jsonb_typeof(matrix) is distinct from 'array' or jsonb_array_length(matrix)<>n then return false; end if;
  for r in select * from jsonb_array_elements(matrix) loop
   if jsonb_typeof(r) is distinct from 'array' or jsonb_array_length(r)<>width then return false; end if;
   for c in select * from jsonb_array_elements(r) loop
    if jsonb_typeof(c) is distinct from 'string' or length(c::text)>4000 then return false; end if;
   end loop;
  end loop;
 end loop;
 if jsonb_typeof(p->'merges') is distinct from 'array' or jsonb_array_length(p->'merges')>10000 then return false; end if;
 for m in select * from jsonb_array_elements(p->'merges') loop
  if not (m ?& array['row','col','rows','cols']) then return false; end if;
  if (m->>'row')::int<0 or (m->>'col')::int<0 or (m->>'rows')::int<1 or (m->>'cols')::int<1
   or (m->>'row')::int+(m->>'rows')::int>n or (m->>'col')::int+(m->>'cols')::int>width
   or ((m->>'row')::int<headers and (m->>'row')::int+(m->>'rows')::int>headers) then return false; end if;
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function rm_test_private.horarios_validar_tabla(jsonb) from public,anon,authenticated;

create function public.rm_horarios_archivar_tablas(p_codigo text,p_desde text,p_hasta text,p_filas jsonb,p_resumen text,p_semana text,p_tablas jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_local text; result jsonb; existing jsonb;
begin
 select local_id into v_local from rm_test_private.horarios_conexiones
 where token_hash=encode(extensions.digest(coalesce(p_codigo,''),'sha256'),'hex') for update;
 if v_local is distinct from 'munro' then raise exception 'Conexión no habilitada para tablas' using errcode='42501'; end if;
 if not rm_test_private.horarios_validar_tabla(p_tablas->'Resumen') or not rm_test_private.horarios_validar_tabla(p_tablas->'Semana') then
  raise exception 'Tablas inválidas o incompletas: no se archivó nada' using errcode='22023';
 end if;
 result:=public.rm_horarios_archivar(p_codigo,p_desde,p_hasta,p_filas,p_resumen,p_semana);
 select tablas into existing from rm_test_private.horarios_archivos where id=(result->>'archivo_id')::uuid;
 if existing is not null and existing is distinct from p_tablas then
  raise exception 'El archivo ya tiene tablas diferentes. No se reemplazó el historial' using errcode='22023';
 end if;
 update rm_test_private.horarios_archivos set tablas=p_tablas
 where id=(result->>'archivo_id')::uuid and local_id='munro' and tablas is null;
 return result;
end $$;

create function public.rm_horarios_tabla(p_local text,p_archivo uuid,p_hoja text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_local is distinct from 'munro' or not rm_test_private.horarios_puede_ver(p_local) then
  raise exception 'Sin acceso al historial del local' using errcode='42501';
 end if;
 if p_hoja is null or p_hoja not in ('Resumen','Semana') then raise exception 'Hoja inválida' using errcode='22023'; end if;
 select jsonb_build_object('tabla',tablas->p_hoja,'filas',filas) into result
 from rm_test_private.horarios_archivos where id=p_archivo and local_id=p_local;
 if result is null then raise exception 'Archivo no encontrado' using errcode='22023'; end if;
 return result;
end $$;
revoke all on function public.rm_horarios_archivar_tablas(text,text,text,jsonb,text,text,jsonb),public.rm_horarios_tabla(text,uuid,text) from public,anon,authenticated;
grant execute on function public.rm_horarios_archivar_tablas(text,text,text,jsonb,text,text,jsonb) to anon,authenticated;
grant execute on function public.rm_horarios_tabla(text,uuid,text) to authenticated;

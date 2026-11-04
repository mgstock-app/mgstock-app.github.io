-- Solo Munro: copia efimera de las hojas actuales, separada del historial inmutable.
create table rm_test_private.horarios_en_vivo (
 local_id text primary key,
 semana_desde date not null,
 semana_hasta date not null,
 tablas jsonb not null,
 actualizado_at timestamptz not null default now(),
 constraint horarios_en_vivo_munro check (local_id = 'munro'),
 constraint horarios_en_vivo_siete_dias check (semana_hasta = semana_desde + 6)
);
revoke all on rm_test_private.horarios_en_vivo from public,anon,authenticated;

create function public.rm_horarios_en_vivo_recibir(p_codigo text,p_desde text,p_hasta text,p_tablas jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_local text; v_desde date; v_hasta date;
begin
 select local_id into v_local from rm_test_private.horarios_conexiones
 where token_hash=encode(extensions.digest(coalesce(p_codigo,''),'sha256'),'hex');
 if v_local is distinct from 'munro' then raise exception 'Conexión no habilitada' using errcode='42501'; end if;
 v_desde:=rm_test_private.horarios_fecha(p_desde);
 v_hasta:=rm_test_private.horarios_fecha(p_hasta);
 if v_desde is null or v_hasta<>v_desde+6
    or extract(isodow from v_desde)<>1
    or v_desde > (timezone('America/Argentina/Buenos_Aires',now())::date + 7)
    or v_desde < (timezone('America/Argentina/Buenos_Aires',now())::date - 14)
 then raise exception 'Fechas de semana inválidas' using errcode='22023'; end if;
 if not rm_test_private.horarios_validar_tabla(p_tablas->'Resumen')
    or not rm_test_private.horarios_validar_tabla(p_tablas->'Semana')
 then raise exception 'Tablas incompletas' using errcode='22023'; end if;
 if exists(select 1 from rm_test_private.horarios_archivos where local_id='munro' and semana_desde=v_desde) then
   return jsonb_build_object('ok',true,'archivada',true);
 end if;
 insert into rm_test_private.horarios_en_vivo(local_id,semana_desde,semana_hasta,tablas,actualizado_at)
 values('munro',v_desde,v_hasta,p_tablas,now())
 on conflict(local_id) do update set semana_desde=excluded.semana_desde,
 semana_hasta=excluded.semana_hasta,tablas=excluded.tablas,actualizado_at=now();
 return jsonb_build_object('ok',true,'archivada',false);
end $$;

create function public.rm_horarios_en_vivo(p_local text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_local is distinct from 'munro' or not rm_test_private.horarios_puede_ver(p_local) then
   raise exception 'Sin acceso a horarios' using errcode='42501'; end if;
 select jsonb_build_object('desde',semana_desde,'hasta',semana_hasta,
 'tablas',tablas,'actualizado_at',actualizado_at) into result
 from rm_test_private.horarios_en_vivo where local_id=p_local;
 return result;
end $$;
revoke all on function public.rm_horarios_en_vivo_recibir(text,text,text,jsonb),public.rm_horarios_en_vivo(text) from public,anon,authenticated;
grant execute on function public.rm_horarios_en_vivo_recibir(text,text,text,jsonb) to anon,authenticated;
grant execute on function public.rm_horarios_en_vivo(text) to authenticated;

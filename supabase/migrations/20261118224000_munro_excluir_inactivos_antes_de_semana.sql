-- Munro: ocultar personal inactivo desde antes de la semana, aunque exista planilla de esa semana.
-- Mantener las semanas ya cerradas accesibles en el historial.
do $patch$
declare v_def text; v_antes text; v_despues text;
begin
 v_def := pg_get_functiondef('public.rm_munro_horarios_obtener(date)'::regprocedure);
 v_antes := E'where c.estado<>''inactivo''\n   or (v_ultima_cerrada is not null and v_semana<=v_ultima_cerrada)\n   or exists(select 1 from rm_test_private.munro_horarios_planillas p where p.colaborador_id=c.id and p.semana=v_semana);';
 v_despues := E'where c.estado<>''inactivo''\n   or (c.inactivo_desde is not null and c.inactivo_desde>v_semana)\n   or v_cerrada;';
 if position(v_antes in v_def)=0 then
   raise exception 'Cambió el filtro de personal de Munro: revisar antes de modificar';
 end if;
 execute replace(v_def,v_antes,v_despues);
end $patch$;

-- Ejecutar DESPUÉS de aplicar la migración. Audita sin modificar datos.
begin read only;
do $check$
begin
 if has_table_privilege('anon','public.gestlok_app_reviews','INSERT')
   or has_table_privilege('authenticated','public.gestlok_app_reviews','INSERT')
 then raise exception 'Bloqueo de inserción directa no aplicado'; end if;
 if not has_function_privilege(
   'anon',
   'public.gestlok_demo_enviar_resena_cupon(integer,text,boolean,boolean,text,text)',
   'EXECUTE'
 ) then raise exception 'La función de reseñas dejó de ser accesible a visitantes'; end if;
 if not exists(
  select 1 from pg_proc
  where oid='public.gestlok_demo_enviar_resena_cupon(integer,text,boolean,boolean,text,text)'::regprocedure
    and prosecdef
 ) then raise exception 'Revisar ejecución privilegiada de la RPC'; end if;
end
$check$;
rollback;

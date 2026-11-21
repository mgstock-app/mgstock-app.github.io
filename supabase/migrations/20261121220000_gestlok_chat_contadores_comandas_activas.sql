-- GESTLOK Chat: contadores de comandas activas por tenant/local para alertas.
-- Conserva ACL, autorización de panel y estructura previa de respuesta.
-- Los pedidos de DEMOSTRACIÓN no entran en avisos operativos.
-- Pedidos programados futuros se cuentan, pero no hacen sonar alarmas antes de horario.
CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_inicio()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_t uuid := gestlok_tenancy.current_tenant_id(); e gestlok_chat_private.empresas;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión en GESTLOK' using errcode = '42501'; end if;
  select * into e from gestlok_chat_private.empresas where tenant_id = v_t and habilitada;
  if e.tenant_id is null then return jsonb_build_object('habilitado', false); end if;
  return jsonb_build_object('habilitado', true, 'empresa', e.nombre_publico,
    'sucursales', coalesce((select jsonb_agg(x order by x->>'nombre') from (
      select jsonb_build_object('id', s.id, 'nombre', s.nombre, 'slug', s.slug, 'local_id', s.local_id, 'activa', s.activa,
        'nivel', gestlok_chat_private.nivel(s.id),
        'pendientes', (select count(*) from gestlok_chat_private.pedidos p
            where p.sucursal_id = s.id and p.estado = 'pendiente' and coalesce(to_jsonb(p)->>'es_prueba','false') <> 'true'),
        'pendientes_avisables', (select count(*) from gestlok_chat_private.pedidos p
            where p.sucursal_id = s.id and p.estado = 'pendiente' and coalesce(to_jsonb(p)->>'es_prueba','false') <> 'true'
              and (p.programado_para is null or p.programado_para <= now())),
        'en_preparacion', (select count(*) from gestlok_chat_private.pedidos p
            where p.sucursal_id = s.id and p.estado = 'confirmado' and coalesce(to_jsonb(p)->>'es_prueba','false') <> 'true'),
        'reclamos', (select count(*) from gestlok_chat_private.reclamos r where r.sucursal_id=s.id and r.estado='pendiente')) x
      from gestlok_chat_private.sucursales s where s.tenant_id = e.tenant_id and gestlok_chat_private.nivel(s.id) is not null) q), '[]'::jsonb));
end $function$;

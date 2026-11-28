-- Nombre comercial WAI: usa el catálogo de GESTLOK incluso antes de activar WAI.
-- No crea empresas Chat, sucursales, suscripciones ni activa ningún servicio.
do $migration$
declare
 f regprocedure:=to_regprocedure('public.gestlok_chat_wai_admin_comercial(text,uuid,text,text,uuid,boolean,text)');
 d text;
 anterior text:='coalesce(e.nombre_publico,t.code)';
 nuevo text:=$expr$coalesce(nullif(nullif(btrim(e.nombre_publico),''),t.code),(select nullif(btrim(p.name),'') from gestlok_platform.companies p where p.tenant_id=t.id),t.code)$expr$;
 alta_anterior text:=$expr$coalesce(e.nombre_publico,(select left(t.code,80) from gestlok_tenancy.tenants t where t.id=p_tenant))$expr$;
 alta_nueva text:=$expr$coalesce(nullif(btrim(e.nombre_publico),''),(select left(coalesce(nullif(btrim(p.name),''),t.code),80) from gestlok_tenancy.tenants t left join gestlok_platform.companies p on p.tenant_id=t.id where t.id=p_tenant))$expr$;
begin
 if f is null then raise exception 'Falta la función de administración WAI'; end if;
 d:=pg_get_functiondef(f);
 if strpos(d,nuevo)>0 and strpos(d,alta_nueva)>0 then return; end if;
 if (length(d)-length(replace(d,anterior,'')))/length(anterior)<>2 or strpos(d,alta_anterior)=0 then
  raise exception 'Definición de administración WAI cambió: revisar antes de aplicar';
 end if;
 execute replace(replace(d,anterior,nuevo),alta_anterior,alta_nueva);
end
$migration$;

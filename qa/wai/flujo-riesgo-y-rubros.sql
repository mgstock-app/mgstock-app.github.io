-- QA reproducible (solo Prueba): ejecutar dentro de begin; ... rollback; después de wai-riesgo-y-rubros.sql.
begin;

do $$
declare n_antes int; n_despues int; p uuid; s1 uuid; t text; r text; m uuid;
begin
 select sucursal_id into s1 from gestlok_chat_private.wai_pilotos order by creado_at desc limit 1;
 if s1 is null then raise exception 'QA sin conversaciones de ensayo';end if;
 select count(*) into n_despues from gestlok_chat_private.wai_central_lineas();
 if n_despues<1 then raise exception 'QA: el servidor central perdió la línea de ensayo';end if;
 if gestlok_chat_private.wai_texto_rubro('Ver la carta y promociones','ferreteria')<>'Ver el catálogo y promociones' then raise exception 'QA texto 1';end if;
 if gestlok_chat_private.wai_texto_rubro('Ver otras opciones de la carta','perfumeria')<>'Ver otras opciones del catálogo' then raise exception 'QA texto 2';end if;
 if gestlok_chat_private.wai_texto_rubro('Ver la carta','gastronomia')<>'Ver la carta' then raise exception 'QA texto 3';end if;
 if gestlok_chat_private.wai_texto_rubro('Se descarta la cartera','mascotas')<>'Se descarta la cartera' then raise exception 'QA texto 4';end if;
 if (gestlok_chat_private.wai_config_rubro('servicios')->>'pedidos')::boolean then raise exception 'QA servicios sin seguimiento';end if;
 if jsonb_array_length(gestlok_chat_private.wai_config_rubro('ferreteria')->'opciones')<>3 then raise exception 'QA opciones ferreteria';end if;
 -- Cambio de rubro sincroniza el registro WAI y el motor sigue activo.
 update gestlok_chat_private.wai_rubros_locales set rubro='perfumeria' from gestlok_chat_private.sucursales s where s.id=s1 and s.tenant_id=wai_rubros_locales.tenant_id and s.local_id=wai_rubros_locales.local_id;
 update gestlok_chat_private.wai_comercios set rubro='gastronomia' where sucursal_id=s1;
 select rubro into r from gestlok_chat_private.wai_comercios where sucursal_id=s1;
 if r<>'perfumeria' then raise exception 'QA rubro sincronizado: %',r;end if;
 if not gestlok_chat_private.wai_rubro_activo(s1) then raise exception 'QA motor activo en perfumería';end if;
 -- Palabras en mensajes salientes según rubro.
 select id into p from gestlok_chat_private.wai_pilotos where sucursal_id=s1 limit 1;
 if p is null then raise exception 'QA sin piloto';end if;
 insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado) values(p,'salida','Te comparto la carta de hoy','aceptado') returning id into m;
 select texto into t from gestlok_chat_private.wai_mensajes where id=m;
 if t<>'Te comparto el catálogo de hoy' then raise exception 'QA mensaje: %',t;end if;
 insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado) values(p,'entrada','quiero la carta','recibido') returning id into m;
 select texto into t from gestlok_chat_private.wai_mensajes where id=m;
 if t<>'quiero la carta' then raise exception 'QA entrada no se modifica';end if;
 -- Sin aceptación no hay línea.
 delete from gestlok_chat_private.wai_riesgo_aceptado where sucursal_id=s1;
 if exists(select 1 from gestlok_chat_private.wai_central_lineas() where sucursal=s1) then raise exception 'QA línea sin aceptación';end if;
 if position('wai_rubro_declarado(p_tenant,p_local) and exists' in pg_get_functiondef('public.gestlok_chat_wai_admin_rubro(uuid,text,text)'::regprocedure))=0 then raise exception 'QA admin_rubro';end if;
 if position('únicamente gastronomía' in pg_get_functiondef('public.gestlok_chat_wai_comercios(text,uuid,text,boolean,text)'::regprocedure))>0 then raise exception 'QA comercios';end if;
 if position('wai_rubro_declarado(s.tenant_id,s.local_id)' in pg_get_functiondef('public.gestlok_chat_wai_portal_inicio(text)'::regprocedure))=0 then raise exception 'QA portal';end if;
 raise notice 'QA WAI riesgo y rubros: OK';
end$$;
rollback;

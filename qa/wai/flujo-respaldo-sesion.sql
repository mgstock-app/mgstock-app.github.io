-- QA (solo Prueba, con deshacer): ejecutar después de wai-respaldo-sesion.sql dentro de begin; ... rollback;
-- Simula el turno del servidor central con una clave conocida y prueba lectura/escritura/borrado.
do $$
declare k text:=repeat('e',64); i uuid:=gen_random_uuid(); otro uuid:=gen_random_uuid(); l uuid; r jsonb;
begin
 if not has_function_privilege('anon','public.gestlok_chat_wai_auth(text,uuid,uuid,text,text,text[],jsonb)','execute') then raise exception 'QA permiso anon';end if;
 if has_table_privilege('anon','gestlok_chat_private.wai_auth_estado','select') then raise exception 'QA tabla expuesta';end if;
 select id into l from gestlok_chat_private.wai_central_lineas() limit 1;
 if l is null then raise exception 'QA: sin línea central';end if;
 update gestlok_chat_private.wai_servidor_central set clave_hash=encode(sha256(convert_to(k,'UTF8')),'hex'),instancia=i,vence_at=clock_timestamp()+interval '45 seconds' where id;
 r=public.gestlok_chat_wai_auth(k,i,l,'guardar',p_cambios=>'[{"t":"creds","k":"creds","v":"Y2lmcmFkbw=="},{"t":"session","k":"549.0","v":"cw=="}]');
 if r->>'ok'<>'true' then raise exception 'QA guardar %',r;end if;
 r=public.gestlok_chat_wai_auth(k,i,l,'leer',p_tipo=>'session',p_claves=>array['549.0','falta']);
 if r->'valores'->>'549.0'<>'cw==' or r->'valores' ? 'falta' then raise exception 'QA leer %',r;end if;
 if public.gestlok_chat_wai_auth(k,otro,l,'leer',p_tipo=>'session',p_claves=>array['549.0']) is not null then raise exception 'QA otro equipo sin turno';end if;
 if public.gestlok_chat_wai_auth(repeat('f',64),i,l,'leer',p_tipo=>'session',p_claves=>array['549.0']) is not null then raise exception 'QA clave equivocada';end if;
 if public.gestlok_chat_wai_auth(k,i,gen_random_uuid(),'leer',p_tipo=>'session',p_claves=>array['549.0']) is not null then raise exception 'QA línea ajena';end if;
 if public.gestlok_chat_wai_auth(k,i,l,'guardar',p_cambios=>'[{"t":"session","k":"nuevo","v":"YQ=="},{"t":"MAL","k":"x","v":"YQ=="}]') is not null then raise exception 'QA cambio inválido';end if;
 if exists(select 1 from gestlok_chat_private.wai_auth_estado where habilitacion_id=l and clave='nuevo') then raise exception 'QA guardó parcial';end if;
 r=public.gestlok_chat_wai_auth(k,i,l,'guardar',p_cambios=>'[{"t":"session","k":"549.0","v":null}]');
 if exists(select 1 from gestlok_chat_private.wai_auth_estado where habilitacion_id=l and tipo='session') then raise exception 'QA borrar clave';end if;
 update gestlok_chat_private.wai_servidor_central set vence_at=clock_timestamp()-interval '1 second' where id;
 if public.gestlok_chat_wai_auth(k,i,l,'leer',p_tipo=>'creds',p_claves=>array['creds']) is not null then raise exception 'QA turno vencido';end if;
 update gestlok_chat_private.wai_servidor_central set instancia=otro,vence_at=clock_timestamp()+interval '45 seconds' where id;
 r=public.gestlok_chat_wai_auth(k,otro,l,'leer',p_tipo=>'creds',p_claves=>array['creds']);
 if r->'valores'->>'creds'<>'Y2lmcmFkbw==' then raise exception 'QA el respaldo retoma la sesión %',r;end if;
 r=public.gestlok_chat_wai_auth(k,otro,l,'borrar');
 if exists(select 1 from gestlok_chat_private.wai_auth_estado where habilitacion_id=l) then raise exception 'QA borrar todo';end if;
 raise notice 'QA respaldo de sesión: OK';
end$$;

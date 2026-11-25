-- HQ: encargos internos específicos; no concede permisos de escritura ni publica.
alter table gestlok_hq_private.tasks add column if not exists targeted boolean not null default false;
-- La misión QA específica ya registrada necesita un solo especialista.
update gestlok_hq_private.tasks set targeted=true
 where agent='lider' and instruction like 'Solicitud de la administradora · QA integral Mi Gusto (Munro y Don Torcuato) · issue #611.%';
do $$
declare d text;
begin
 d:=pg_get_functiondef('gestlok_hq_private.claim_run(uuid,uuid)'::regprocedure);
 if position('not t.targeted' in d)=0 then
  if position('(select count(*) from gestlok_hq_private.tasks where parent_task_id=t.id and creator_id=p_user)<7' in d)=0 then raise exception 'Revisar claim_run'; end if;
  execute replace(d,'(select count(*) from gestlok_hq_private.tasks where parent_task_id=t.id and creator_id=p_user)<7','(not t.targeted and (select count(*) from gestlok_hq_private.tasks where parent_task_id=t.id and creator_id=p_user)<7)');
 end if;
 d:=pg_get_functiondef('gestlok_hq_private.set_auto(uuid,boolean)'::regprocedure);
 if position('not targeted' in d)=0 then
  if position('(select count(*) from gestlok_hq_private.tasks where parent_task_id=p_task and creator_id=v)<7' in d)=0 then raise exception 'Revisar set_auto'; end if;
  execute replace(d,'(select count(*) from gestlok_hq_private.tasks where parent_task_id=p_task and creator_id=v)<7','((select count(*) from gestlok_hq_private.tasks where parent_task_id=p_task and creator_id=v)<case when exists(select 1 from gestlok_hq_private.tasks where id=p_task and creator_id=v and targeted) then 1 else 7 end)');
 end if;
 d:=pg_get_functiondef('gestlok_hq_private.list_tasks()'::regprocedure);
 if position('auto_started_at,targeted' in d)=0 then
  if position('auto_started_at from gestlok_hq_private.tasks' in d)=0 then raise exception 'Revisar list_tasks'; end if;
  execute replace(d,'auto_started_at from gestlok_hq_private.tasks','auto_started_at,targeted from gestlok_hq_private.tasks');
 end if;
end $$;

-- Solo desde un informe real recién finalizado. Una solicitud por informe, sin cadenas recursivas.
-- Se registra para aprobación de la creadora; el encargo no se ejecuta automáticamente.
create or replace function gestlok_hq_private.registrar_encargo() returns trigger
language plpgsql security definer set search_path='' as $$
declare t gestlok_hq_private.tasks%rowtype; partes text[]; m uuid;
begin
 if old.state is distinct from 'working' or new.state is distinct from 'review' then return new; end if;
 select * into t from gestlok_hq_private.tasks where id=new.task_id and creator_id=new.creator_id and status='pendiente';
 if not found or t.targeted or exists(select 1 from gestlok_hq_private.tasks p where p.id=t.parent_task_id and p.targeted) then return new; end if;
 -- Propuestas textuales no confiables: solo formato y destinatarios de lista cerrada, nunca SQL o código ejecutable.
 select regexp_match(linea,'^SOLICITUD_HQ[|](desarrollo|marketing|difusion|testing)[|]([^|]{15,500})$') into partes
 from regexp_split_to_table(coalesce(new.result,''),E'\\n') linea
 where linea ~ '^SOLICITUD_HQ[|](desarrollo|marketing|difusion|testing)[|][^|]{15,500}$' limit 1;
 if partes is null or partes[1]=t.agent then return new; end if;
 if exists(select 1 from gestlok_hq_private.tasks where creator_id=t.creator_id and targeted and instruction like 'HQ · Encargo interno · informe '||new.id::text||'%') then return new; end if;
 insert into gestlok_hq_private.tasks(creator_id,agent,instruction,status,targeted,auto_enabled)
 values(t.creator_id,'lider','HQ · Encargo interno · informe '||new.id::text||' · sector solicitante: '||t.agent||'. Alex: revisá la entrega del especialista y elevá el resultado a la administradora. Solicitud: '||partes[2],'pendiente',true,false) returning id into m;
 insert into gestlok_hq_private.tasks(creator_id,agent,instruction,status,parent_task_id,targeted)
 values(t.creator_id,partes[1],'Encargo de Dirección · preparar una entrega verificable, sin ejecutar cambios externos: '||partes[2],'pendiente',m,true);
 return new;
end $$;
revoke all on function gestlok_hq_private.registrar_encargo() from public,anon,authenticated;
drop trigger if exists registrar_encargo_hq on gestlok_hq_private.agent_runs;
create trigger registrar_encargo_hq after update of state on gestlok_hq_private.agent_runs for each row execute function gestlok_hq_private.registrar_encargo();

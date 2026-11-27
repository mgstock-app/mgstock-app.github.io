-- Keep conversational results out of the operational request and executive push triggers.
-- Older isolated test databases may not yet have these optional triggers.
do $migration$
begin
 if to_regprocedure('gestlok_hq_private.registrar_encargo()') is not null then
 execute $ddl$
 create or replace function gestlok_hq_private.registrar_encargo() returns trigger
 language plpgsql security definer set search_path='' as $fn$
 declare t gestlok_hq_private.tasks%rowtype; partes text[]; m uuid;
 begin
  if old.state is distinct from 'working' or new.state is distinct from 'review' then return new; end if;
  select * into t from gestlok_hq_private.tasks where id=new.task_id and creator_id=new.creator_id and status='pendiente';
  if not found or left(t.instruction,length(E'HQ_CHAT_V1\n'))=E'HQ_CHAT_V1\n'
   or t.targeted or exists(select 1 from gestlok_hq_private.tasks p where p.id=t.parent_task_id and p.targeted) then return new; end if;
  -- PostgreSQL regexp quantifiers cannot have an upper bound greater than 255.
  -- Validate the same 15..500 length separately, preserving the existing allowlist.
  select regexp_match(linea,'^SOLICITUD_HQ[|](desarrollo|marketing|difusion|testing)[|]([^|]{15,})$') into partes
  from regexp_split_to_table(coalesce(new.result,''),E'\n') linea
  where linea ~ '^SOLICITUD_HQ[|](desarrollo|marketing|difusion|testing)[|][^|]{15,}$'
    and length(split_part(linea,'|',3)) between 15 and 500 limit 1;
  if partes is null or partes[1]=t.agent then return new; end if;
  if exists(select 1 from gestlok_hq_private.tasks where creator_id=t.creator_id and targeted and instruction like 'HQ · Encargo interno · informe '||new.id::text||'%') then return new; end if;
  insert into gestlok_hq_private.tasks(creator_id,agent,instruction,status,targeted,auto_enabled)
  values(t.creator_id,'lider','HQ · Encargo interno · informe '||new.id::text||' · sector solicitante: '||t.agent||'. Alex: revisá la entrega del especialista y elevá el resultado a la administradora. Solicitud: '||partes[2],'pendiente',true,false) returning id into m;
  insert into gestlok_hq_private.tasks(creator_id,agent,instruction,status,parent_task_id,targeted)
  values(t.creator_id,partes[1],'Encargo de Dirección · preparar una entrega verificable, sin ejecutar cambios externos: '||partes[2],'pendiente',m,true);
  return new;
 end $fn$;
 $ddl$;
 end if;
 if to_regprocedure('gestlok_hq_private.enqueue_director_push()') is not null then
 execute $ddl$
 create or replace function gestlok_hq_private.enqueue_director_push() returns trigger
 language plpgsql security definer set search_path='' as $fn$
 begin
  if old.state is distinct from 'working' or new.state is distinct from 'review' then return new; end if;
  if not exists(select 1 from gestlok_hq_private.tasks t where t.id=new.task_id and t.creator_id=new.creator_id and t.agent='lider' and t.status='pendiente' and left(t.instruction,length(E'HQ_CHAT_V1\n'))<>E'HQ_CHAT_V1\n') then return new; end if;
  insert into gestlok_hq_private.push_jobs(run_id,endpoint,creator_id)
  select new.id,d.endpoint,d.creator_id from gestlok_hq_private.push_devices d where d.creator_id=new.creator_id
  on conflict(run_id,endpoint) do nothing;
  return new;
 end $fn$;
 $ddl$;
 end if;
end $migration$;

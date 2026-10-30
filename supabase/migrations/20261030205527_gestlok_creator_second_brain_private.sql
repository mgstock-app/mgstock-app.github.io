-- GESTLOK · Segundo cerebro privado de la Creadora.
-- No contiene las ideas: el contenido se guarda SOLO en la base privada.
-- No implementa ninguna funcionalidad guardada como idea.
create table if not exists gestlok_platform.creator_ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  body text not null check (char_length(btrim(body)) between 3 and 16000),
  status text not null default 'idea' check (status in ('idea','diseno','pendiente','aprobada','archivada')),
  topic text not null default 'general' check (char_length(btrim(topic)) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gestlok_creator_ideas_updated_idx on gestlok_platform.creator_ideas(updated_at desc);
alter table gestlok_platform.creator_ideas enable row level security;
revoke all on gestlok_platform.creator_ideas from public, anon, authenticated;

create or replace function public.gestlok_creator_ideas_list()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform gestlok_platform.require_admin();
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.updated_at desc) from (
   select id,title,body,status,topic,created_at,updated_at
   from gestlok_platform.creator_ideas
   order by updated_at desc limit 250
 ) r),'[]'::jsonb);
end $$;
revoke all on function public.gestlok_creator_ideas_list() from public, anon, authenticated;
grant execute on function public.gestlok_creator_ideas_list() to authenticated;

create or replace function public.gestlok_creator_ideas_save(
  p_title text, p_body text, p_status text default 'idea',
  p_topic text default 'general', p_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform gestlok_platform.require_admin();
 p_title := btrim(coalesce(p_title,''));
 p_body := btrim(coalesce(p_body,''));
 p_topic := btrim(coalesce(p_topic,''));
 if char_length(p_title) not between 3 and 160
    or char_length(p_body) not between 3 and 16000
    or char_length(p_topic) not between 2 and 80
    or p_status not in ('idea','diseno','pendiente','aprobada','archivada')
 then raise exception 'Datos de la idea inválidos' using errcode='22023'; end if;
 if p_id is null then
   insert into gestlok_platform.creator_ideas(title,body,status,topic)
   values(p_title,p_body,p_status,p_topic) returning id into v_id;
 else
   update gestlok_platform.creator_ideas
   set title=p_title, body=p_body,status=p_status,topic=p_topic,updated_at=now()
   where id=p_id returning id into v_id;
   if v_id is null then raise exception 'Idea no encontrada' using errcode='P0002';end if;
 end if;
 return (select to_jsonb(r) from (
   select id,title,body,status,topic,created_at,updated_at
   from gestlok_platform.creator_ideas where id=v_id
 ) r);
end $$;
revoke all on function public.gestlok_creator_ideas_save(text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.gestlok_creator_ideas_save(text,text,text,text,uuid) to authenticated;
comment on table gestlok_platform.creator_ideas is
 'Memoria de ideas privada: inaccesible por Data API, solo funciones RPC con require_admin(). No desplegar ideas aquí almacenadas sin aprobación explícita.';

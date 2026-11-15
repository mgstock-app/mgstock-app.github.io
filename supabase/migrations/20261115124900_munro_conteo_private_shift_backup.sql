-- Respaldo privado y reversible antes de la limpieza excepcional del 14/11.
-- Este archivo no modifica ni mueve los conteos: solo crea un espacio para su copia.
create table if not exists gestlok_munro_conteo_private.shift_correction_backup (
 source_day date not null,
 source_shift text not null,
 correction_code text not null,
 original_record jsonb not null,
 captured_at timestamptz not null default now(),
 primary key(source_day, source_shift, correction_code)
);
revoke all on table gestlok_munro_conteo_private.shift_correction_backup from public, anon, authenticated;
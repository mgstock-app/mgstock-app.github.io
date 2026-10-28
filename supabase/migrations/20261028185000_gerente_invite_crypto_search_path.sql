-- Fix live function created before pgcrypto schema qualification.
-- pg_catalog resolves built-ins first; extensions is trusted and contains
-- gen_random_bytes. A fresh install also has the qualified name in the
-- previous migration.
alter function rm_test_private.rm_manager_staff_invite_create(text)
  set search_path to pg_catalog, extensions;

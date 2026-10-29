-- GESTLOK: primera etapa de escalabilidad multiempresa (sin cambios de datos ni RLS).
-- Cubre filtros habituales por organización/local y vínculos de RR.HH.
-- Los índices son aditivos e idempotentes; NO modifican permisos ni registros.
-- Ejecutar primero en un entorno de pruebas para cargas grandes.

CREATE INDEX IF NOT EXISTS gl_scale_locals_org_id_idx
  ON public.rm_app_local (organization_id, id);

CREATE INDEX IF NOT EXISTS gl_scale_members_local_user_idx
  ON public.rm_test_members (local_id, user_id);

CREATE INDEX IF NOT EXISTS gl_scale_profiles_local_id_idx
  ON public.rm_employee_profiles (local_id, id);

CREATE INDEX IF NOT EXISTS gl_scale_settings_org_idx
  ON public.rm_app_settings (organization_id);

CREATE INDEX IF NOT EXISTS gl_scale_schedules_org_company_idx
  ON public.rm_schedules (organization_id, company_id);

CREATE INDEX IF NOT EXISTS gl_scale_push_events_tenant_local_created_idx
  ON public.gestlok_push_events (tenant_id, local_id, created_at DESC);

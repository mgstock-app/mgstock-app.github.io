-- GESTLOK · Administración de empleados: funciones, parte 11 de 11 (adaptadas de ReciboNet: identidad por correo confirmado).
set local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.rm_app_publish_report(p_sheet text, p_image text, p_version timestamp with time zone)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_publish_report(p_sheet,p_image,p_version)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_record_whatsapp(p_sheet text, p_version timestamp with time zone, p_contact jsonb)
 RETURNS timestamp with time zone
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select rm_test_private.record_whatsapp(p_sheet,p_version,p_contact)
$function$;

CREATE OR REPLACE FUNCTION public.rm_app_register_choice(p_kind text, p_name text, p_accept boolean)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_register_choice(p_kind,p_name,p_accept)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_reject(p_user uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_reject(p_user)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_report_image()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_report_image()$function$;

CREATE OR REPLACE FUNCTION public.rm_app_request_access()
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_request_access()$function$;

CREATE OR REPLACE FUNCTION public.rm_app_restore(p_copy jsonb)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_restore(p_copy)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_restore_organization(p_org uuid, p_copy jsonb)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_restore_organization(p_org,p_copy)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_review_access(p_user uuid, p_approve boolean)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_review_access(p_user,p_approve)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_revoke_join_link(p_link uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_revoke_join_link(p_link)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_save_schedule(p_company uuid, p_period text, p_start date, p_rows jsonb, p_notes text, p_publish boolean, p_version integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_save_schedule(p_company,p_period,p_start,p_rows,p_notes,p_publish,p_version)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_schedule_comment(p_schedule uuid, p_body text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_schedule_comment(p_schedule,p_body)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_schedule_context(p_company uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_schedule_context(p_company)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_set_branch_schedule_link(p_local text, p_url text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select rm_test_private.set_branch_schedule_link(p_local,p_url)
$function$;

CREATE OR REPLACE FUNCTION public.rm_app_users()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_users()$function$;

CREATE OR REPLACE FUNCTION public.rm_test_access_state()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select rm_test_private.rm_test_access_state() $function$;

CREATE OR REPLACE FUNCTION public.rm_test_open_report()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select rm_test_private.rm_test_open_report() $function$;

CREATE OR REPLACE FUNCTION public.rm_test_request_access()
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select rm_test_private.rm_test_request_access() $function$;

CREATE OR REPLACE FUNCTION public.rm_test_restore_report_data(p_copy jsonb)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select rm_test_private.rm_test_restore_report_data(p_copy) $function$;

CREATE OR REPLACE FUNCTION public.rm_test_review_access(p_user uuid, p_approve boolean)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select rm_test_private.rm_test_review_access(p_user,p_approve) $function$;

CREATE OR REPLACE FUNCTION public.rm_test_review_registration(p_user uuid, p_local text, p_sheet text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select rm_test_private.rm_test_review_registration(p_user,p_local,p_sheet) $function$;

CREATE OR REPLACE FUNCTION public.rm_test_set_permission(p_role text, p_action text, p_enabled boolean)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select rm_test_private.rm_test_set_permission(p_role,p_action,p_enabled) $function$;

CREATE OR REPLACE FUNCTION public.rm_test_submit_registration(p_name text, p_local text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select rm_test_private.rm_test_submit_registration(p_name,p_local) $function$;

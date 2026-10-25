import { rpc, accessApi } from "@/features/access/api";
import { createClient } from "@/lib/supabase/browser";
import type {
  Schedule,
  ScheduleContext,
  ScheduleRow,
  ScheduleComment,
} from "@/types/schedules";
export const schedulesApi = {
  companies: accessApi.companies,
  context: (company: string) =>
    rpc<ScheduleContext>("rm_app_schedule_context", { p_company: company }),
  async get(
    company: string,
    period: Schedule["period"],
    start: string,
  ): Promise<Schedule | null> {
    const { data, error } = await createClient()
      .from("rm_schedules")
      .select("*")
      .eq("company_id", company)
      .eq("period", period)
      .eq("starts_on", start)
      .maybeSingle();
    if (error) throw new Error("No se pudo cargar la planilla de horarios.");
    return data;
  },
  async history(
    company: string,
  ): Promise<Pick<Schedule, "id" | "period" | "starts_on" | "status">[]> {
    const { data, error } = await createClient()
      .from("rm_schedules")
      .select("id,period,starts_on,status")
      .eq("company_id", company)
      .order("starts_on", { ascending: false })
      .limit(52);
    if (error) throw new Error("No se pudieron consultar los períodos.");
    return data;
  },
  save: (
    company: string,
    period: Schedule["period"],
    start: string,
    rows: ScheduleRow[],
    notes: string,
    publish: boolean,
    version: number,
  ) =>
    rpc<Schedule>("rm_app_save_schedule", {
      p_company: company,
      p_period: period,
      p_start: start,
      p_rows: rows,
      p_notes: notes,
      p_publish: publish,
      p_version: version,
    }),
  async comments(schedule: string): Promise<ScheduleComment[]> {
    const { data, error } = await createClient()
      .from("rm_schedule_comments")
      .select("id,author_name,author_role,body,created_at")
      .eq("schedule_id", schedule)
      .order("created_at");
    if (error) throw new Error("No se pudieron consultar los mensajes.");
    return data;
  },
  comment: (schedule: string, body: string) =>
    rpc<void>("rm_app_schedule_comment", {
      p_schedule: schedule,
      p_body: body,
    }),
};

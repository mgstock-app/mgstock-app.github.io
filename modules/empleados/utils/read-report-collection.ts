import type { SupabaseClient } from "@supabase/supabase-js";
export interface ReportRow {
  path: string;
  organization_id?: string;
  data: Record<string, unknown>;
}
/** Read every visible row; PostgREST's page size must not truncate the history. */
export async function readReportCollection(
  client: SupabaseClient,
  collection: string,
  organizationId?: string,
): Promise<ReportRow[]> {
  const rows: ReportRow[] = [];
  let total = Number.POSITIVE_INFINITY;
  while (rows.length < total) {
    let query = client
      .from("rm_test_documents")
      .select("path,data,organization_id", rows.length === 0 ? { count: "exact" } : {})
      .eq("collection", collection);
    if (organizationId) query = query.eq("organization_id", organizationId);
    const { data, count, error } = await query
      .order("path")
      .range(rows.length, rows.length + 999);
    if (error) throw new Error("No se pudieron consultar los reportes.");
    if (count !== null) total = count;
    if (!data.length) break;
    rows.push(...data);
  }
  return rows;
}


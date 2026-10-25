import type { ReportConfig } from "@/types/report";
export const reportConfig: ReportConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  table: process.env.NEXT_PUBLIC_REPORT_DOCUMENTS_TABLE ?? "rm_test_documents",
  members: process.env.NEXT_PUBLIC_REPORT_MEMBERS_TABLE ?? "rm_test_members",
};

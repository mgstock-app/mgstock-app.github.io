"use client";
import { useReportWorkspace } from "@/hooks/use-report-workspace";
import { ReportMarkup } from "./ReportMarkup";
import type { AppLocal, AppUser } from "@/types/access";
export function ReportWorkspace({
  user,
  locals,
  scheduleInFolderOnly = false,
}: {
  user: AppUser;
  locals: AppLocal[];
  scheduleInFolderOnly?: boolean;
}) {
  const { root, error } = useReportWorkspace(user, locals);
  return (
    <div ref={root} className="report-workspace">
      {error && <p role="alert">{error}</p>}
      <ReportMarkup scheduleInFolderOnly={scheduleInFolderOnly} />
    </div>
  );
}

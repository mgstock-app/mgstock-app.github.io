import type { AppLocal } from "./access";
declare global {
  interface Window {
    REPORT_LOCALS?: AppLocal[];
    REPORT_IS_DEMO?: boolean;
    REPORT_PERMISSIONS?: { role: string; allowed: (action: string) => boolean };
    reportServices?: ReturnType<
      typeof import("@/features/reports/data-service").createReportServices
    > & { publish?: (id: string) => Promise<void>; recordWhatsapp?: (id: string, contact: { nombre: string; tel: string }, expectedUpdated: string | null) => Promise<void> };
    enforceReportUI?: (document: Document) => void;
    jspdf?: { jsPDF: typeof import("jspdf").jsPDF };
  }
}
export {};

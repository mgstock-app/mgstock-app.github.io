import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
export const metadata: Metadata = { title: "Condiciones de uso" };
export default function TermsPage() { return <LegalPage kind="terminos" />; }

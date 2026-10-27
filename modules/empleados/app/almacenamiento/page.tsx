import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
export const metadata: Metadata = { title: "Cookies y almacenamiento" };
export default function StoragePage() { return <LegalPage kind="almacenamiento" />; }

import type { NextConfig } from "next";

// Módulo «Administrar a los empleados» de GESTLOK: el cliente de ReciboNet se publica como
// páginas estáticas dentro de la misma aplicación (misma dirección, misma instalación PWA).
// Los datos siguen en el backend protegido de ReciboNet: cada operación la vuelven a
// comprobar sus RPC y políticas RLS. Solo se usan claves públicas (anon/publishable).
const rootBase = process.env.NEXT_PUBLIC_BASE_PATH || "";
const basePath = `${rootBase}/empleados`;

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  cacheComponents: false,
  env: {
    NEXT_PUBLIC_MODULE_BASE: basePath,
    NEXT_PUBLIC_GESTLOK_HOME: `${rootBase}/`,
    // Backend de ReciboNet («Reporte Mensual Mi gusto»). Valores públicos.
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://gpdrqxnqtofkkkqjsdqw.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_DABCgh_xyyGypJsRZDrflQ_b4rGdNIn",
    NEXT_PUBLIC_REPORT_DOCUMENTS_TABLE:
      process.env.NEXT_PUBLIC_REPORT_DOCUMENTS_TABLE ?? "rm_test_documents",
    NEXT_PUBLIC_REPORT_MEMBERS_TABLE:
      process.env.NEXT_PUBLIC_REPORT_MEMBERS_TABLE ?? "rm_test_members",
    // Backend de GESTLOK: solo para leer el nombre y logo autorizados de la empresa.
    NEXT_PUBLIC_GESTLOK_SUPABASE_URL:
      process.env.NEXT_PUBLIC_GESTLOK_SUPABASE_URL ?? "https://vgsepaaewbctjsjcpeta.supabase.co",
    NEXT_PUBLIC_GESTLOK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_GESTLOK_PUBLISHABLE_KEY ??
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnc2VwYWFld2JjdGpzamNwZXRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NDEwNjEsImV4cCI6MjEwODExNzA2MX0.WFeUP95DJAOOsiZ5BbBvqT1QURmA5KJLDjlDpwuU838",
  },
};

export default nextConfig;

import type { NextConfig } from "next";

// Módulo «Administrar a los empleados» de GESTLOK: el cliente de ReciboNet se publica como
// páginas estáticas dentro de la misma aplicación (misma dirección, misma instalación PWA).
// Los datos viven en la base de GESTLOK (tablas rm_* y funciones rm_app_*): cada operación la
// vuelven a comprobar sus RPC y políticas RLS. Ya no depende de ReciboNet. Solo se usan claves
// públicas (publishable).
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
    // Backend de GESTLOK (proyecto stockfabmunro). Valores públicos.
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://vgsepaaewbctjsjcpeta.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_Cyi_VNYXvQJvi6eIrivx3w_f4Fhzw9-",
    NEXT_PUBLIC_REPORT_DOCUMENTS_TABLE:
      process.env.NEXT_PUBLIC_REPORT_DOCUMENTS_TABLE ?? "rm_test_documents",
    NEXT_PUBLIC_REPORT_MEMBERS_TABLE:
      process.env.NEXT_PUBLIC_REPORT_MEMBERS_TABLE ?? "rm_test_members",
    // Misma base: lectura del nombre y logo autorizados de la empresa.
    NEXT_PUBLIC_GESTLOK_SUPABASE_URL:
      process.env.NEXT_PUBLIC_GESTLOK_SUPABASE_URL ?? "https://vgsepaaewbctjsjcpeta.supabase.co",
    NEXT_PUBLIC_GESTLOK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_GESTLOK_PUBLISHABLE_KEY ??
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnc2VwYWFld2JjdGpzamNwZXRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NDEwNjEsImV4cCI6MjEwODExNzA2MX0.WFeUP95DJAOOsiZ5BbBvqT1QURmA5KJLDjlDpwuU838",
  },
};

export default nextConfig;

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { accessApi } from "@/features/access/api";
import type { Company, Organization } from "@/types/access";
export function useOrganizationData() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const [orgs, firms] = await Promise.all([
        accessApi.organizations(),
        accessApi.companies(),
      ]);
      if (current !== sequence.current) return;
      setOrganizations((prev) =>
        JSON.stringify(prev) === JSON.stringify(orgs) ? prev : orgs,
      );
      setCompanies((prev) =>
        JSON.stringify(prev) === JSON.stringify(firms) ? prev : firms,
      );
      setError("");
    } catch (cause) {
      if (current !== sequence.current) return;
      setOrganizations([]);
      setCompanies([]);
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudieron cargar tus espacios.",
      );
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const invalidate = () => {
      sequence.current++;
    };
    queueMicrotask(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 15000);
    window.addEventListener("focus", refresh);
    return () => {
      invalidate();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  return { organizations, companies, loading, error, refresh };
}

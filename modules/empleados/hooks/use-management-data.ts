"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { accessApi } from "@/features/access/api";
import { createClient } from "@/lib/supabase/browser";
import { resolveOverviewSheetLocal } from "@/utils/overview-sheet-local";
import { readReportCollection } from "@/utils/read-report-collection";
import type { AppLocal, AppUser, Company, Organization } from "@/types/access";
export interface SheetOption {
  id: string;
  name: string;
  local: string;
}
export function useManagementData() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [locals, setLocals] = useState<AppLocal[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [sheets, setSheets] = useState<SheetOption[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const [nextUsers, nextLocals, rows, nextCompanies, nextOrganizations] = await Promise.all([
        accessApi.users(),
        accessApi.locals(),
        readReportCollection(createClient(), "hojas"),
        accessApi.companies(),
        accessApi.organizations(),
      ]);
      if (sequence.current !== current) return;
      setUsers(nextUsers);
      setLocals(nextLocals);
      setCompanies(nextCompanies);
      setOrganizations(nextOrganizations);
      setSheets(
        rows.map((row) => ({
          id: row.path.split("/")[1],
          name: String(row.data.nombre || row.data.nombreHoja || "Sin nombre"),
          local: resolveOverviewSheetLocal(row, nextLocals.filter((local) => local.organization_id === row.organization_id).map((local) => local.id)) || "",
        })),
      );
      return true;
    } catch (cause) {
      if (sequence.current === current) {
        setUsers([]);
        setLocals([]);
        setCompanies([]);
        setOrganizations([]);
        setSheets([]);
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudieron cargar los usuarios.",
        );
      }
      return false;
    } finally {
      if (sequence.current === current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void refresh());
    const invalidate = () => {
      sequence.current++;
    };
    return invalidate;
  }, [refresh]);
  return { users, locals, companies, organizations, sheets, error, loading, refresh };
}


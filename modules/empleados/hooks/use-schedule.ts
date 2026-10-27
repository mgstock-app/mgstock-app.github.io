"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { schedulesApi } from "@/features/schedules/api";
import type { Schedule, ScheduleContext } from "@/types/schedules";
export function useSchedule(
  company: string,
  period: Schedule["period"],
  start: string,
) {
  const sequence = useRef(0);
  const key = `${company}:${period}:${start}`;
  const [result, setResult] = useState<{
    key: string;
    schedule: Schedule | null;
    context: ScheduleContext;
    history: Awaited<ReturnType<typeof schedulesApi.history>>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setResult(null);
    setError("");
    if (!company || !start) {
      setLoading(false);
      return;
    }
    try {
      const [context, schedule, history] = await Promise.all([
        schedulesApi.context(company),
        schedulesApi.get(company, period, start),
        schedulesApi.history(company),
      ]);
      if (sequence.current === current)
        setResult({
          key: `${company}:${period}:${start}`,
          context,
          schedule,
          history,
        });
    } catch (cause) {
      if (sequence.current === current)
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudieron cargar los horarios.",
        );
    } finally {
      if (sequence.current === current) setLoading(false);
    }
  }, [company, period, start]);
  useEffect(() => {
    queueMicrotask(() => void refresh());
    const invalidate = () => {
      sequence.current++;
    };
    return invalidate;
  }, [refresh]);
  return {
    result: result?.key === key ? result : null,
    loading,
    error,
    refresh,
  };
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LocalProcessRecord } from "@/lib/local-process";

type UseLocalProcessesOptions = {
  hasMounted: boolean;
  setError: (value: string | null) => void;
};

export function useLocalProcesses({
  hasMounted,
  setError,
}: UseLocalProcessesOptions) {
  const [localProcesses, setLocalProcesses] = useState<LocalProcessRecord[]>([]);
  const [serviceLogsById, setServiceLogsById] = useState<Record<string, string>>({});
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [serviceActionId, setServiceActionId] = useState<string | null>(null);

  const loadLocalProcesses = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setServicesLoading(true);
    }
    try {
      const response = await fetch("/api/local-processes", { cache: "no-store" });
      const payload = (await response.json()) as { processes?: LocalProcessRecord[] };
      if (!response.ok) {
        throw new Error("Failed to load local services");
      }
      setLocalProcesses(Array.isArray(payload.processes) ? payload.processes : []);
    } catch {
      // Ignore service refresh failures.
    } finally {
      if (!options?.silent) {
        setServicesLoading(false);
      }
    }
  }, []);

  const loadServiceLogs = useCallback(async (processId: string) => {
    try {
      const response = await fetch(`/api/local-processes/${processId}/logs?lines=80`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { output?: string };
      if (!response.ok) {
        throw new Error("Failed to load service logs");
      }
      setServiceLogsById((previous) => ({
        ...previous,
        [processId]: payload.output ?? "",
      }));
    } catch {
      setServiceLogsById((previous) => ({
        ...previous,
        [processId]: "Unable to load logs.",
      }));
    }
  }, []);

  useEffect(() => {
    void loadLocalProcesses();
    const timer = window.setInterval(() => {
      void loadLocalProcesses({ silent: true });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadLocalProcesses]);

  useEffect(() => {
    if (!expandedServiceId) return;
    void loadServiceLogs(expandedServiceId);
    const timer = window.setInterval(() => {
      void loadServiceLogs(expandedServiceId);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [expandedServiceId, loadServiceLogs]);

  const visibleLocalProcesses = useMemo(
    () => localProcesses.filter((entry) => entry.status === "running"),
    [localProcesses],
  );

  useEffect(() => {
    if (!expandedServiceId) return;
    if (!visibleLocalProcesses.some((process) => process.id === expandedServiceId)) {
      setExpandedServiceId(null);
    }
  }, [expandedServiceId, visibleLocalProcesses]);

  const showLocalServicesPanel = hasMounted && visibleLocalProcesses.length > 0;

  const handleStopLocalProcess = useCallback(async (processId: string) => {
    setServiceActionId(processId);
    try {
      const response = await fetch(`/api/local-processes/${processId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to stop local process");
      }
      await loadLocalProcesses({ silent: true });
      if (expandedServiceId === processId) {
        await loadServiceLogs(processId);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to stop local process");
    } finally {
      setServiceActionId(null);
    }
  }, [expandedServiceId, loadLocalProcesses, loadServiceLogs, setError]);

  return {
    localProcesses,
    serviceLogsById,
    expandedServiceId,
    setExpandedServiceId,
    servicesLoading,
    serviceActionId,
    visibleLocalProcesses,
    showLocalServicesPanel,
    loadLocalProcesses,
    loadServiceLogs,
    handleStopLocalProcess,
  };
}

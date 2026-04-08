"use client";

import { useSyncExternalStore } from "react";
import MultiAgentTestClientPage from "./client-page";

export default function MultiAgentTestPage() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) {
    return <div className="h-screen bg-[#0b0d12]" />;
  }

  return <MultiAgentTestClientPage />;
}

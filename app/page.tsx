"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircleIcon } from "lucide-react";
import { LAST_ACTIVE_THREAD_STORAGE_KEY } from "@/lib/thread-session";

const createThreadId = () => `thread-${crypto.randomUUID()}`;

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const replaceThread = (threadId: string) => {
      if (!cancelled) {
        router.replace(`/${threadId}`);
      }
    };

    const restoreLastThread = async () => {
      let storedThreadId: string | null = null;

      try {
        const raw = window.localStorage.getItem(LAST_ACTIVE_THREAD_STORAGE_KEY)?.trim();
        storedThreadId = raw ? raw : null;
      } catch {
        // Ignore storage errors.
      }

      if (storedThreadId) {
        try {
          const response = await fetch(`/api/threads/${storedThreadId}`, {
            cache: "no-store",
          });

          if (response.ok) {
            replaceThread(storedThreadId);
            return;
          }
        } catch {
          // Fall back to the latest known thread.
        }
      }

      try {
        const response = await fetch("/api/threads?limit=1", { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json()) as {
            threads?: Array<{ id?: string }>;
          };
          const latestThreadId = payload.threads?.[0]?.id;
          if (typeof latestThreadId === "string" && latestThreadId.trim()) {
            replaceThread(latestThreadId.trim());
            return;
          }
        }
      } catch {
        // Fall through to creating a fresh thread route.
      }

      replaceThread(createThreadId());
    };

    void restoreLastThread();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0c11] text-sm text-foreground/75">
      <div className="flex items-center gap-2">
        <LoaderCircleIcon className="size-4 animate-spin" />
        <span>正在恢复上次会话…</span>
      </div>
    </div>
  );
}

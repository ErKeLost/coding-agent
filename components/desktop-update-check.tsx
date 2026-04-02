"use client";

import { useEffect, useRef } from "react";
import { RefreshCwIcon } from "lucide-react";
import { gooeyToast } from "goey-toast";
import { isTauriDesktop } from "@/lib/desktop-workspace";

const UPDATER_ENABLED = process.env.NEXT_PUBLIC_TAURI_UPDATER_ENABLED === "1";

export function DesktopUpdateCheck() {
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (!UPDATER_ENABLED || !isTauriDesktop() || hasCheckedRef.current) {
      return;
    }

    hasCheckedRef.current = true;

    const run = async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (!update) return;

        gooeyToast.info(`发现新版本 ${update.version}`, {
          description: update.body ?? "可以现在下载并安装更新。",
          icon: <RefreshCwIcon className="size-4" />,
          duration: Infinity,
          action: {
            label: "安装更新",
            onClick: () => {
              void (async () => {
                const toastId = gooeyToast.loading("正在下载更新…", {
                  duration: Infinity,
                });
                try {
                  let downloaded = 0;
                  let total = 0;
                  await update.downloadAndInstall((event) => {
                    if (event.event === "Started") {
                      total = event.data.contentLength ?? 0;
                    } else if (event.event === "Progress") {
                      downloaded += event.data.chunkLength;
                      if (total > 0) {
                        const pct = Math.round((downloaded / total) * 100);
                        gooeyToast.loading(`正在下载更新… ${pct}%`, { id: toastId, duration: Infinity });
                      }
                    } else if (event.event === "Finished") {
                      gooeyToast.loading("正在安装，即将重启…", { id: toastId, duration: Infinity });
                    }
                  });
                  gooeyToast.success("更新已安装，重启应用后生效。", { id: toastId });
                } catch (error) {
                  gooeyToast.error(
                    error instanceof Error ? error.message : "更新安装失败",
                    { id: toastId },
                  );
                }
              })();
            },
          },
        });
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[desktop-updater] check failed", error);
        }
      }
    };

    void run();
  }, []);

  return null;
}

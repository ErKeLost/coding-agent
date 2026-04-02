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
                const toastId = gooeyToast.info("正在下载更新… 0%", {
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
                      const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
                      gooeyToast.update(toastId, {
                        title: `正在下载更新… ${pct}%`,
                        type: "info",
                      });
                    } else if (event.event === "Finished") {
                      gooeyToast.update(toastId, {
                        title: "正在安装，即将重启…",
                        type: "info",
                      });
                    }
                  });
                  // 安装完成后自动重启应用
                  const { relaunch } = await import("@tauri-apps/plugin-process");
                  await relaunch();
                } catch (error) {
                  gooeyToast.error(
                    error instanceof Error ? error.message : "更新安装失败",
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

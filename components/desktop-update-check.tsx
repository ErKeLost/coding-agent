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

        const toastId = gooeyToast.info(`发现新版本 ${update.version}`, {
          description: update.body ?? "正在后台下载并安装更新。",
          icon: <RefreshCwIcon className="size-4" />,
          duration: Infinity,
        });

        try {
          let downloaded = 0;
          let total = 0;

          await update.downloadAndInstall((event) => {
            if (event.event === "Started") {
              total = event.data.contentLength ?? 0;
              gooeyToast.update(toastId, {
                title: `正在下载更新… 0%`,
                description: "更新包已开始下载。",
                type: "info",
              });
              return;
            }

            if (event.event === "Progress") {
              downloaded += event.data.chunkLength;
              const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
              gooeyToast.update(toastId, {
                title: `正在下载更新… ${pct}%`,
                description: "更新会在安装完成后等待你手动重启。",
                type: "info",
              });
              return;
            }

            if (event.event === "Finished") {
              gooeyToast.update(toastId, {
                title: "更新已准备完成",
                description: "新版本已经下载并安装完成，点击即可重启应用。",
                type: "success",
                action: {
                  label: "立即重启",
                  onClick: () => {
                    void (async () => {
                      try {
                        gooeyToast.update(toastId, {
                          title: "正在重启应用",
                          description: "如果几秒内没有关闭，请稍后手动重启。",
                          type: "info",
                        });

                        const { relaunch } = await import("@tauri-apps/plugin-process");
                        await relaunch();
                      } catch (error) {
                        gooeyToast.update(toastId, {
                          title: "自动重启失败",
                          description:
                            error instanceof Error
                              ? error.message
                              : "应用暂时无法自动重启，请手动退出后重新打开。",
                          type: "error",
                        });

                        if (process.env.NODE_ENV !== "production") {
                          console.warn("[desktop-updater] relaunch failed", error);
                        }
                      }
                    })();
                  },
                },
              });
            }
          });
        } catch (error) {
          gooeyToast.update(toastId, {
            title: "更新安装失败",
            description:
              error instanceof Error ? error.message : "更新安装失败，请稍后重试。",
            type: "error",
          });
        }
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

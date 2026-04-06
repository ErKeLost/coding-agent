"use client";

import { useEffect, useRef } from "react";
import { RefreshCwIcon } from "lucide-react";
import { gooeyToast } from "goey-toast";
import { isTauriDesktop } from "@/lib/desktop-workspace";

const UPDATER_ENABLED = process.env.NEXT_PUBLIC_TAURI_UPDATER_ENABLED === "1";
const CHUNK_RELOAD_GUARD_KEY = "desktop-chunk-reload-at";
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;
const UPDATE_PENDING_VERSION_KEY = "desktop-update-pending-version";
const UPDATE_FAILED_VERSION_KEY = "desktop-update-failed-version";

const getStoredValue = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const setStoredValue = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors.
  }
};

const removeStoredValue = (key: string) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
};

const getErrorMessage = (value: unknown) => {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  return "";
};

const isChunkLoadFailure = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("chunkloaderror") ||
    normalized.includes("failed to load chunk") ||
    normalized.includes("loading chunk") ||
    normalized.includes("/_next/static/chunks/")
  );
};

export function DesktopUpdateCheck() {
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (!UPDATER_ENABLED || !isTauriDesktop()) {
      return;
    }

    const reconcilePendingUpdate = async () => {
      const pendingVersion = getStoredValue(UPDATE_PENDING_VERSION_KEY);
      if (!pendingVersion) return;

      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const currentVersion = await getVersion();

        if (currentVersion === pendingVersion) {
          removeStoredValue(UPDATE_PENDING_VERSION_KEY);
          removeStoredValue(UPDATE_FAILED_VERSION_KEY);

          gooeyToast.success(`已更新到 ${currentVersion}`, {
            description: "应用已经切换到新版本。",
            duration: 2400,
          });
          return;
        }

        setStoredValue(UPDATE_FAILED_VERSION_KEY, pendingVersion);
        removeStoredValue(UPDATE_PENDING_VERSION_KEY);

        gooeyToast.error("更新后版本没有切换成功", {
          description: `目标版本 ${pendingVersion} 没有生效，已暂停自动重试，避免反复下载。请确认你启动的是安装后的正式应用，而不是旧副本或磁盘镜像里的应用。`,
          duration: 8000,
        });
      } catch {
        // Ignore version probe failures and let the normal updater flow proceed.
      }
    };

    void reconcilePendingUpdate();
  }, []);

  useEffect(() => {
    if (!isTauriDesktop()) {
      return;
    }

    const recoverFromChunkFailure = () => {
      let lastReloadAt = 0;
      try {
        lastReloadAt = Number(window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) ?? "0");
      } catch {
        // Ignore storage errors.
      }

      if (Date.now() - lastReloadAt < CHUNK_RELOAD_COOLDOWN_MS) {
        gooeyToast.error("界面资源加载失败", {
          description: "检测到更新后的旧资源引用。请手动重启应用；如果只是前端资源未刷新，也可以先刷新界面。",
          action: {
            label: "刷新界面",
            onClick: () => window.location.reload(),
          },
        });
        return;
      }

      try {
        window.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(Date.now()));
      } catch {
        // Ignore storage errors.
      }

      gooeyToast.info("检测到界面资源更新", {
        description: "正在刷新界面以恢复最新资源。",
        duration: 1800,
      });

      window.setTimeout(() => {
        window.location.reload();
      }, 120);
    };

    const handleWindowError = (event: ErrorEvent) => {
      const message = event.message || getErrorMessage(event.error);
      if (!isChunkLoadFailure(message)) {
        return;
      }

      event.preventDefault();
      recoverFromChunkFailure();
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = getErrorMessage(event.reason);
      if (!isChunkLoadFailure(message)) {
        return;
      }

      event.preventDefault();
      recoverFromChunkFailure();
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    if (!UPDATER_ENABLED || !isTauriDesktop() || hasCheckedRef.current) {
      return;
    }

    hasCheckedRef.current = true;

    const run = async () => {
      try {
        const failedVersion = getStoredValue(UPDATE_FAILED_VERSION_KEY);
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (!update) return;

        if (failedVersion === update.version) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[desktop-updater] skipped retry for previously failed version", update.version);
          }
          return;
        }

        if (failedVersion && failedVersion !== update.version) {
          removeStoredValue(UPDATE_FAILED_VERSION_KEY);
        }

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
                        setStoredValue(UPDATE_PENDING_VERSION_KEY, update.version);
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
                          description: "更新已经安装，但应用暂时无法自动重启。可以先刷新界面；如果仍异常，请手动退出后重新打开。",
                          type: "error",
                          action: {
                            label: "刷新界面",
                            onClick: () => window.location.reload(),
                          },
                        });

                        if (process.env.NODE_ENV !== "production") {
                          console.warn("[desktop-updater] relaunch failed", error);
                        }

                        removeStoredValue(UPDATE_PENDING_VERSION_KEY);
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

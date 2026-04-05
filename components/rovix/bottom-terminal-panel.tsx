"use client";

import "xterm/css/xterm.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/button";
import {
  listenDesktopTerminalOutput,
  openExternalUrl,
  readDesktopTerminalSession,
  resizeDesktopTerminalSession,
  startDesktopTerminalSession,
  stopDesktopTerminalSession,
  writeDesktopTerminalSession,
} from "@/lib/desktop-workspace";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

type BottomTerminalPanelProps = {
  workspaceRoot: string | null;
  isDesktopRuntime: boolean;
  onOpenSystemTerminal?: () => void | Promise<void>;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

type TerminalSessionRecord = {
  sessionId: string;
  shell: string;
  cwd: string;
  label: string;
  offset: number;
};

type WorkspaceTerminalState = {
  activeSessionId: string | null;
  sessions: TerminalSessionRecord[];
  nextLabelIndex: number;
};

type XTermTerminal = import("xterm").Terminal;
type XTermDisposable = { dispose: () => void };

const FALLBACK_SURFACE_LIGHT = "#f3eee6";
const FALLBACK_SURFACE_DARK = "#171f26";

function workspaceLabel(path: string | null) {
  if (!path) return "未选择目录";
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function resolveCssColor(value: string, fallback: string) {
  if (typeof window === "undefined" || !value.trim()) return fallback;
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.pointerEvents = "none";
  probe.style.opacity = "0";
  probe.style.backgroundColor = value;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return resolved && resolved !== "rgba(0, 0, 0, 0)" ? resolved : fallback;
}

function resolveThemeToken(
  tokenName: string,
  fallback: string,
  property: "backgroundColor" | "color" = "backgroundColor",
) {
  if (typeof window === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.pointerEvents = "none";
  probe.style.opacity = "0";
  probe.style[property] = `var(${tokenName})`;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe)[property];
  probe.remove();
  return resolved && resolved !== "rgba(0, 0, 0, 0)" ? resolved : fallback;
}

function createWorkspaceState(): WorkspaceTerminalState {
  return {
    activeSessionId: null,
    sessions: [],
    nextLabelIndex: 1,
  };
}

function getErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "";
}

function isSessionMissingError(error: unknown) {
  return /terminal session not found/i.test(getErrorMessage(error));
}

export function BottomTerminalPanel({
  workspaceRoot,
  isDesktopRuntime,
  expanded,
}: BottomTerminalPanelProps) {
  const { resolvedTheme, colorTheme } = useTheme();
  const workspaceStatesRef = useRef<Record<string, WorkspaceTerminalState>>({});
  const terminalMapRef = useRef<Map<string, XTermTerminal>>(new Map());
  const fitMapRef = useRef<Map<string, FitAddon>>(new Map());
  const mountMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const unlistenMapRef = useRef<Map<string, () => void>>(new Map());
  const resizeObserverMapRef = useRef<Map<string, ResizeObserver>>(new Map());
  const linkProviderMapRef = useRef<Map<string, XTermDisposable>>(new Map());
  const queueMapRef = useRef<Map<string, Promise<void>>>(new Map());
  const disposedSessionIdsRef = useRef<Set<string>>(new Set());
  const workspaceRootRef = useRef<string | null>(workspaceRoot);

  const [internalExpanded] = useState(true);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    "creating" | "closing" | null
  >(null);
  const isExpanded = expanded ?? internalExpanded;

  const terminalSurface = useMemo(() => {
    const fallback =
      resolvedTheme === "dark" ? FALLBACK_SURFACE_DARK : FALLBACK_SURFACE_LIGHT;
    if (typeof window === "undefined") return fallback;
    return resolveThemeToken("--terminal-surface", fallback);
  }, [colorTheme, resolvedTheme]);

  const terminalPalette = useMemo(() => {
    const fallbackForeground = resolvedTheme === "dark" ? "#e8ecef" : "#433528";
    const fallbackCursor = resolvedTheme === "dark" ? "#f4efe7" : "#5b4a37";
    const fallbackBlue = resolvedTheme === "dark" ? "#72a8ff" : "#5c7edb";
    if (typeof window === "undefined") {
      return {
        background: "rgba(0, 0, 0, 0)",
        foreground: fallbackForeground,
        cursor: fallbackCursor,
        cursorAccent: terminalSurface,
        black: terminalSurface,
        red: resolvedTheme === "dark" ? "#f38b8b" : "#c25757",
        green: resolvedTheme === "dark" ? "#5fd49c" : "#2f8b61",
        yellow: resolvedTheme === "dark" ? "#f2c46d" : "#b9851f",
        blue: fallbackBlue,
        magenta: resolvedTheme === "dark" ? "#c99dff" : "#9665dd",
        cyan: resolvedTheme === "dark" ? "#66cdda" : "#2f8fa4",
        white: resolvedTheme === "dark" ? "#eef2f7" : "#5b4732",
        brightBlack: resolvedTheme === "dark" ? "#6c7a89" : "#aa9987",
        brightRed: resolvedTheme === "dark" ? "#ffb0b0" : "#d86969",
        brightGreen: resolvedTheme === "dark" ? "#83e3b6" : "#42a878",
        brightYellow: resolvedTheme === "dark" ? "#f7d58c" : "#cd9a2f",
        brightBlue: resolvedTheme === "dark" ? "#9bc0ff" : "#7a97eb",
        brightMagenta: resolvedTheme === "dark" ? "#deb6ff" : "#b38bf0",
        brightCyan: resolvedTheme === "dark" ? "#93e5eb" : "#56b9c9",
        brightWhite: resolvedTheme === "dark" ? "#ffffff" : "#433326",
      };
    }
    const readVar = (
      name: string,
      fallback: string,
      property: "backgroundColor" | "color" = "backgroundColor",
    ) => resolveThemeToken(name, fallback, property);
    return {
      background: "rgba(0, 0, 0, 0)",
      foreground: readVar("--terminal-text", fallbackForeground, "color"),
      cursor: readVar("--foreground", fallbackCursor, "color"),
      cursorAccent: terminalSurface,
      black: terminalSurface,
      red: resolvedTheme === "dark" ? "#f38b8b" : "#c25757",
      green: resolvedTheme === "dark" ? "#5fd49c" : "#2f8b61",
      yellow: resolvedTheme === "dark" ? "#f2c46d" : "#b9851f",
      blue: readVar("--terminal-accent", fallbackBlue, "color"),
      magenta: resolvedTheme === "dark" ? "#c99dff" : "#9665dd",
      cyan: resolvedTheme === "dark" ? "#66cdda" : "#2f8fa4",
      white: resolvedTheme === "dark" ? "#eef2f7" : "#5b4732",
      brightBlack: resolvedTheme === "dark" ? "#6c7a89" : "#aa9987",
      brightRed: resolvedTheme === "dark" ? "#ffb0b0" : "#d86969",
      brightGreen: resolvedTheme === "dark" ? "#83e3b6" : "#42a878",
      brightYellow: resolvedTheme === "dark" ? "#f7d58c" : "#cd9a2f",
      brightBlue: resolvedTheme === "dark" ? "#9bc0ff" : "#7a97eb",
      brightMagenta: resolvedTheme === "dark" ? "#deb6ff" : "#b38bf0",
      brightCyan: resolvedTheme === "dark" ? "#93e5eb" : "#56b9c9",
      brightWhite: resolvedTheme === "dark" ? "#ffffff" : "#433326",
    };
  }, [colorTheme, resolvedTheme, terminalSurface]);

  const workspaceState = useMemo(() => {
    if (!workspaceRoot) return null;
    return workspaceStatesRef.current[workspaceRoot] ?? createWorkspaceState();
  }, [workspaceRoot, tick]);

  const activeSessionId = useMemo(() => {
    const sessions = workspaceState?.sessions ?? [];
    if (!sessions.length) return null;
    const current = workspaceState?.activeSessionId ?? null;
    if (current && sessions.some((session) => session.sessionId === current)) {
      return current;
    }
    return sessions[0]?.sessionId ?? null;
  }, [workspaceState?.activeSessionId, workspaceState?.sessions]);

  const syncWorkspaceState = useCallback(
    (
      path: string,
      updater: (current: WorkspaceTerminalState) => WorkspaceTerminalState,
    ) => {
      const current =
        workspaceStatesRef.current[path] ?? createWorkspaceState();
      workspaceStatesRef.current[path] = updater(current);
      setTick((value) => value + 1);
    },
    [],
  );

  const getSessionRecord = useCallback((path: string, sessionId: string) => {
    const current = workspaceStatesRef.current[path];
    return (
      current?.sessions.find((item) => item.sessionId === sessionId) ?? null
    );
  }, []);

  const applyThemeToTerminal = useCallback(
    (sessionId: string) => {
      const terminal = terminalMapRef.current.get(sessionId);
      const mount = mountMapRef.current.get(sessionId);
      if (!terminal || !mount) return;
      terminal.options.theme = { ...terminalPalette };
      mount.style.backgroundColor = terminalSurface;
      mount
        .querySelectorAll<HTMLElement>(
          ".xterm, .xterm-viewport, .xterm-screen, .xterm-rows, .xterm-scroll-area, canvas",
        )
        .forEach((node) => {
          node.style.backgroundColor = "transparent";
        });
    },
    [terminalPalette, terminalSurface],
  );

  const syncTerminalSize = useCallback((sessionId: string) => {
    const terminal = terminalMapRef.current.get(sessionId);
    const fitAddon = fitMapRef.current.get(sessionId);
    if (!terminal || !fitAddon) return;
    if (!terminal.element || !terminal.element.isConnected) return;
    try {
      fitAddon.fit();
    } catch {
      return;
    }
    void resizeDesktopTerminalSession(sessionId, terminal.cols, terminal.rows).catch(
      (err) => {
        if (isSessionMissingError(err)) return;
        setError(getErrorMessage(err) || "Failed to resize terminal");
      },
    );
  }, []);

  const writeOutputToTerminal = useCallback(
    (sessionId: string, output: string) => {
      if (!output) return true;
      const terminal = terminalMapRef.current.get(sessionId);
      if (!terminal) return false;
      try {
        terminal.write(output);
        return true;
      } catch {
        // Renderer can be temporarily unavailable during mount/switch.
        return false;
      }
    },
    [],
  );

  const openTerminalLink = useCallback(
    (rawUrl: string) => {
      const trimmed = rawUrl.trim();
      if (!trimmed) return;
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
        void openExternalUrl(parsed.toString());
      } catch {
        // Ignore malformed URLs from terminal output.
      }
    },
    [],
  );

  const ensureTerminalInstance = useCallback(
    async (sessionId: string) => {
      const mount = mountMapRef.current.get(sessionId);
      if (!mount || terminalMapRef.current.has(sessionId)) return;
      // Do not initialize xterm while panel is hidden or container has no size.
      // Creating the renderer at 0x0 can leave the first terminal blank/unusable.
      if (!isExpanded || mount.offsetParent === null) {
        return;
      }
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("xterm"),
        import("@xterm/addon-fit"),
      ]);

      const terminal = new Terminal({
        allowProposedApi: false,
        allowTransparency: true,
        convertEol: false,
        cursorBlink: true,
        cursorStyle: "block",
        fontFamily:
          '"JetBrainsMono Nerd Font", "MesloLGS NF", var(--font-geist-mono), "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        fontSize: 11,
        fontWeight: "400",
        lineHeight: 1.28,
        letterSpacing: 0,
        scrollback: 5000,
        theme: { ...terminalPalette },
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(mount);
      disposedSessionIdsRef.current.delete(sessionId);

      const linkProviderDisposable = terminal.registerLinkProvider({
        provideLinks: (y, callback) => {
          const line = terminal.buffer.active.getLine(y - 1);
          const text = line?.translateToString(true) ?? "";
          const links: Array<{
            text: string;
            range: {
              start: { x: number; y: number };
              end: { x: number; y: number };
            };
            activate: () => void;
          }> = [];
          const urlPattern = /\bhttps?:\/\/[^\s<>"'`]+/g;
          let match: RegExpExecArray | null = null;

          while ((match = urlPattern.exec(text))) {
            const raw = match[0].replace(/[),.;!?]+$/, "");
            const start = match.index + 1;
            const end = start + raw.length - 1;
            if (end < start) continue;
            links.push({
              text: raw,
              range: {
                start: { x: start, y },
                end: { x: end, y },
              },
              activate: () => openTerminalLink(raw),
            });
          }

          callback(links);
        },
      });
      linkProviderMapRef.current.set(sessionId, linkProviderDisposable);

      terminal.onData((data) => {
        if (disposedSessionIdsRef.current.has(sessionId)) return;
        const currentQueue =
          queueMapRef.current.get(sessionId) ?? Promise.resolve();
        const nextQueue = currentQueue
          .then(async () => {
            if (disposedSessionIdsRef.current.has(sessionId)) return;
            await writeDesktopTerminalSession(sessionId, data);
          })
          .catch((err) => {
            if (isSessionMissingError(err)) return;
            setError(getErrorMessage(err) || "Failed to write terminal input");
          });
        queueMapRef.current.set(sessionId, nextQueue);
      });

      const observer = new ResizeObserver(() => {
        if (activeSessionId === sessionId && isExpanded) {
          syncTerminalSize(sessionId);
        }
      });
      observer.observe(mount);

      terminalMapRef.current.set(sessionId, terminal);
      fitMapRef.current.set(sessionId, fitAddon);
      resizeObserverMapRef.current.set(sessionId, observer);
      applyThemeToTerminal(sessionId);
      if (activeSessionId === sessionId && isExpanded) {
        syncTerminalSize(sessionId);
      }
    },
    [
      activeSessionId,
      applyThemeToTerminal,
      isExpanded,
      openTerminalLink,
      syncTerminalSize,
      terminalPalette,
    ],
  );

  const ensureSessionListener = useCallback(
    async (path: string, session: TerminalSessionRecord) => {
      if (!terminalMapRef.current.has(session.sessionId)) return;
      if (unlistenMapRef.current.has(session.sessionId)) return;
      const unlisten = await listenDesktopTerminalOutput(
        session.sessionId,
        (payload) => {
          if (disposedSessionIdsRef.current.has(session.sessionId)) return;
          const currentWorkspace = workspaceStatesRef.current[path];
          const currentSession = currentWorkspace?.sessions.find(
            (item) => item.sessionId === session.sessionId,
          );
          // Ignore stale/duplicate chunks that we've already applied.
          if (
            currentSession &&
            payload.nextOffset <= (currentSession.offset ?? 0)
          ) {
            return;
          }
          if (payload.output) {
            const applied = writeOutputToTerminal(
              session.sessionId,
              payload.output,
            );
            if (!applied) {
              // Keep offset unchanged so content can be replayed on next hydrate.
              return;
            }
          }
          if (currentSession) {
            currentSession.offset = payload.nextOffset ?? currentSession.offset;
          }
        },
      );
      unlistenMapRef.current.set(session.sessionId, unlisten);
    },
    [writeOutputToTerminal],
  );

  const hydrateSession = useCallback(
    async (path: string, session: TerminalSessionRecord) => {
      try {
        await ensureTerminalInstance(session.sessionId);
        if (!terminalMapRef.current.has(session.sessionId)) return;
        await ensureSessionListener(path, session);
        const currentWorkspace = workspaceStatesRef.current[path];
        const currentSession =
          currentWorkspace?.sessions.find(
            (item) => item.sessionId === session.sessionId,
          ) ?? session;
        const payload = await readDesktopTerminalSession(
          session.sessionId,
          currentSession.offset,
        );
        if (payload.output) {
          const applied = writeOutputToTerminal(
            session.sessionId,
            payload.output,
          );
          if (!applied) {
            // Do not advance offset; retry on next hydrate/select.
            return;
          }
        }
        currentSession.offset = payload.nextOffset ?? currentSession.offset;
        if (activeSessionId === session.sessionId && isExpanded) {
          window.requestAnimationFrame(() => {
            syncTerminalSize(session.sessionId);
            terminalMapRef.current.get(session.sessionId)?.focus();
          });
        }
      } catch (err) {
        if (isSessionMissingError(err)) return;
        setError(getErrorMessage(err) || "Failed to hydrate terminal");
      }
    },
    [
      activeSessionId,
      ensureSessionListener,
      ensureTerminalInstance,
      isExpanded,
      syncTerminalSize,
      writeOutputToTerminal,
    ],
  );

  const setMountNode = useCallback(
    (sessionId: string, node: HTMLDivElement | null) => {
      if (!node) {
        mountMapRef.current.delete(sessionId);
        return;
      }
      // Re-attaching viewport for an existing session should reactivate it.
      disposedSessionIdsRef.current.delete(sessionId);
      const previousNode = mountMapRef.current.get(sessionId);
      if (previousNode === node) {
        if (isExpanded && !terminalMapRef.current.has(sessionId)) {
          const currentPath = workspaceRootRef.current;
          const currentSession = currentPath
            ? getSessionRecord(currentPath, sessionId)
            : null;
          if (currentPath && currentSession) {
            void hydrateSession(currentPath, currentSession);
          } else {
            void ensureTerminalInstance(sessionId);
          }
        }
        return;
      }
      mountMapRef.current.set(sessionId, node);
      const currentPath = workspaceRootRef.current;
      const currentSession = currentPath
        ? getSessionRecord(currentPath, sessionId)
        : null;
      if (!isExpanded) {
        return;
      }
      if (currentPath && currentSession) {
        void hydrateSession(currentPath, currentSession);
        return;
      }
      void ensureTerminalInstance(sessionId);
    },
    [ensureTerminalInstance, getSessionRecord, hydrateSession, isExpanded],
  );

  const createSession = useCallback(
    async (path: string) => {
      const current =
        workspaceStatesRef.current[path] ?? createWorkspaceState();
      const payload = await startDesktopTerminalSession(path);
      const session: TerminalSessionRecord = {
        sessionId: payload.sessionId,
        shell: payload.shell ?? "/bin/zsh",
        cwd: payload.cwd ?? path,
        label: `终端 ${current.nextLabelIndex}`,
        offset: 0,
      };
      syncWorkspaceState(path, (state) => ({
        activeSessionId: session.sessionId,
        sessions: [...state.sessions, session],
        nextLabelIndex: state.nextLabelIndex + 1,
      }));
      // Wake up prompt output for shells that don't print until first input.
      void writeDesktopTerminalSession(session.sessionId, "\n").catch(() => {});
      return session;
    },
    [syncWorkspaceState],
  );

  const handleCreateSession = useCallback(async () => {
    if (!workspaceRoot || !isDesktopRuntime) return;
    try {
      setPendingAction("creating");
      setError(null);
      const session = await createSession(workspaceRoot);
      await hydrateSession(workspaceRoot, session);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create terminal",
      );
    } finally {
      setPendingAction(null);
    }
  }, [createSession, hydrateSession, isDesktopRuntime, workspaceRoot]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (!workspaceRoot) return;
      syncWorkspaceState(workspaceRoot, (state) => ({
        ...state,
        activeSessionId: sessionId,
      }));
      const currentSession = getSessionRecord(workspaceRoot, sessionId);
      if (currentSession) {
        void hydrateSession(workspaceRoot, currentSession);
      }
      window.requestAnimationFrame(() => {
        syncTerminalSize(sessionId);
        terminalMapRef.current.get(sessionId)?.focus();
      });
    },
    [
      getSessionRecord,
      hydrateSession,
      syncTerminalSize,
      syncWorkspaceState,
      workspaceRoot,
    ],
  );

  const handleCloseSession = useCallback(
    async (sessionId: string) => {
      if (!workspaceRoot) return;
      const current = workspaceStatesRef.current[workspaceRoot];
      if (!current) return;
      const closingIndex = current.sessions.findIndex(
        (item) => item.sessionId === sessionId,
      );
      if (closingIndex === -1) return;

      try {
        setPendingAction("closing");
        setError(null);
        try {
          await stopDesktopTerminalSession(sessionId);
        } catch (err) {
          if (!isSessionMissingError(err)) throw err;
        }

        unlistenMapRef.current.get(sessionId)?.();
        unlistenMapRef.current.delete(sessionId);
        resizeObserverMapRef.current.get(sessionId)?.disconnect();
        resizeObserverMapRef.current.delete(sessionId);
        disposedSessionIdsRef.current.add(sessionId);
        const terminal = terminalMapRef.current.get(sessionId);
        terminalMapRef.current.delete(sessionId);
        try {
          terminal?.dispose();
        } catch {
          // Ignore dispose races.
        }
        linkProviderMapRef.current.get(sessionId)?.dispose();
        linkProviderMapRef.current.delete(sessionId);
        fitMapRef.current.delete(sessionId);
        mountMapRef.current.delete(sessionId);
        queueMapRef.current.delete(sessionId);

        const remaining = current.sessions.filter(
          (item) => item.sessionId !== sessionId,
        );
        const fallback =
          remaining[
            Math.min(closingIndex, Math.max(remaining.length - 1, 0))
          ] ?? null;

        syncWorkspaceState(workspaceRoot, (state) => ({
          ...state,
          activeSessionId:
            state.activeSessionId === sessionId
              ? (fallback?.sessionId ?? null)
              : state.activeSessionId,
          sessions: state.sessions.filter(
            (item) => item.sessionId !== sessionId,
          ),
        }));

        if (fallback) {
          window.requestAnimationFrame(() => {
            syncTerminalSize(fallback.sessionId);
            terminalMapRef.current.get(fallback.sessionId)?.focus();
          });
        }
      } catch (err) {
        setError(getErrorMessage(err) || "Failed to close terminal");
      } finally {
        setPendingAction(null);
      }
    },
    [syncTerminalSize, syncWorkspaceState, workspaceRoot],
  );

  useEffect(() => {
    workspaceRootRef.current = workspaceRoot;
  }, [workspaceRoot]);

  useEffect(() => {
    if (!workspaceRoot || !isDesktopRuntime || !isExpanded) return;
    const state = workspaceStatesRef.current[workspaceRoot];
    if (state?.sessions.length) return;
    void createSession(workspaceRoot)
      .then((session) => hydrateSession(workspaceRoot, session))
      .catch((err) => {
        if (isSessionMissingError(err)) return;
        setError(getErrorMessage(err) || "Failed to initialize terminal");
      });
  }, [
    createSession,
    hydrateSession,
    isDesktopRuntime,
    isExpanded,
    workspaceRoot,
  ]);

  useEffect(() => {
    if (!isExpanded) return;
    if (!workspaceRoot) return;
    for (const session of workspaceState?.sessions ?? []) {
      if (mountMapRef.current.has(session.sessionId)) {
        void hydrateSession(workspaceRoot, session);
      }
    }
  }, [hydrateSession, isExpanded, workspaceRoot, workspaceState?.sessions]);

  useEffect(() => {
    for (const sessionId of terminalMapRef.current.keys()) {
      applyThemeToTerminal(sessionId);
    }
  }, [applyThemeToTerminal, terminalPalette, terminalSurface]);

  useEffect(() => {
    if (!activeSessionId || !isExpanded) return;
    const frame = window.requestAnimationFrame(() => {
      syncTerminalSize(activeSessionId);
      terminalMapRef.current.get(activeSessionId)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSessionId, isExpanded, syncTerminalSize]);

  useEffect(() => {
    return () => {
      for (const unlisten of unlistenMapRef.current.values()) unlisten();
      for (const observer of resizeObserverMapRef.current.values())
        observer.disconnect();
      for (const terminal of terminalMapRef.current.values())
        terminal.dispose();
      for (const linkProvider of linkProviderMapRef.current.values())
        linkProvider.dispose();
      unlistenMapRef.current.clear();
      resizeObserverMapRef.current.clear();
      terminalMapRef.current.clear();
      linkProviderMapRef.current.clear();
      fitMapRef.current.clear();
      mountMapRef.current.clear();
      queueMapRef.current.clear();
      disposedSessionIdsRef.current.clear();
    };
  }, []);

  return (
    <section
      className="bottom-terminal-panel flex h-full min-h-0 w-full min-w-0 shrink-0 flex-col overflow-hidden border-t"
      style={{
        display: isExpanded ? undefined : "none",
        background: "var(--terminal-panel-bg)",
        borderColor: "var(--terminal-border)",
        color: "var(--terminal-text)",
      }}
    >
      <div
        className="flex w-full items-center justify-between gap-3 border-b px-4 py-2"
        style={{
          borderColor: "var(--terminal-border)",
          background: "var(--terminal-header-bg)",
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center gap-2 pr-1 text-[12px] font-medium">
            <Icon
              icon="lucide:terminal"
              className="size-3.5"
              style={{ color: "var(--terminal-muted)" }}
              aria-hidden="true"
            />
            <span>终端</span>
            <span
              className="truncate text-[11px]"
              style={{ color: "var(--terminal-muted)" }}
            >
              {workspaceLabel(workspaceRoot)}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-px">
            {workspaceState?.sessions.map((session) => {
              const isActive = session.sessionId === activeSessionId;
              return (
                <div
                  key={session.sessionId}
                  className={cn(
                    "group flex h-7 items-center gap-1 rounded-md border pl-2 pr-1 text-[11px] transition-colors",
                    isActive ? "shadow-sm" : "opacity-80 hover:opacity-100",
                  )}
                  style={{
                    background: isActive
                      ? "var(--terminal-surface)"
                      : "transparent",
                    borderColor: isActive
                      ? "var(--terminal-border)"
                      : "transparent",
                    color: "var(--terminal-text)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectSession(session.sessionId)}
                    className="truncate"
                  >
                    {session.label}
                  </button>
                  {workspaceState.sessions.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`关闭 ${session.label}`}
                      onClick={() => void handleCloseSession(session.sessionId)}
                      className="rounded-sm p-0.5 opacity-60 transition-opacity group-hover:opacity-100"
                    >
                      <Icon
                        icon="lucide:x"
                        className="size-3"
                        aria-hidden="true"
                      />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 rounded-md"
          disabled={
            !workspaceRoot || !isDesktopRuntime || pendingAction === "creating"
          }
          onClick={() => void handleCreateSession()}
          title="新建终端"
        >
          <Icon
            icon="lucide:plus"
            className="size-3.5"
            aria-hidden="true"
          />
        </Button>
      </div>

      <div
        className="relative min-h-0 flex-1"
        style={{ background: terminalSurface }}
      >
        {!workspaceState?.sessions?.length ? (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground">
            正在初始化终端…
          </div>
        ) : null}
        {(workspaceState?.sessions ?? []).map((session) => (
          <div
            key={session.sessionId}
            className={cn(
              "absolute inset-0 px-3",
              session.sessionId === activeSessionId ? "block" : "hidden",
            )}
          >
            <div
              ref={(node) => setMountNode(session.sessionId, node)}
              onMouseDown={() => {
                const terminal = terminalMapRef.current.get(session.sessionId);
                if (terminal) {
                  terminal.focus();
                  return;
                }
                if (workspaceRoot) {
                  const currentSession = getSessionRecord(
                    workspaceRoot,
                    session.sessionId,
                  );
                  if (currentSession) {
                    void hydrateSession(workspaceRoot, currentSession);
                  }
                }
              }}
              className="h-full w-full min-w-0"
              style={{ backgroundColor: terminalSurface }}
            />
          </div>
        ))}

        {error ? (
          <div className="absolute bottom-4 left-4 rounded-full bg-red-500/12 px-3 py-1 text-[11px] text-red-600 dark:text-red-300">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}

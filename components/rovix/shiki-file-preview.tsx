"use client";

import { File } from "@pierre/diffs";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";

import { useTheme } from "@/components/theme-provider";

type ShikiFilePreviewProps = {
  code: string;
  filename: string;
  language: string;
  targetLine?: number | null;
};

const normalizeLanguage = (language: string) => {
  switch (language) {
    case "typescript":
    case "tsx":
    case "javascript":
    case "jsx":
    case "json":
    case "rust":
    case "python":
    case "markdown":
    case "css":
    case "html":
    case "yaml":
    case "bash":
    case "sql":
    case "toml":
      return language;
    default:
      return "text";
  }
};

export function ShikiFilePreview({
  code,
  filename,
  language,
  targetLine,
}: ShikiFilePreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<File | null>(null);
  const { resolvedTheme } = useTheme();
  const themeType = resolvedTheme === "dark" ? "dark" : "light";
  const previewStyle = useMemo(
    () =>
      ({
        background: "var(--app-panel-bg)",
        borderColor: "var(--app-panel-border)",
        boxShadow: "var(--app-panel-shadow)",
        "--diffs-font-family":
          'var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        "--diffs-header-font-family":
          'var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        "--diffs-font-size": "12px",
        "--diffs-line-height": "1.6",
        "--diffs-gap-inline": "6px",
        "--diffs-gap-block": "6px",
        "--diffs-selection-color-override":
          themeType === "dark" ? "rgb(219 234 254)" : "rgb(30 64 175)",
        "--diffs-bg-selection-override":
          themeType === "dark"
            ? "rgba(96, 165, 250, 0.22)"
            : "rgba(96, 165, 250, 0.16)",
      }) as CSSProperties,
    [themeType]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const instance = new File({
      theme: {
        dark: "pierre-dark",
        light: "pierre-light",
      },
      themeType,
      disableFileHeader: true,
      disableLineNumbers: false,
      lineHoverHighlight: "line",
      overflow: "scroll",
    });
    instanceRef.current = instance;

    instance.render({
      containerWrapper: containerRef.current,
      file: {
        name: filename,
        contents: code,
        lang: normalizeLanguage(language),
      },
    });

    return () => {
      instanceRef.current = null;
      instance.cleanUp();
    };
  }, [code, filename, language, themeType]);

  useEffect(() => {
    const instance = instanceRef.current;
    const container = containerRef.current;
    if (!instance || !container) return;

    if (!targetLine || targetLine < 1) {
      instance.setSelectedLines(null);
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      const lineNode = container.shadowRoot?.querySelector<HTMLElement>(
        `[data-line="${targetLine}"]`
      );

      if (!lineNode) {
        instance.setSelectedLines(null);
        return;
      }

      instance.setSelectedLines({
        start: targetLine,
        end: targetLine,
      });

      lineNode.scrollIntoView({
        block: "center",
        inline: "nearest",
      });
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [targetLine, code, filename]);

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] border"
      style={previewStyle}
    >
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-3"
        style={{
          borderColor: "var(--app-hairline)",
          background: "var(--app-soft-fill-strong)",
        }}
      >
        <div className="min-w-0">
          <div className="truncate font-mono text-[12px] text-foreground/88">
            {filename}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground/72">
            Syntax-highlighted snapshot
          </div>
        </div>
      </div>
      <div
        className="scrollbar-frost min-h-0 flex-1 overflow-auto p-3"
        style={{ background: "color-mix(in srgb, var(--background) 78%, transparent)" }}
      >
        <div ref={containerRef} className="min-h-[180px]" />
      </div>
    </div>
  );
}

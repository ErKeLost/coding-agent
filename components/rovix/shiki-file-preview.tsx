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
    case "diff":
    case "css":
    case "html":
    case "vue":
    case "svelte":
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
        "--diffs-bg-buffer-override":
          themeType === "dark" ? "rgba(7, 10, 18, 0.86)" : "rgba(255, 255, 255, 0.96)",
        "--diffs-bg-hover-override":
          themeType === "dark" ? "rgba(148, 163, 184, 0.10)" : "rgba(148, 163, 184, 0.08)",
        "--diffs-bg-context-override":
          themeType === "dark" ? "rgba(15, 23, 42, 0.58)" : "rgba(248, 250, 252, 0.92)",
        "--diffs-bg-separator-override":
          themeType === "dark" ? "rgba(30, 41, 59, 0.92)" : "rgba(241, 245, 249, 0.96)",
        "--diffs-fg-number-override":
          themeType === "dark" ? "rgba(148, 163, 184, 0.88)" : "rgba(100, 116, 139, 0.86)",
        "--diffs-fg-number-addition-override":
          themeType === "dark" ? "rgb(110, 231, 183)" : "rgb(22, 163, 74)",
        "--diffs-fg-number-deletion-override":
          themeType === "dark" ? "rgb(253, 186, 116)" : "rgb(220, 38, 38)",
        "--diffs-addition-color-override":
          themeType === "dark" ? "rgb(220, 252, 231)" : "rgb(21, 128, 61)",
        "--diffs-deletion-color-override":
          themeType === "dark" ? "rgb(255, 237, 213)" : "rgb(185, 28, 28)",
        "--diffs-modified-color-override":
          themeType === "dark" ? "rgb(191, 219, 254)" : "rgb(29, 78, 216)",
        "--diffs-bg-addition-override":
          themeType === "dark" ? "rgba(20, 83, 45, 0.38)" : "rgba(220, 252, 231, 0.88)",
        "--diffs-bg-addition-number-override":
          themeType === "dark" ? "rgba(22, 101, 52, 0.54)" : "rgba(187, 247, 208, 0.95)",
        "--diffs-bg-addition-hover-override":
          themeType === "dark" ? "rgba(22, 101, 52, 0.50)" : "rgba(187, 247, 208, 1)",
        "--diffs-bg-addition-emphasis-override":
          themeType === "dark" ? "rgba(34, 197, 94, 0.28)" : "rgba(134, 239, 172, 0.92)",
        "--diffs-bg-deletion-override":
          themeType === "dark" ? "rgba(127, 29, 29, 0.34)" : "rgba(254, 226, 226, 0.92)",
        "--diffs-bg-deletion-number-override":
          themeType === "dark" ? "rgba(153, 27, 27, 0.48)" : "rgba(254, 202, 202, 0.98)",
        "--diffs-bg-deletion-hover-override":
          themeType === "dark" ? "rgba(153, 27, 27, 0.44)" : "rgba(254, 202, 202, 1)",
        "--diffs-bg-deletion-emphasis-override":
          themeType === "dark" ? "rgba(248, 113, 113, 0.26)" : "rgba(252, 165, 165, 0.92)",
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
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[12px] border"
      style={previewStyle}
    >
      <div
        className="scrollbar-frost min-h-0 flex-1 overflow-auto p-1.5"
        style={{
          background: "color-mix(in srgb, var(--background) 78%, transparent)",
        }}
      >
        <div ref={containerRef} className="min-h-[120px]" />
      </div>
    </div>
  );
}

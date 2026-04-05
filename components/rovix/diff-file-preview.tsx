"use client";

import { FileDiff } from "@pierre/diffs";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";

import { useTheme } from "@/components/theme-provider";

type DiffFilePreviewProps = {
  filename: string;
  language: string;
  before: string;
  after: string;
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

export function DiffFilePreview({
  filename,
  language,
  before,
  after,
}: DiffFilePreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
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
        "--diffs-bg-selection-number-override":
          themeType === "dark"
            ? "rgba(96, 165, 250, 0.34)"
            : "rgba(59, 130, 246, 0.22)",
      }) as CSSProperties,
    [themeType]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const instance = new FileDiff({
      theme: {
        dark: "pierre-dark",
        light: "pierre-light",
      },
      themeType,
      diffStyle: "split",
      diffIndicators: "bars",
      disableBackground: false,
      disableFileHeader: true,
      hunkSeparators: "line-info-basic",
      lineDiffType: "word-alt",
      lineHoverHighlight: "line",
      overflow: "scroll",
    });

    instance.render({
      containerWrapper: containerRef.current,
      oldFile: {
        name: filename,
        contents: before,
        lang: normalizeLanguage(language),
      },
      newFile: {
        name: filename,
        contents: after,
        lang: normalizeLanguage(language),
      },
    });

    return () => {
      instance.cleanUp();
    };
  }, [after, before, filename, language, themeType]);

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
        <div ref={containerRef} className="min-h-[128px]" />
      </div>
    </div>
  );
}

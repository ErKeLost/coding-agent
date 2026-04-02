"use client";

import { useEffect, useMemo, useRef } from "react";
import { FileDiff } from "@pierre/diffs";

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
  const themeType = useMemo(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
        ? "dark"
        : "light",
    []
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const instance = new FileDiff({
      theme: {
        dark: "github-dark-default",
        light: "github-light-default",
      },
      themeType,
      diffStyle: "split",
      diffIndicators: "bars",
      disableBackground: false,
      disableFileHeader: false,
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-[#1f2a44] bg-[#0d1529]">
      <div className="flex items-center justify-between border-b border-b-[#1f2a44] px-4 py-3">
        <div className="font-mono text-[12px] text-[#dbeafe]">{filename}</div>
        <div className="rounded-full border border-[#24304b] bg-[#131b2e] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-[#7c8aa5]">
          diff preview
        </div>
      </div>
      <div className="scrollbar-frost min-h-0 flex-1 overflow-auto bg-[#0b1326] p-2">
        <div
          ref={containerRef}
          className="[&_pre]:!m-0 [&_pre]:!rounded-[12px] [&_pre]:!border-0 [&_pre]:!bg-transparent [&_pre]:!text-[12px]"
        />
      </div>
    </div>
  );
}

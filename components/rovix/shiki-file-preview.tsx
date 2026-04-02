"use client";

import { useEffect, useMemo, useState } from "react";

type ShikiFilePreviewProps = {
  code: string;
  filename: string;
  language: string;
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
}: ShikiFilePreviewProps) {
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const theme = useMemo(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
        ? "github-dark-default"
        : "github-light-default",
    []
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const { codeToHtml } = await import("shiki");
        const rendered = await codeToHtml(code, {
          lang: normalizeLanguage(language),
          theme,
          transformers: [
            {
              pre(node) {
                node.properties.class = "rovix-shiki";
              },
            },
          ],
        });

        if (!cancelled) {
          setHtml(rendered);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render code");
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [code, language, theme]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-[#1f2a44] bg-[#0d1529]">
      <div className="flex items-center justify-between border-b border-b-[#1f2a44] px-4 py-3">
        <div className="font-mono text-[12px] text-[#dbeafe]">{filename}</div>
        <div className="rounded-full border border-[#24304b] bg-[#131b2e] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-[#7c8aa5]">
          {language}
        </div>
      </div>
      <div className="scrollbar-frost min-h-0 flex-1 overflow-auto bg-[#0b1326] p-0">
        {error ? (
          <div className="p-4 text-sm text-rose-300">{error}</div>
        ) : (
          <div
            className="[&_.rovix-shiki]:!m-0 [&_.rovix-shiki]:!rounded-none [&_.rovix-shiki]:!bg-transparent [&_.rovix-shiki]:!p-4 [&_.rovix-shiki_code]:!font-mono [&_.rovix-shiki_code]:text-[12px] [&_.rovix-shiki_code]:leading-6"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
}

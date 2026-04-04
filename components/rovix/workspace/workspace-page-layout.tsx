"use client";

import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

type WorkspacePageLayoutProps = {
  header: ReactNode;
  content: ReactNode;
  composer: ReactNode;
  terminal: ReactNode;
  terminalExpanded: boolean;
};

export function WorkspacePageLayout({
  header,
  content,
  composer,
  terminal,
  terminalExpanded,
}: WorkspacePageLayoutProps) {
  return (
    <section
      className="grid h-full w-full min-h-0 min-w-0 overflow-hidden bg-transparent"
      style={{
        gridTemplateRows: terminalExpanded
          ? "minmax(0, 1fr) 372px"
          : "minmax(0, 1fr) 0px",
      }}
    >
      <Card className="flex h-full min-h-0 min-w-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-transparent pt-0 shadow-none">
        <CardHeader className="shrink-0 border-border/50 border-b px-0 py-3">
          {header}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-0">
          {content}
        </CardContent>
        <CardFooter className="shrink-0 px-0 py-3">{composer}</CardFooter>
      </Card>
      {terminal}
    </section>
  );
}

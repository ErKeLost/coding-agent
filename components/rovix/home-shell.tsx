"use client";

import {
  ChevronDownIcon,
  CircleUserRoundIcon,
  Code2Icon,
  FileCode2Icon,
  FolderIcon,
  MessageSquareTextIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  SquareTerminalIcon,
  ZapIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type SessionItem = {
  id: string;
  title: string;
};

type RefactorItem = {
  path: string;
  summary: string;
  tone: "emerald" | "violet";
};

type RovixHomeShellProps = {
  sessions: SessionItem[];
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onOpenCommand: () => void;
  onChangeWorkspace: () => void;
  workspaceButtonLabel: string;
  workspacePath: string;
  projectTree: string[];
  recentRefactors: RefactorItem[];
  currentTimeLabel: string;
};

export function RovixHomeShell({
  sessions,
  onSelectSession,
  onNewSession,
  onOpenCommand,
  onChangeWorkspace,
  workspaceButtonLabel,
  workspacePath,
  projectTree,
  recentRefactors,
  currentTimeLabel,
}: RovixHomeShellProps) {
  return (
    <div className="relative h-screen overflow-hidden bg-[#0a0c11] text-[#f4f7fb]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(102,122,255,0.18),transparent_24%),radial-gradient(circle_at_top_right,rgba(110,168,255,0.12),transparent_26%),linear-gradient(180deg,#0d1016_0%,#0a0c11_100%)]" />

      <div
        className="relative z-10 grid h-full"
        style={{ gridTemplateColumns: "352px minmax(0, 1fr) 420px" }}
      >
        <aside className="flex min-h-0 flex-col border-r border-white/[0.04] px-7 pb-7 pt-9">
          <div className="flex items-center gap-4">
            <div className="flex size-13 items-center justify-center rounded-full border border-white/[0.08] bg-[#0a0d14] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
              <div className="font-[family:var(--font-display)] text-[24px] text-white/90">
                R
              </div>
            </div>
            <div>
              <div className="font-[family:var(--font-display)] text-[25px] font-semibold tracking-[-0.04em] text-[#8ea9ff]">
                Rovix Aura
              </div>
              <div className="mt-2 text-[11px] uppercase tracking-[0.28em] text-white/30">
                Pro Developer Suite
              </div>
            </div>
          </div>

          <Button
            type="button"
            onClick={onNewSession}
            className="mt-14 h-[64px] rounded-[20px] bg-[linear-gradient(135deg,#87b3ff_0%,#6e9bf0_100%)] text-[18px] font-semibold tracking-[-0.03em] text-[#19345d] shadow-[0_12px_40px_rgba(103,145,255,0.28)] hover:brightness-105"
          >
            <PlusIcon className="size-5" />
            New Session
          </Button>

          <div className="mt-12 flex items-center gap-3 px-2 text-white/58">
            <RefreshCwIcon className="size-5" />
            <span className="text-[16px] tracking-[-0.02em]">Sessions</span>
          </div>

          <div className="mt-5 space-y-2">
            {sessions.slice(0, 2).map((session, index) => (
              <Button
                key={session.id}
                type="button"
                variant="ghost"
                onClick={() => onSelectSession(session.id)}
                className={cn(
                  "h-[54px] w-full justify-start rounded-[18px] px-5 text-left text-[18px] tracking-[-0.03em]",
                  index === 0
                    ? "bg-white/[0.06] text-[#8faeff] shadow-[inset_-2px_0_0_#82a6ff]"
                    : "text-white/70 hover:bg-white/[0.04] hover:text-white"
                )}
              >
                {index === 0 ? (
                  <MessageSquareTextIcon className="size-5" />
                ) : (
                  <Code2Icon className="size-5" />
                )}
                {session.title}
              </Button>
            ))}
          </div>

          <div className="mt-14 px-2 text-[12px] uppercase tracking-[0.24em] text-white/30">
            Recent Refactors
          </div>

          <ScrollArea className="mt-5 min-h-0 flex-1 pr-2">
            <div className="space-y-5 pb-6">
              {recentRefactors.map((item) => (
                <Card
                  key={item.path}
                  className="gap-0 rounded-[26px] border border-white/[0.06] bg-[linear-gradient(180deg,#111620_0%,#10151d_100%)] py-0 shadow-none"
                >
                  <CardContent className="px-6 py-6">
                    <div
                      className={cn(
                        "font-mono text-[14px]",
                        item.tone === "emerald"
                          ? "text-[#5fe4b1]"
                          : "text-[#c58dff]"
                      )}
                    >
                      {item.path}
                    </div>
                    <p className="mt-4 text-[15px] leading-9 text-white/64">
                      {item.summary}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>

          <Separator className="mt-2 bg-white/[0.05]" />

          <Button
            type="button"
            variant="ghost"
            className="mt-5 h-12 justify-start rounded-[16px] px-3 text-[16px] text-white/58 hover:bg-white/[0.04] hover:text-white"
          >
            <Settings2Icon className="size-5" />
            Settings
          </Button>

          <Card className="mt-5 gap-0 rounded-[22px] border border-white/[0.06] bg-[#10141c] py-0 shadow-none">
            <CardContent className="flex items-center gap-4 px-5 py-4">
              <Avatar size="lg" className="rounded-[14px]">
                <AvatarFallback className="rounded-[14px] bg-[#eaf1ff] text-[#0f172a]">
                  AD
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[17px] font-semibold text-white">
                  AlphaDev_99
                </div>
                <div className="text-[13px] text-white/42">Pro Plan</div>
              </div>
              <ChevronDownIcon className="size-4 text-white/38" />
            </CardContent>
          </Card>
        </aside>

        <main className="relative min-h-0 overflow-hidden border-r border-white/[0.04]">
          <header className="flex h-[86px] items-center justify-between px-10">
            <div className="flex items-center gap-4">
              <div className="size-3 rounded-full bg-[#62f0bf] shadow-[0_0_18px_rgba(98,240,191,0.7)]" />
              <div className="text-[17px] font-semibold uppercase tracking-[0.22em] text-[#86a6ff]">
                Rovix LMM-4 Optimized
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              onClick={onOpenCommand}
              className="h-[54px] w-[510px] justify-between rounded-full border border-white/[0.06] bg-white/[0.03] px-6 text-[17px] text-white/40 hover:bg-white/[0.05] hover:text-white/70"
            >
              <span className="flex items-center gap-4">
                <SearchIcon className="size-5" />
                Search codebase...
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/22">
                ⌘K
              </span>
            </Button>

            <div className="flex items-center gap-7 text-white/72">
              <SquareTerminalIcon className="size-6" />
              <ZapIcon className="size-6" />
              <CircleUserRoundIcon className="size-6" />
            </div>
          </header>

          <div className="flex h-[calc(100%-86px)] flex-col px-10 pb-8 pt-8">
            <div className="pointer-events-none absolute left-1/2 top-[88px] h-[320px] w-[700px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(123,128,255,0.12),transparent_62%)]" />

            <div className="relative z-10 text-center">
              <h1 className="font-[family:var(--font-display)] text-[58px] font-semibold tracking-[-0.06em] text-white">
                Hello, <span className="text-[#ad82ff]">AlphaDev</span>
              </h1>
              <p className="mx-auto mt-7 max-w-[780px] text-[20px] leading-[1.6] tracking-[-0.03em] text-white/60">
                The aura is synchronized. Ready to refactor, debug, or architect
                your next masterpiece.
              </p>
            </div>

            <div className="relative z-10 mt-16 max-w-[900px]">
              <div className="flex items-center gap-7">
                <div className="flex size-12 items-center justify-center rounded-[16px] border border-white/[0.06] bg-[#1a202b] text-[#8eaaff]">
                  <SparklesIcon className="size-5" />
                </div>
                <div className="text-[24px] font-semibold tracking-[-0.04em] text-[#8eaaff]">
                  Refactor Analysis
                </div>
              </div>

              <Card className="mt-5 gap-0 rounded-[24px] border border-white/[0.06] bg-[#12161f] py-0 shadow-none">
                <CardContent className="px-9 py-8">
                  <p className="text-[18px] leading-[1.7] tracking-[-0.02em] text-white/72">
                    I&apos;ve analyzed your{" "}
                    <span className="font-mono text-[#5fe4b1]">auth.gate.ts</span>{" "}
                    middleware. The current implementation uses nested
                    if-statements which causes cognitive load. I recommend moving
                    to a <span className="font-semibold text-white">Strategy Pattern</span>{" "}
                    for your permission checks.
                  </p>

                  <div className="mt-8 overflow-hidden rounded-[18px] bg-black px-8 py-7">
                    <pre className="overflow-x-auto font-mono text-[16px] leading-[1.7] text-[#c88aff]">
                      {"export const canAccess = (user, resource) => {\n  // ...implementation\n}"}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <div className="mt-6 flex gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 rounded-[14px] border border-white/[0.06] bg-white/[0.03] px-7 text-[14px] font-semibold uppercase tracking-[0.14em] text-white/38 hover:bg-white/[0.06] hover:text-white/64"
                >
                  Copy Snippet
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 rounded-[14px] border border-white/[0.06] bg-white/[0.03] px-7 text-[14px] font-semibold uppercase tracking-[0.14em] text-white/38 hover:bg-white/[0.06] hover:text-white/64"
                >
                  Apply To File
                </Button>
              </div>

              <div className="mt-18 flex justify-end">
                <div className="max-w-[670px] rounded-[22px] bg-[linear-gradient(135deg,#8caeff_0%,#7e9ff5_100%)] px-8 py-5 text-[18px] tracking-[-0.03em] text-[#17325d] shadow-[0_20px_50px_rgba(126,159,245,0.22)]">
                  Can you generate the full Strategy implementation for the roles?
                </div>
              </div>
              <div className="mt-4 text-right text-[14px] text-white/26">
                {currentTimeLabel} PM
              </div>
            </div>

            <div className="mt-auto pt-9">
              <Card className="gap-0 rounded-[28px] border border-white/[0.06] bg-[#1a1f27] py-0 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
                <CardContent className="px-7 py-7">
                  <div className="flex items-end gap-5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mb-2 size-10 rounded-full text-white/30 hover:bg-white/[0.06] hover:text-white/62"
                    >
                      <PlusIcon className="size-5" />
                    </Button>
                    <Textarea
                      value=""
                      readOnly
                      placeholder="Ask Rovix to write or explain code..."
                      className="min-h-[90px] flex-1 resize-none border-0 bg-[#151922] px-6 py-6 text-[16px] leading-7 text-white/82 shadow-none placeholder:text-white/26 focus-visible:ring-0"
                    />
                    <div className="flex flex-col items-end gap-3">
                      <Badge className="rounded-[8px] bg-black px-3 py-1 text-[12px] text-white/78">
                        GPT-4
                      </Badge>
                      <Button
                        type="button"
                        size="icon-lg"
                        className="size-[54px] rounded-[18px] bg-[linear-gradient(135deg,#8caeff_0%,#7e9ff5_100%)] text-[#17325d] shadow-[0_16px_36px_rgba(126,159,245,0.24)] hover:brightness-105"
                      >
                        <ZapIcon className="size-5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="mt-6 flex items-center gap-10 px-1 text-[13px] font-semibold uppercase tracking-[0.22em] text-white/38">
                <span>Debug Context</span>
                <span>Optimize</span>
                <span>Generate Tests</span>
              </div>
            </div>
          </div>
        </main>

        <aside className="min-h-0 overflow-hidden px-8 pb-8 pt-14">
          <div className="flex items-center justify-between">
            <h2 className="text-[22px] font-semibold tracking-[-0.04em] text-white">
              Execution Context
            </h2>
            <Button
              type="button"
              variant="ghost"
              onClick={onChangeWorkspace}
              className="h-[50px] rounded-full border border-white/[0.06] bg-white/[0.03] px-6 text-[13px] font-semibold uppercase tracking-[0.2em] text-white/70 hover:bg-white/[0.06]"
            >
              {workspaceButtonLabel}
            </Button>
          </div>

          <div className="mt-10 space-y-8">
            <Card className="gap-0 rounded-[26px] border border-white/[0.06] bg-[#151a22] py-0 shadow-none">
              <CardContent className="px-7 py-7">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/34">
                      Local Env
                    </div>
                    <div className="mt-5 text-[19px] font-medium text-[#61f0bf]">
                      Node.js v20.11.0
                    </div>
                  </div>
                  <Settings2Icon className="size-7 text-white/40" />
                </div>
                <div className="mt-6 h-1.5 rounded-full bg-black">
                  <div className="h-full w-[40%] rounded-full bg-[#61f0bf]" />
                </div>
              </CardContent>
            </Card>

            <Card className="gap-0 rounded-[26px] border border-white/[0.06] bg-[#151a22] py-0 shadow-none">
              <CardHeader className="px-7 pt-7">
                <CardTitle className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/34">
                  Project Structure
                </CardTitle>
                <CardDescription className="pt-2 text-[13px] text-white/36">
                  {workspacePath}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-7 pb-7 pt-2">
                <div className="space-y-5 text-[16px] text-white/70">
                  {projectTree.map((segment, index) => (
                    <div
                      key={`${segment}-${index}`}
                      className="flex items-center gap-4"
                      style={{ paddingLeft: `${index * 22}px` }}
                    >
                      {index === projectTree.length - 1 ? (
                        <FileCode2Icon className="size-5 text-[#8eaaff]" />
                      ) : (
                        <FolderIcon className="size-5 text-white/34" />
                      )}
                      <span className={cn(index === projectTree.length - 1 && "text-white")}>
                        {segment}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="gap-0 rounded-[26px] border border-[#2f4d88] bg-[linear-gradient(180deg,rgba(34,43,62,0.94)_0%,rgba(23,28,38,0.96)_100%)] py-0 shadow-none">
              <CardContent className="px-7 py-7">
                <div className="flex items-center gap-3 text-[#8eaaff]">
                  <SparklesIcon className="size-4" />
                  <div className="text-[15px] font-semibold uppercase tracking-[0.16em]">
                    Rovix Insight
                  </div>
                </div>
                <p className="mt-5 text-[16px] leading-9 text-white/68">
                  I noticed you&apos;re using an older animation dependency in this
                  workspace. Upgrading could improve your runtime performance by 15%.
                </p>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { CheckIcon, ChevronDownIcon, GitBranchIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type BranchPickerProps = {
  branches: string[];
  currentBranch: string | null;
  loading?: boolean;
  onSelect: (branch: string) => void | Promise<void>;
  onCreate: (branch: string) => void | Promise<void>;
};

export function BranchPicker({
  branches,
  currentBranch,
  loading = false,
  onSelect,
  onCreate,
}: BranchPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const visibleBranches = useMemo(() => {
    if (!normalizedQuery) return branches;
    return branches.filter((branch) => branch.toLowerCase().includes(normalizedQuery));
  }, [branches, normalizedQuery]);

  const exactMatch = branches.some((branch) => branch === query.trim());
  const canCreate = query.trim().length > 0 && !exactMatch;

  const handleSelect = async (branch: string) => {
    await onSelect(branch);
    setOpen(false);
    setQuery("");
  };

  const handleCreate = async () => {
    const nextBranch = query.trim();
    if (!nextBranch) return;
    await onCreate(nextBranch);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={loading}
          className="h-7 min-w-[132px] max-w-[220px] justify-between rounded-[10px] border-0 bg-transparent px-2 text-[11px] font-medium text-foreground/86 shadow-none"
        >
          <span className="flex min-w-0 items-center gap-2">
            <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground/80" />
            <span className="truncate">{currentBranch ?? "选择分支"}</span>
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[280px] overflow-hidden rounded-[16px] p-0"
      >
        <Command className="bg-transparent">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="搜索分支或输入新分支名"
          />
          <CommandList className="max-h-[320px]">
            <CommandEmpty className="py-3 text-[12px] text-muted-foreground">
              没有匹配分支
            </CommandEmpty>
            {visibleBranches.map((branch) => (
              <CommandItem
                key={branch}
                value={branch}
                onSelect={() => void handleSelect(branch)}
                className="rounded-none px-3 py-2 text-[12px]"
              >
                <CheckIcon
                  className={cn(
                    "size-3.5",
                    branch === currentBranch ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="truncate">{branch}</span>
              </CommandItem>
            ))}
            {canCreate ? (
              <CommandItem
                value={`create-${query.trim()}`}
                onSelect={() => void handleCreate()}
                className="border-t px-3 py-2 text-[12px]"
              >
                <PlusIcon className="size-3.5" />
                <span className="truncate">创建分支 “{query.trim()}”</span>
              </CommandItem>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

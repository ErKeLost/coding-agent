"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Icon } from "@iconify/react";

type CommandAction = {
  title: string;
  description: string;
  shortcut: string;
  value: string;
};

type CommandCenterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAction: (value: string) => void;
  actions: CommandAction[];
};

const iconMap = {
  test: "solar:test-tube-linear",
  refactor: "solar:magic-stick-3-linear",
  explain: "solar:document-text-linear",
} as const;

export function CommandCenterDialog({
  open,
  onOpenChange,
  onSelectAction,
  actions,
}: CommandCenterDialogProps) {
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      showCloseButton={false}
      title="Rovix Command Center"
      description="Search for a code action to run"
      className="max-w-[680px] overflow-hidden rounded-[20px] border border-[#dbeafe1a] bg-[rgba(30,41,59,0.9)] p-[5px] shadow-[0_20px_40px_rgba(6,14,32,0.6)] backdrop-blur-[20px]"
    >
      <div className="rounded-[15px] border border-[#ffffff08] bg-[rgba(30,41,59,0.82)]">
        <CommandInput
          placeholder="What can I help you build?"
          className="h-14 border-none bg-transparent text-[20px] text-[#dbeafe] placeholder:text-[#6f7f98]"
        />
        <CommandList className="max-h-[420px] border-t border-t-[#3b82f633] px-3 py-3">
          <CommandEmpty className="py-12 text-[#94a3b8]">
            No matching action
          </CommandEmpty>
          <CommandGroup
            heading="Suggested Actions"
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[1px] [&_[cmdk-group-heading]]:text-[#64748b]"
          >
            {actions.map((action) => {
              const icon =
                action.value === "test"
                  ? iconMap.test
                  : action.value === "refactor"
                    ? iconMap.refactor
                    : iconMap.explain;

              return (
                <CommandItem
                  key={action.value}
                  value={`${action.title} ${action.description}`}
                  onSelect={() => onSelectAction(action.value)}
                  className="group rounded-[14px] px-3 py-3 data-[selected=true]:bg-[#111a2d] data-[selected=true]:text-[#dbeafe]"
                >
                  <div className="flex size-8 items-center justify-center rounded-[8px] bg-[#2d3449] text-[#7fb0ff]">
                    <Icon icon={icon} className="size-[17px]" aria-hidden="true" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-[#dae2fd]">
                      {action.title}
                    </span>
                    <span className="truncate text-xs text-[#64748b]">
                      {action.description}
                    </span>
                  </div>
                  <CommandShortcut className="text-[#475569] group-data-[selected=true]:text-[#64748b]">
                    {action.shortcut}
                  </CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </div>
    </CommandDialog>
  );
}

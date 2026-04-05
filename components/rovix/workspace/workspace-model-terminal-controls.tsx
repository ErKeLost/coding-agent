"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  ModelSelector,
  ModelSelectorLogo,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { Icon } from "@iconify/react";

type SelectedModel = {
  name: string;
  chefSlug?: string;
} | null;

type WorkspaceModelTerminalControlsProps = {
  modelDialogOpen: boolean;
  onModelDialogOpenChange: (open: boolean) => void;
  selectedModelData: SelectedModel;
  terminalExpanded: boolean;
  onToggleTerminal: () => void;
};

export function WorkspaceModelTerminalControls({
  modelDialogOpen,
  onModelDialogOpenChange,
  selectedModelData,
  terminalExpanded,
  onToggleTerminal,
}: WorkspaceModelTerminalControlsProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 max-sm:w-full">
      <ModelSelector
        open={modelDialogOpen}
        onOpenChange={onModelDialogOpenChange}
      >
        <ModelSelectorTrigger asChild>
          <Button
            variant="outline"
            className="app-control h-8 min-w-0 max-w-[190px] justify-between gap-2 rounded-[10px] border-0 px-2.5 text-[11px] shadow-none max-sm:w-full max-sm:max-w-none"
          >
            <div className="flex min-w-0 items-center gap-2">
              {selectedModelData?.chefSlug ? (
                <ModelSelectorLogo
                  className="size-3.5 shrink-0"
                  provider={selectedModelData.chefSlug}
                />
              ) : null}
              <span className="truncate">
                {selectedModelData?.name ?? "选择模型"}
              </span>
            </div>
            <Icon
              icon="lucide:chevron-down"
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </Button>
        </ModelSelectorTrigger>
      </ModelSelector>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            onClick={onToggleTerminal}
            className="app-control h-8 w-8 shrink-0 rounded-[10px] border-0 px-0 shadow-none"
            aria-label={terminalExpanded ? "隐藏终端" : "显示终端"}
          >
            <Icon
              icon="lucide:square-terminal"
              className="size-3.5"
              aria-hidden="true"
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          {terminalExpanded ? "隐藏终端" : "显示终端"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

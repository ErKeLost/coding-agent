"use client";

import { useSyncExternalStore } from "react";
import { CheckIcon, LaptopIcon, MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const themeOptions = [
  { value: "system", label: "System", Icon: LaptopIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const current = isClient
    ? themeOptions.find((option) => option.value === theme)
    : themeOptions[0];
  const CurrentIcon = current?.Icon ?? LaptopIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "app-control app-frosted h-9 w-full justify-start gap-2 rounded-xl px-3 text-[12px] font-medium text-muted-foreground shadow-none hover:text-foreground",
            className
          )}
        >
          <CurrentIcon className="size-4 text-muted-foreground" />
          <span className="truncate">Theme: {current?.label ?? "System"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="app-frosted w-44 rounded-2xl border-[var(--app-hairline)] bg-[var(--app-panel-bg)] p-1.5 shadow-[var(--app-panel-shadow)] backdrop-blur-xl"
      >
        {themeOptions.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className="rounded-xl px-2.5 py-2 text-[12px]"
          >
            <Icon className="size-4" />
            <span>{label}</span>
            {theme === value ? (
              <CheckIcon className="ml-auto size-4 text-emerald-500" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

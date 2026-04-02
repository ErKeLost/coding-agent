"use client";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import {
  ArrowLeftIcon,
  CheckIcon,
  LaptopIcon,
  MoonIcon,
  PaletteIcon,
  Settings2Icon,
  SunIcon,
} from "lucide-react";
import { useState } from "react";

const MODE_OPTIONS = [
  {
    value: "system",
    label: "跟随系统",
    hint: "自动切换浅色和暗色",
    icon: LaptopIcon,
  },
  {
    value: "light",
    label: "浅色",
    hint: "更轻，更接近文档工作台",
    icon: SunIcon,
  },
  {
    value: "dark",
    label: "暗色",
    hint: "更专注，适合长时间编码",
    icon: MoonIcon,
  },
] as const;

const SWATCHES = {
  sand: ["#b68252", "#d4b27d", "#f3e7d1", "#fbf7ef"],
  graphite: ["#67748f", "#9ca8be", "#d6dce7", "#f4f6fa"],
  ocean: ["#2777c8", "#4bb4d8", "#d8edf5", "#f1fbff"],
  forest: ["#3f8e68", "#78b28a", "#d9ebdc", "#f2faf2"],
  rose: ["#b04a62", "#d27a8d", "#f3d9df", "#fdf5f7"],
} as const;

type SettingsSection = "appearance";

const NAV_ITEMS: { id: SettingsSection; label: string }[] = [
  { id: "appearance", label: "外观" },
];

export function ThemeSettingsPanel({ onBack }: { onBack?: () => void }) {
  const { theme, setTheme, colorTheme, setColorTheme, colorThemes } = useTheme();
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");

  return (
    <div className="scrollbar-frost-thin min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-6 md:px-8 md:py-8">
        <div className="space-y-4 rounded-[18px] border border-border/45 bg-background/55 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground/60 uppercase">
                设置
              </div>
              <h2 className="text-[22px] font-semibold tracking-tight text-foreground">
                外观
              </h2>
              <p className="text-[13px] leading-6 text-muted-foreground">
                调整明暗模式和整体色板，主题色会影响整个界面的渐变、侧栏和输入区。
              </p>
            </div>
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="app-soft-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeftIcon className="size-3.5" />
                返回应用
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] transition-colors",
                  activeSection === item.id
                    ? "bg-primary/10 font-medium text-primary"
                    : "bg-muted/35 text-sidebar-foreground/70 hover:bg-muted/55 hover:text-sidebar-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          {activeSection === "appearance" && (
            <div className="space-y-8">
              <section className="overflow-hidden rounded-[14px] border border-border/50 bg-background/40">
                <div className="flex items-center gap-2 border-b border-border/40 px-5 py-3.5 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <Settings2Icon className="size-3.5" />
                  外观模式
                </div>
                <div className="divide-y divide-border/35">
                  {MODE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const active = theme === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTheme(option.value)}
                        className={cn(
                          "flex w-full items-center gap-4 px-5 py-4 text-left transition-colors",
                          active ? "bg-primary/[0.06]" : "hover:bg-muted/20",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-9 items-center justify-center rounded-full border",
                            active
                              ? "border-primary/30 bg-primary/[0.12] text-primary"
                              : "border-border/60 bg-background/70 text-muted-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-medium text-foreground">
                            {option.label}
                          </div>
                          <div className="mt-0.5 text-[12px] text-muted-foreground">
                            {option.hint}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "flex size-5 items-center justify-center rounded-full border",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border/65 bg-transparent",
                          )}
                        >
                          {active ? <CheckIcon className="size-3.5" /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="overflow-hidden rounded-[14px] border border-border/50 bg-background/40">
                <div className="flex items-center gap-2 border-b border-border/40 px-5 py-3.5 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <PaletteIcon className="size-3.5" />
                  主题色板
                </div>
                <div className="divide-y divide-border/35">
                  {colorThemes.map((palette) => {
                    const active = colorTheme === palette.value;
                    const swatchKey = palette.value as keyof typeof SWATCHES;
                    return (
                      <button
                        key={palette.value}
                        type="button"
                        onClick={() => setColorTheme(palette.value)}
                        className={cn(
                          "flex w-full items-center gap-4 px-5 py-4 text-left transition-colors",
                          active ? "bg-primary/[0.06]" : "hover:bg-muted/20",
                        )}
                      >
                        <div className="flex min-w-[104px] items-center gap-1.5">
                          {(SWATCHES[swatchKey] ?? []).map((swatch) => (
                            <span
                              key={swatch}
                              className="size-6 rounded-full border border-black/8"
                              style={{ background: swatch }}
                            />
                          ))}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-medium text-foreground">
                            {palette.label}
                          </div>
                          <div className="mt-0.5 text-[12px] text-muted-foreground">
                            {palette.description}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "flex size-5 items-center justify-center rounded-full border",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border/65 bg-transparent",
                          )}
                        >
                          {active ? <CheckIcon className="size-3.5" /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

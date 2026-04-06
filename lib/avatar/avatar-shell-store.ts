"use client";

import { create } from "zustand";
import type { AvatarDirective } from "@/lib/avatar/types";

export const EMPTY_AVATAR_DIRECTIVE: AvatarDirective = {
  bubble: "",
  speak: false,
  action: "idle",
  emotion: "neutral",
  lookAt: "thread_center",
  moveTo: "left",
  locomotion: "idle",
  priority: "low",
  bubbleTheme: {
    borderColor: "#d9e4ff",
    textColor: "#1f2937",
    backgroundFrom: "#f8fbff",
    backgroundTo: "#eef4ff",
    glowColor: "rgba(94, 151, 255, 0.28)",
  },
  source: "heuristic",
};

type AvatarShellStore = {
  directive: AvatarDirective;
  setDirective: (directive: AvatarDirective) => void;
};

export const useAvatarShellStore = create<AvatarShellStore>((set) => ({
  directive: EMPTY_AVATAR_DIRECTIVE,
  setDirective: (directive) => set({ directive }),
}));

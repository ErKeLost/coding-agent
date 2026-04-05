"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const DEFAULT_MODEL_ID = "openrouter/openai/gpt-5.4-nano";
const MODEL_STORAGE_KEY = "chat-selected-model";
const LEGACY_DEFAULT_MODEL_IDS = new Set([
  "openrouter/qwen/qwen3.6-plus:free",
  "openrouter/z-ai/glm-5v-turbo",
  "openrouter/openai/gpt-5.4-mini",
]);

type ReasoningOpenState = Record<string, boolean>;
type ReasoningStateUpdater =
  | ReasoningOpenState
  | ((previous: ReasoningOpenState) => ReasoningOpenState);

type WorkspaceShellStore = {
  model: string;
  modelDialogOpen: boolean;
  gitDialogOpen: boolean;
  terminalExpanded: boolean;
  reasoningOpenState: ReasoningOpenState;
  setModel: (model: string) => void;
  setModelDialogOpen: (open: boolean) => void;
  setGitDialogOpen: (open: boolean) => void;
  setTerminalExpanded: (
    expanded: boolean | ((current: boolean) => boolean),
  ) => void;
  setReasoningOpenState: (updater: ReasoningStateUpdater) => void;
  resetReasoningOpenState: () => void;
};

const normalizeModelSelection = (value: string | undefined) => {
  if (!value?.trim()) return DEFAULT_MODEL_ID;
  return LEGACY_DEFAULT_MODEL_IDS.has(value) ? DEFAULT_MODEL_ID : value;
};

export const useWorkspaceShellStore = create<WorkspaceShellStore>()(
  persist(
    (set) => ({
      model: DEFAULT_MODEL_ID,
      modelDialogOpen: false,
      gitDialogOpen: false,
      terminalExpanded: false,
      reasoningOpenState: {},
      setModel: (model) => set({ model }),
      setModelDialogOpen: (modelDialogOpen) => set({ modelDialogOpen }),
      setGitDialogOpen: (gitDialogOpen) => set({ gitDialogOpen }),
      setTerminalExpanded: (terminalExpanded) =>
        set((state) => ({
          terminalExpanded:
            typeof terminalExpanded === "function"
              ? terminalExpanded(state.terminalExpanded)
              : terminalExpanded,
        })),
      setReasoningOpenState: (updater) =>
        set((state) => ({
          reasoningOpenState:
            typeof updater === "function"
              ? updater(state.reasoningOpenState)
              : updater,
        })),
      resetReasoningOpenState: () => set({ reasoningOpenState: {} }),
    }),
    {
      name: "rovix-workspace-shell",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        model: state.model,
      }),
      merge: (persistedState, currentState) => {
        const persisted =
          (persistedState as Partial<WorkspaceShellStore> | undefined) ?? {};
        return {
          ...currentState,
          ...persisted,
          model: normalizeModelSelection(
            typeof persisted.model === "string"
              ? persisted.model
              : currentState.model,
          ),
        };
      },
    },
  ),
);
